#[cfg(windows)]
mod capture;
mod processes;
mod wav;

use serde_json::{Value, json};
use std::fmt::Display;
use std::io::{self, Write};
use std::path::{Path, PathBuf};

const USAGE: &str = "usage: agent-board-call-capture list | record --pid <pid> --them <wav> --me <wav> | repair <wav>";

fn emit(event: Value) {
    // A closed stdout means the board is gone. The 5-second header rewrite keeps the files valid.
    let _ = writeln!(io::stdout(), "{event}");
}

fn error(code: &str, message: impl Display) -> Value {
    json!({ "event": "error", "code": code, "message": message.to_string() })
}

fn write_error(err: &io::Error) -> Value {
    const ERROR_HANDLE_DISK_FULL: i32 = 39;
    const ERROR_DISK_FULL: i32 = 112;
    let full = matches!(
        err.raw_os_error(),
        Some(ERROR_HANDLE_DISK_FULL | ERROR_DISK_FULL)
    );
    error(if full { "disk_full" } else { "write_failed" }, err)
}

fn round1(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

fn parse_record(args: &[&str]) -> Option<(u32, PathBuf, PathBuf)> {
    let (mut pid, mut them, mut me) = (None, None, None);
    for pair in args.chunks(2) {
        match pair {
            ["--pid", value] => pid = value.parse().ok(),
            ["--them", value] => them = Some(PathBuf::from(value)),
            ["--me", value] => me = Some(PathBuf::from(value)),
            _ => return None,
        }
    }
    Some((pid?, them?, me?))
}

fn repair(path: &str) -> i32 {
    match wav::repair(Path::new(path)) {
        Ok(seconds) => {
            emit(json!({ "event": "repaired", "seconds": round1(seconds) }));
            0
        }
        Err(err) if err.kind() == io::ErrorKind::InvalidData => {
            emit(error("invalid_wav", err));
            1
        }
        Err(err) => {
            emit(write_error(&err));
            1
        }
    }
}

#[cfg(not(windows))]
mod capture {
    pub fn list() -> i32 {
        super::emit(super::error(
            "unsupported_build",
            "Capture runs on Windows only",
        ));
        1
    }

    pub fn record(_pid: u32, _them: &std::path::Path, _me: &std::path::Path) -> i32 {
        list()
    }
}

fn usage() -> i32 {
    eprintln!("{USAGE}");
    2
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let args: Vec<&str> = args.iter().map(String::as_str).collect();
    let code = match args.as_slice() {
        ["list"] => capture::list(),
        ["record", rest @ ..] => parse_record(rest)
            .map_or_else(usage, |(pid, them, me)| capture::record(pid, &them, &me)),
        ["repair", path] => repair(path),
        _ => usage(),
    };
    std::process::exit(code);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_record_takes_the_three_flags_in_any_order() {
        assert_eq!(
            parse_record(&["--me", "me.wav", "--pid", "42", "--them", "them.wav"]),
            Some((42, "them.wav".into(), "me.wav".into()))
        );
        for bad in [
            &["--pid", "abc", "--them", "a.wav", "--me", "b.wav"][..],
            &["--pid", "42", "--them", "a.wav"],
            &["--pid", "42", "--them", "a.wav", "--me"],
            &[
                "--pid", "42", "--them", "a.wav", "--me", "b.wav", "--mic", "x",
            ],
        ] {
            assert_eq!(parse_record(bad), None, "{bad:?}");
        }
    }
}
