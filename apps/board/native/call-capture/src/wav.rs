use std::fs::{File, OpenOptions};
use std::io::{self, BufWriter, Read, Seek, SeekFrom, Write};
use std::path::Path;

pub const SAMPLE_RATE: u32 = 16_000;
const HEADER_LEN: u64 = 44;
const BYTES_PER_SAMPLE: u64 = 2;

/// The canonical 44-byte header of a 16 kHz mono s16le WAV holding `data_bytes` of samples.
pub fn header(data_bytes: u64) -> [u8; 44] {
    let data = u32::try_from(data_bytes).unwrap_or(u32::MAX - 36);
    let byte_rate = SAMPLE_RATE * BYTES_PER_SAMPLE as u32;
    let mut out = [0u8; 44];
    out[0..4].copy_from_slice(b"RIFF");
    out[4..8].copy_from_slice(&(data + 36).to_le_bytes());
    out[8..16].copy_from_slice(b"WAVEfmt ");
    out[16..20].copy_from_slice(&16u32.to_le_bytes());
    out[20..22].copy_from_slice(&1u16.to_le_bytes());
    out[22..24].copy_from_slice(&1u16.to_le_bytes());
    out[24..28].copy_from_slice(&SAMPLE_RATE.to_le_bytes());
    out[28..32].copy_from_slice(&byte_rate.to_le_bytes());
    out[32..34].copy_from_slice(&(BYTES_PER_SAMPLE as u16).to_le_bytes());
    out[34..36].copy_from_slice(&16u16.to_le_bytes());
    out[36..40].copy_from_slice(b"data");
    out[40..44].copy_from_slice(&data.to_le_bytes());
    out
}

pub struct WavWriter {
    file: BufWriter<File>,
    samples: u64,
}

impl WavWriter {
    pub fn create(path: &Path) -> io::Result<Self> {
        let mut file = BufWriter::new(File::create(path)?);
        file.write_all(&header(0))?;
        file.flush()?;
        Ok(Self { file, samples: 0 })
    }

    pub fn write(&mut self, samples: &[i16]) -> io::Result<()> {
        for sample in samples {
            self.file.write_all(&sample.to_le_bytes())?;
        }
        self.samples += samples.len() as u64;
        Ok(())
    }

    pub fn pad(&mut self, samples: u64) -> io::Result<()> {
        const SILENCE: [u8; 4096] = [0; 4096];
        let mut left = samples * BYTES_PER_SAMPLE;
        while left > 0 {
            let n = left.min(SILENCE.len() as u64) as usize;
            self.file.write_all(&SILENCE[..n])?;
            left -= n as u64;
        }
        self.samples += samples;
        Ok(())
    }

    pub fn samples(&self) -> u64 {
        self.samples
    }

    /// Makes the file on disk a valid WAV of everything written so far.
    pub fn sync_header(&mut self) -> io::Result<()> {
        self.file.flush()?;
        let file = self.file.get_mut();
        file.seek(SeekFrom::Start(0))?;
        file.write_all(&header(self.samples * BYTES_PER_SAMPLE))?;
        file.seek(SeekFrom::End(0))?;
        Ok(())
    }
}

/// Rewrites the sizes of a WAV whose writer died, from the file length cut to whole samples.
pub fn repair(path: &Path) -> io::Result<f64> {
    let mut file = OpenOptions::new().read(true).write(true).open(path)?;
    let mut existing = [0u8; 44];
    let ours = file.read_exact(&mut existing).is_ok()
        && existing[..4] == header(0)[..4]
        && existing[8..40] == header(0)[8..40];
    if !ours {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "not a 16 kHz mono 16-bit WAV written by this helper",
        ));
    }
    let data = (file.metadata()?.len() - HEADER_LEN) / BYTES_PER_SAMPLE * BYTES_PER_SAMPLE;
    file.set_len(HEADER_LEN + data)?;
    file.seek(SeekFrom::Start(0))?;
    file.write_all(&header(data))?;
    file.sync_all()?;
    Ok(data as f64 / (SAMPLE_RATE as u64 * BYTES_PER_SAMPLE) as f64)
}

#[cfg(test)]
mod tests {
    use super::*;

    const HEADER_ONE_SECOND: [u8; 44] = [
        b'R', b'I', b'F', b'F', 0x24, 0x7d, 0x00, 0x00, b'W', b'A', b'V', b'E', //
        b'f', b'm', b't', b' ', 16, 0, 0, 0, 1, 0, 1, 0, //
        0x80, 0x3e, 0x00, 0x00, 0x00, 0x7d, 0x00, 0x00, 2, 0, 16, 0, //
        b'd', b'a', b't', b'a', 0x00, 0x7d, 0x00, 0x00,
    ];

    fn temp(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("call-capture-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir.join(name)
    }

    #[test]
    fn header_for_one_second_is_the_canonical_44_bytes() {
        assert_eq!(header(32_000), HEADER_ONE_SECOND);
    }

    #[test]
    fn writer_writes_samples_and_silence_after_the_header() {
        let path = temp("writer.wav");
        let mut wav = WavWriter::create(&path).unwrap();
        wav.write(&[1, -2]).unwrap();
        wav.pad(15_998).unwrap();
        wav.sync_header().unwrap();
        assert_eq!(wav.samples(), 16_000);
        drop(wav);
        let bytes = std::fs::read(&path).unwrap();
        assert_eq!(bytes.len(), 44 + 32_000);
        assert_eq!(bytes[..44], HEADER_ONE_SECOND);
        assert_eq!(bytes[44..48], [1, 0, 0xfe, 0xff]);
        assert!(bytes[48..].iter().all(|&b| b == 0));
    }

    #[test]
    fn repair_rewrites_the_header_of_a_truncated_file_from_its_length() {
        let path = temp("crashed.wav");
        let mut bytes = header(0).to_vec();
        bytes.extend(std::iter::repeat_n(7u8, 32_001));
        std::fs::write(&path, &bytes).unwrap();
        assert_eq!(repair(&path).unwrap(), 1.0);
        let bytes = std::fs::read(&path).unwrap();
        assert_eq!(bytes.len(), 44 + 32_000);
        assert_eq!(bytes[..44], HEADER_ONE_SECOND);
    }

    #[test]
    fn repair_refuses_a_file_that_is_not_a_wav() {
        let path = temp("short.wav");
        std::fs::write(&path, b"RIFF").unwrap();
        assert_eq!(
            repair(&path).unwrap_err().kind(),
            io::ErrorKind::InvalidData
        );
    }
}
