// Ports the activation and capture loop of Microsoft's ApplicationLoopback sample. See THIRD_PARTY_NOTICES.md.
use crate::processes::{self, Process};
use crate::wav::{self, SAMPLE_RATE, Track, WavWriter};
use crate::{emit, error, round1, write_error};
use serde_json::json;
use std::collections::HashMap;
use std::io::{self, BufRead};
use std::mem::ManuallyDrop;
use std::path::Path;
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};
use windows::Wdk::System::SystemServices::RtlGetVersion;
use windows::Win32::Foundation::{
    CloseHandle, E_UNEXPECTED, HANDLE, HWND, LPARAM, WAIT_OBJECT_0, WAIT_TIMEOUT,
};
use windows::Win32::Media::Audio::*;
use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
use windows::Win32::System::Com::StructuredStorage::{
    PROPVARIANT, PROPVARIANT_0, PROPVARIANT_0_0, PROPVARIANT_0_0_0,
};
use windows::Win32::System::Com::{
    BLOB, CLSCTX_ALL, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx,
};
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW, TH32CS_SNAPPROCESS,
};
use windows::Win32::System::SystemInformation::OSVERSIONINFOW;
use windows::Win32::System::Threading::{
    CreateEventW, OpenProcess, PROCESS_SYNCHRONIZE, WaitForMultipleObjects, WaitForSingleObject,
};
use windows::Win32::System::Variant::VT_BLOB;
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
};
use windows_core::{BOOL, HSTRING, Interface, PCWSTR, Ref, implement};

const PROTOCOL: u32 = 1;
const MIN_BUILD: u32 = 20348;
const MIN_FREE_BYTES: u64 = 2 << 30;
const BUFFER_HNS: i64 = 2_000_000;
const WAKE_MS: u32 = 100;
const ACTIVATE_TIMEOUT: Duration = Duration::from_secs(10);
const HEADER_EVERY: Duration = Duration::from_secs(5);
const MIC_RETRY: Duration = Duration::from_secs(2);
const MIC_GONE: &str = "The microphone is unavailable, so the helper records only the app's audio";

fn build() -> u32 {
    let mut info = OSVERSIONINFOW {
        dwOSVersionInfoSize: size_of::<OSVERSIONINFOW>() as u32,
        ..Default::default()
    };
    let _ = unsafe { RtlGetVersion(&mut info) };
    info.dwBuildNumber
}

pub fn list() -> i32 {
    let build = build();
    let processes = snapshot();
    let roots: Vec<_> = processes::roots(&processes)
        .into_iter()
        .map(|p| json!({ "exe": p.exe, "pid": p.pid, "title": p.title }))
        .collect();
    emit(json!({
        "protocol": PROTOCOL,
        "build": build,
        "supported": build >= MIN_BUILD,
        "processes": roots,
    }));
    0
}

fn snapshot() -> Vec<Process> {
    let titles = window_titles();
    let mut out = Vec::new();
    unsafe {
        let Ok(snap) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else {
            return out;
        };
        let mut entry = PROCESSENTRY32W {
            dwSize: size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };
        let mut more = Process32FirstW(snap, &mut entry).is_ok();
        while more {
            let name = &entry.szExeFile;
            let len = name.iter().position(|&c| c == 0).unwrap_or(name.len());
            out.push(Process {
                pid: entry.th32ProcessID,
                parent: entry.th32ParentProcessID,
                exe: String::from_utf16_lossy(&name[..len]),
                title: titles
                    .get(&entry.th32ProcessID)
                    .cloned()
                    .unwrap_or_default(),
            });
            more = Process32NextW(snap, &mut entry).is_ok();
        }
        let _ = CloseHandle(snap);
    }
    out
}

fn window_titles() -> HashMap<u32, String> {
    unsafe extern "system" fn each(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let titles = unsafe { &mut *(lparam.0 as *mut HashMap<u32, String>) };
        let mut text = [0u16; 256];
        unsafe {
            if IsWindowVisible(hwnd).as_bool() {
                let len = GetWindowTextW(hwnd, &mut text);
                if len > 0 {
                    let mut pid = 0;
                    GetWindowThreadProcessId(hwnd, Some(&mut pid));
                    titles
                        .entry(pid)
                        .or_insert_with(|| String::from_utf16_lossy(&text[..len as usize]));
                }
            }
        }
        true.into()
    }
    let mut titles = HashMap::new();
    let _ = unsafe { EnumWindows(Some(each), LPARAM(&mut titles as *mut _ as isize)) };
    titles
}

fn free_bytes(path: &Path) -> windows_core::Result<u64> {
    let dir = path
        .parent()
        .filter(|dir| !dir.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let mut free = 0;
    unsafe { GetDiskFreeSpaceExW(&HSTRING::from(dir), Some(&mut free), None, None) }?;
    Ok(free)
}

#[implement(IActivateAudioInterfaceCompletionHandler)]
struct Activated(mpsc::SyncSender<()>);

impl IActivateAudioInterfaceCompletionHandler_Impl for Activated_Impl {
    fn ActivateCompleted(
        &self,
        _operation: Ref<IActivateAudioInterfaceAsyncOperation>,
    ) -> windows_core::Result<()> {
        let _ = self.0.try_send(());
        Ok(())
    }
}

struct Stream {
    client: IAudioClient,
    capture: IAudioCaptureClient,
    event: HANDLE,
}

impl Stream {
    fn loopback(pid: u32) -> windows_core::Result<Self> {
        let mut params = AUDIOCLIENT_ACTIVATION_PARAMS {
            ActivationType: AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK,
            Anonymous: AUDIOCLIENT_ACTIVATION_PARAMS_0 {
                ProcessLoopbackParams: AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS {
                    TargetProcessId: pid,
                    ProcessLoopbackMode: PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE,
                },
            },
        };
        // ManuallyDrop, because clearing this PROPVARIANT would free a blob that lives on the stack.
        let prop = ManuallyDrop::new(PROPVARIANT {
            Anonymous: PROPVARIANT_0 {
                Anonymous: ManuallyDrop::new(PROPVARIANT_0_0 {
                    vt: VT_BLOB,
                    Anonymous: PROPVARIANT_0_0_0 {
                        blob: BLOB {
                            cbSize: size_of::<AUDIOCLIENT_ACTIVATION_PARAMS>() as u32,
                            pBlobData: (&raw mut params).cast(),
                        },
                    },
                    ..Default::default()
                }),
            },
        });
        let (done, activated) = mpsc::sync_channel(1);
        let handler: IActivateAudioInterfaceCompletionHandler = Activated(done).into();
        let client = unsafe {
            let operation = ActivateAudioInterfaceAsync(
                VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
                &IAudioClient::IID,
                Some(&*prop),
                &handler,
            )?;
            activated.recv_timeout(ACTIVATE_TIMEOUT).map_err(|_| {
                windows_core::Error::new(E_UNEXPECTED, "Audio activation timed out")
            })?;
            let mut result = Default::default();
            let mut unknown = None;
            operation.GetActivateResult(&mut result, &mut unknown)?;
            result.ok()?;
            unknown.ok_or(E_UNEXPECTED)?.cast::<IAudioClient>()?
        };
        Self::start(client, AUDCLNT_STREAMFLAGS_LOOPBACK)
    }

    fn microphone() -> windows_core::Result<Self> {
        let client = unsafe {
            let devices: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            let device = devices.GetDefaultAudioEndpoint(eCapture, eCommunications)?;
            device.Activate::<IAudioClient>(CLSCTX_ALL, None)?
        };
        Self::start(client, 0)
    }

    fn start(client: IAudioClient, flags: u32) -> windows_core::Result<Self> {
        let format = WAVEFORMATEX {
            wFormatTag: WAVE_FORMAT_PCM as u16,
            nChannels: 1,
            nSamplesPerSec: SAMPLE_RATE,
            nAvgBytesPerSec: SAMPLE_RATE * 2,
            nBlockAlign: 2,
            wBitsPerSample: 16,
            cbSize: 0,
        };
        unsafe {
            client.Initialize(
                AUDCLNT_SHAREMODE_SHARED,
                flags
                    | AUDCLNT_STREAMFLAGS_EVENTCALLBACK
                    | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM
                    | AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY,
                BUFFER_HNS,
                0,
                &format,
                None,
            )?;
            let capture = client.GetService()?;
            let event = CreateEventW(None, false, false, PCWSTR::null())?;
            let stream = Self {
                capture,
                client,
                event,
            };
            stream.client.SetEventHandle(event)?;
            stream.client.Start()?;
            Ok(stream)
        }
    }

    fn drain(&self, out: &mut Vec<i16>) -> windows_core::Result<()> {
        out.clear();
        unsafe {
            while self.capture.GetNextPacketSize()? > 0 {
                let (mut data, mut frames, mut flags) = (std::ptr::null_mut(), 0, 0);
                self.capture
                    .GetBuffer(&mut data, &mut frames, &mut flags, None, None)?;
                if data.is_null() || flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32 != 0 {
                    out.resize(out.len() + frames as usize, 0);
                } else {
                    out.extend_from_slice(std::slice::from_raw_parts(data.cast(), frames as usize));
                }
                self.capture.ReleaseBuffer(frames)?;
            }
        }
        Ok(())
    }
}

impl Drop for Stream {
    fn drop(&mut self) {
        unsafe {
            let _ = self.client.Stop();
            let _ = CloseHandle(self.event);
        }
    }
}

fn warning(code: &str, message: &str) {
    emit(json!({ "event": "warning", "code": code, "message": message }));
}

fn stdin_watch() -> mpsc::Receiver<&'static str> {
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        for line in io::stdin().lock().lines() {
            match line {
                Ok(line) if line.trim() == "stop" => {
                    let _ = tx.send("stop");
                    return;
                }
                Ok(_) => {}
                Err(_) => break,
            }
        }
        let _ = tx.send("stdin_closed");
    });
    rx
}

pub fn record(pid: u32, them_path: &Path, me_path: &Path) -> i32 {
    let build = build();
    if build < MIN_BUILD {
        emit(error(
            "unsupported_build",
            format!(
                "Windows build {build} is older than {MIN_BUILD}, the first with per-app capture"
            ),
        ));
        return 1;
    }
    let target = match unsafe { OpenProcess(PROCESS_SYNCHRONIZE, false, pid) } {
        Ok(handle) if unsafe { WaitForSingleObject(handle, 0) } == WAIT_TIMEOUT => handle,
        _ => {
            emit(error(
                "target_not_found",
                format!("No running process has pid {pid}"),
            ));
            return 1;
        }
    };
    let (mut them, mut me) = match (WavWriter::create(them_path), WavWriter::create(me_path)) {
        (Ok(them), Ok(me)) => (Track::new(them), Track::new(me)),
        (Err(err), _) | (_, Err(err)) => {
            emit(write_error(&err));
            return 1;
        }
    };
    match free_bytes(them_path) {
        Ok(free) if free >= MIN_FREE_BYTES => {}
        Ok(_) => {
            emit(error(
                "disk_full",
                "Recording needs 2 GB free on the drive that holds it",
            ));
            return 1;
        }
        Err(err) => {
            emit(error("write_failed", err));
            return 1;
        }
    }
    let loopback = match unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }
        .ok()
        .and_then(|()| Stream::loopback(pid))
    {
        Ok(stream) => stream,
        Err(err) => {
            emit(error("activation_failed", err));
            return 1;
        }
    };
    let mut mic = Stream::microphone().ok();
    let stdin = stdin_watch();
    let start = Instant::now();
    let now = || (start.elapsed().as_secs_f64() * f64::from(SAMPLE_RATE)) as u64;
    let (mut next_level, mut next_header, mut next_mic) = (1, HEADER_EVERY, MIC_RETRY);
    let mut packet = Vec::new();
    let exe = snapshot().into_iter().find(|p| p.pid == pid).map(|p| p.exe);
    emit(
        json!({ "event": "started", "protocol": PROTOCOL, "sampleRate": SAMPLE_RATE, "exe": exe }),
    );
    if mic.is_none() {
        warning("mic_unavailable", MIC_GONE);
    }

    let ended = loop {
        let mut handles = vec![target, loopback.event];
        handles.extend(mic.as_ref().map(|mic| mic.event));
        if unsafe { WaitForMultipleObjects(&handles, false, WAKE_MS) } == WAIT_OBJECT_0 {
            break Ok("target_exited");
        }
        if let Ok(reason) = stdin.try_recv() {
            break Ok(reason);
        }
        if let Err(err) = loopback.drain(&mut packet) {
            break Err(error("activation_failed", err));
        }
        if let Err(err) = them.append(&packet, now()) {
            break Err(write_error(&err));
        }
        let mic_lost = mic
            .as_ref()
            .is_some_and(|stream| stream.drain(&mut packet).is_err());
        if mic_lost {
            mic = None;
        }
        if mic.is_none() {
            packet.clear();
            if mic_lost || start.elapsed() >= next_mic {
                mic = Stream::microphone().ok();
                next_mic = start.elapsed() + MIC_RETRY;
                if mic.is_some() {
                    warning(
                        "mic_reopened",
                        "The microphone is back, and the gap is silence",
                    );
                } else if mic_lost {
                    warning("mic_unavailable", MIC_GONE);
                }
            }
        }
        if let Err(err) = me.append(&packet, now()) {
            break Err(write_error(&err));
        }
        let elapsed = start.elapsed();
        if elapsed.as_secs() >= next_level {
            emit(
                json!({ "event": "level", "t": next_level, "me": me.take_level(), "them": them.take_level() }),
            );
            next_level = elapsed.as_secs() + 1;
        }
        if elapsed >= next_header {
            if let Err(err) = them.wav.sync_header().and_then(|()| me.wav.sync_header()) {
                break Err(write_error(&err));
            }
            next_header = elapsed + HEADER_EVERY;
        }
    };

    let _ = unsafe { CloseHandle(target) };
    let mut tracks = [them, me];
    let finished = match ended {
        Ok(reason) => wav::finish(&mut tracks, now())
            .map(|end| (reason, end))
            .map_err(|err| write_error(&err)),
        Err(event) => Err(event),
    };
    match finished {
        Ok((reason, end)) => {
            emit(
                json!({ "event": "stopped", "reason": reason, "seconds": round1(end as f64 / f64::from(SAMPLE_RATE)) }),
            );
            0
        }
        Err(event) => {
            // A failed write can leave the last header stale, and repair needs no free space.
            drop(tracks);
            let repaired = [them_path, me_path].map(|path| wav::repair(path).unwrap_or(0.0));
            emit(event);
            emit(
                json!({ "event": "stopped", "reason": "error", "seconds": round1(repaired[0].max(repaired[1])) }),
            );
            1
        }
    }
}
