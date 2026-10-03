// 언어 서버 프로세스 (InitialEditor 이슈 #53 단계 1, docs/plans/language-server.md).
// 앱에 든 LuaLS 를 프로젝트 루트에서 띄운다. stdout 의 LSP 메시지는 Content-Length 머리로 나눠 본문(JSON 문자열)만
// 콜백에 넘기고, 쓰기는 머리를 붙여 stdin 에 쓴다. 셸(commands.rs)은 콜백을 프런트의 채널(tauri::ipc::Channel)로 잇는다.
// 서버는 id 로 관리하고, 앱이 끝날 때 남은 서버를 모두 끝낸다 (lib.rs 의 RunEvent::Exit).

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde::Serialize;

use crate::error::{BackendError, ErrorCode, Result};
use crate::fsutil::lock;

/// 번들 리소스 안의 LuaLS 폴더 (scripts/fetch-luals.mjs 가 src-tauri/luals 에 두고 tauri.dist.conf.json 이 싣는다)
pub const LUALS_DIR: &str = "luals";
/// 실행 파일 경로를 직접 줄 때 (개발과 시험)
pub const LUALS_ENV: &str = "INITIAL_EDITOR_LUALS";
const LUALS_EXE: &str = if cfg!(windows) {
    "lua-language-server.exe"
} else {
    "lua-language-server"
};
/// stderr 는 끝날 때 알리는 마지막 몇 줄만 남긴다
const STDERR_TAIL: usize = 20;
/// 머리 한 줄의 최대 길이. 넘으면 스트림이 깨진 것으로 본다
const MAX_HEADER_LINE: usize = 1024;
/// 메시지 한 개의 최대 크기 (64 MiB)
const MAX_BODY: usize = 64 << 20;

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LspEvent {
    /// 서버가 보낸 메시지 하나 (JSON 문자열)
    Message { text: String },
    /// 서버가 끝났다. 시그널로 죽었으면 code 는 null
    Exit {
        code: Option<i32>,
        stderr: Vec<String>,
    },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LspInfo {
    pub id: u32,
    pub pid: u32,
    /// 띄운 실행 파일
    pub exe: String,
    /// 같은 폴더의 luals.json 에서 읽은 판 (없으면 null)
    pub version: Option<String>,
    /// lsp_start 가 앱 캐시에 쓴 엔진 API 스텁의 절대 경로 (프로젝트에 스텁이 없을 때)
    pub library: Option<String>,
}

struct Server {
    child: Arc<Mutex<Child>>,
    stdin: Arc<Mutex<Option<ChildStdin>>>,
    exited: Arc<AtomicBool>,
}

#[derive(Default)]
pub struct LspState {
    next_id: AtomicU32,
    servers: Mutex<HashMap<u32, Server>>,
}

/// LSP 스트림에서 메시지 하나를 읽는다. 스트림이 머리 앞에서 끝나면 Ok(None)
pub fn read_message(reader: &mut impl BufRead) -> std::io::Result<Option<Vec<u8>>> {
    let mut length: Option<usize> = None;
    let mut line = Vec::new();
    let mut saw_header = false;
    loop {
        line.clear();
        let n = reader
            .by_ref()
            .take(MAX_HEADER_LINE as u64)
            .read_until(b'\n', &mut line)?;
        if n == 0 {
            if saw_header {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::UnexpectedEof,
                    "LSP 헤더 도중에 스트림이 종료되었습니다",
                ));
            }
            return Ok(None);
        }
        if line.last() != Some(&b'\n') {
            return Err(invalid("LSP 헤더 줄이 너무 깁니다"));
        }
        while matches!(line.last(), Some(b'\n') | Some(b'\r')) {
            line.pop();
        }
        if line.is_empty() {
            if !saw_header {
                // 메시지 사이의 빈 줄은 건너뛴다
                continue;
            }
            break;
        }
        saw_header = true;
        let text = String::from_utf8_lossy(&line);
        if let Some((name, value)) = text.split_once(':') {
            if name.trim().eq_ignore_ascii_case("content-length") {
                let n: usize = value
                    .trim()
                    .parse()
                    .map_err(|_| invalid("Content-Length 가 숫자가 아닙니다"))?;
                if n > MAX_BODY {
                    return Err(invalid("LSP 메시지가 너무 큽니다"));
                }
                length = Some(n);
            }
        }
    }
    let n = length.ok_or_else(|| invalid("Content-Length 헤더가 없습니다"))?;
    let mut body = vec![0; n];
    reader.read_exact(&mut body)?;
    Ok(Some(body))
}

/// 본문에 머리를 붙인 바이트
pub fn frame(text: &str) -> Vec<u8> {
    let mut out = format!("Content-Length: {}\r\n\r\n", text.len()).into_bytes();
    out.extend_from_slice(text.as_bytes());
    out
}

fn invalid(message: &str) -> std::io::Error {
    std::io::Error::new(std::io::ErrorKind::InvalidData, message)
}

/// LuaLS 실행 파일을 찾는다: 환경 변수, 번들 리소스, 개발 빌드면 src-tauri/luals
pub fn find_luals(resource_dir: Option<&Path>) -> Option<PathBuf> {
    if let Ok(path) = std::env::var(LUALS_ENV) {
        if !path.trim().is_empty() {
            return Some(PathBuf::from(path));
        }
    }
    let mut candidates = Vec::new();
    if let Some(dir) = resource_dir {
        candidates.push(dir.join(LUALS_DIR));
    }
    if cfg!(debug_assertions) {
        candidates.push(Path::new(env!("CARGO_MANIFEST_DIR")).join(LUALS_DIR));
    }
    candidates
        .into_iter()
        .map(|dir| dir.join("bin").join(LUALS_EXE))
        .find(|exe| exe.is_file())
}

/// 실행 파일의 두 단계 위(배포 폴더)의 luals.json 의 version
pub fn read_version(exe: &Path) -> Option<String> {
    let root = exe.parent()?.parent()?;
    let text = std::fs::read_to_string(root.join("luals.json")).ok()?;
    let value: serde_json::Value = serde_json::from_str(&text).ok()?;
    value.get("version")?.as_str().map(str::to_string)
}

impl LspState {
    /// 서버를 띄운다. on_event 는 메시지마다, 마지막에 Exit 를 한 번 받는다
    pub fn spawn(
        self: &Arc<Self>,
        exe: &Path,
        cwd: &Path,
        args: &[String],
        on_event: impl Fn(LspEvent) + Send + Sync + 'static,
    ) -> Result<LspInfo> {
        let exe_text = exe.to_string_lossy().into_owned();
        if !exe.is_file() {
            return Err(BackendError::with_path(
                ErrorCode::NotFound,
                format!("언어 서버 실행 파일 없음: {exe_text}"),
                exe_text,
            ));
        }
        if !cwd.is_dir() {
            let cwd_text = cwd.to_string_lossy().into_owned();
            return Err(BackendError::with_path(
                ErrorCode::NotFound,
                format!("작업 폴더 없음: {cwd_text}"),
                cwd_text,
            ));
        }
        let mut command = Command::new(exe);
        command
            .args(args)
            .current_dir(cwd)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            // 콘솔 창을 띄우지 않는다 (CREATE_NO_WINDOW)
            command.creation_flags(0x0800_0000);
        }
        let mut child = command.spawn().map_err(|e| {
            BackendError::with_path(
                ErrorCode::Io,
                format!("언어 서버 실행 실패 ({exe_text}): {e}"),
                exe_text.clone(),
            )
        })?;
        let id = self.next_id.fetch_add(1, Ordering::Relaxed) + 1;
        let pid = child.id();
        let stdin = child.stdin.take();
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let on_event = Arc::new(on_event);

        let out_cb = Arc::clone(&on_event);
        let out_thread = thread::spawn(move || {
            let Some(stdout) = stdout else { return };
            let mut reader = BufReader::new(stdout);
            loop {
                match read_message(&mut reader) {
                    Ok(Some(body)) => out_cb(LspEvent::Message {
                        text: String::from_utf8_lossy(&body).into_owned(),
                    }),
                    Ok(None) => break,
                    Err(e) => {
                        eprintln!("[initial-editor] 언어 서버 출력 읽기 실패: {e}");
                        break;
                    }
                }
            }
        });
        let tail = Arc::new(Mutex::new(Vec::<String>::new()));
        let err_tail = Arc::clone(&tail);
        let err_thread = thread::spawn(move || {
            let Some(stderr) = stderr else { return };
            for line in BufReader::new(stderr).lines() {
                let Ok(line) = line else { break };
                let mut tail = lock(&err_tail);
                if tail.len() == STDERR_TAIL {
                    tail.remove(0);
                }
                tail.push(line);
            }
        });

        let server = Server {
            child: Arc::new(Mutex::new(child)),
            stdin: Arc::new(Mutex::new(stdin)),
            exited: Arc::new(AtomicBool::new(false)),
        };
        let child = Arc::clone(&server.child);
        let exited = Arc::clone(&server.exited);
        lock(&self.servers).insert(id, server);

        let state = Arc::clone(self);
        thread::spawn(move || {
            let code = loop {
                let status = lock(&child).try_wait();
                match status {
                    Ok(Some(status)) => break status.code(),
                    Ok(None) => thread::sleep(Duration::from_millis(50)),
                    Err(_) => break None,
                }
            };
            exited.store(true, Ordering::SeqCst);
            let _ = out_thread.join();
            let _ = err_thread.join();
            lock(&state.servers).remove(&id);
            let stderr = lock(&tail).clone();
            on_event(LspEvent::Exit { code, stderr });
        });

        Ok(LspInfo {
            id,
            pid,
            exe: exe_text,
            version: read_version(exe),
            library: None,
        })
    }

    /// 메시지 하나를 서버의 stdin 에 쓴다
    pub fn send(&self, id: u32, text: &str) -> Result<()> {
        let stdin = lock(&self.servers)
            .get(&id)
            .map(|s| Arc::clone(&s.stdin))
            .ok_or_else(|| {
                BackendError::new(ErrorCode::NotFound, format!("언어 서버 {id} 없음"))
            })?;
        let mut guard = lock(&stdin);
        let pipe = guard.as_mut().ok_or_else(|| {
            BackendError::new(ErrorCode::Io, format!("언어 서버 {id} 의 입력이 닫혔습니다"))
        })?;
        pipe.write_all(&frame(text))
            .and_then(|_| pipe.flush())
            .map_err(|e| {
                BackendError::new(ErrorCode::Io, format!("언어 서버 {id} 에 쓰기 실패: {e}"))
            })
    }

    /// 서버를 끝낸다: 입력을 닫고 잠깐 기다린 뒤 남아 있으면 kill. 모르는 id 면 아무것도 하지 않는다
    pub fn stop(&self, id: u32) {
        let Some((child, stdin, exited)) = lock(&self.servers).get(&id).map(|s| {
            (
                Arc::clone(&s.child),
                Arc::clone(&s.stdin),
                Arc::clone(&s.exited),
            )
        }) else {
            return;
        };
        lock(&stdin).take();
        for _ in 0..40 {
            if exited.load(Ordering::SeqCst) {
                return;
            }
            thread::sleep(Duration::from_millis(25));
        }
        let _ = lock(&child).kill();
    }

    /// 남은 서버를 모두 바로 끝낸다 (앱 종료)
    pub fn kill_all(&self) {
        let servers: Vec<_> = lock(&self.servers)
            .values()
            .map(|s| Arc::clone(&s.child))
            .collect();
        for child in servers {
            let _ = lock(&child).kill();
        }
    }

    pub fn running_ids(&self) -> Vec<u32> {
        lock(&self.servers).keys().copied().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn reads_framed_messages() {
        let mut bytes = frame(r#"{"a":1}"#);
        bytes.extend(b"Content-Type: application/vscode-jsonrpc; charset=utf-8\r\ncontent-length: 11\r\n\r\n{\"b\":\"\xed\x95\x9c\"}");
        let mut reader = Cursor::new(bytes);
        assert_eq!(read_message(&mut reader).unwrap().unwrap(), br#"{"a":1}"#);
        assert_eq!(
            String::from_utf8(read_message(&mut reader).unwrap().unwrap()).unwrap(),
            "{\"b\":\"한\"}"
        );
        assert!(read_message(&mut reader).unwrap().is_none());
    }

    #[test]
    fn frame_counts_bytes_not_chars() {
        assert_eq!(
            frame("한"),
            b"Content-Length: 3\r\n\r\n\xed\x95\x9c".to_vec()
        );
    }

    #[test]
    fn broken_streams_are_errors() {
        let no_length = b"Content-Type: x\r\n\r\n{}".to_vec();
        assert!(read_message(&mut Cursor::new(no_length)).is_err());
        let bad_length = b"Content-Length: x\r\n\r\n{}".to_vec();
        assert!(read_message(&mut Cursor::new(bad_length)).is_err());
        let short_body = b"Content-Length: 10\r\n\r\n{}".to_vec();
        assert!(read_message(&mut Cursor::new(short_body)).is_err());
        let cut_header = b"Content-Length: 2\r\n".to_vec();
        assert!(read_message(&mut Cursor::new(cut_header)).is_err());
        let long_line = vec![b'x'; MAX_HEADER_LINE + 10];
        assert!(read_message(&mut Cursor::new(long_line)).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn echo_server_round_trip_and_stop() {
        use std::os::unix::fs::PermissionsExt;
        use std::sync::mpsc::channel;

        // cat 은 받은 바이트를 그대로 돌려주므로 머리를 붙여 쓴 메시지가 같은 본문으로 돌아온다
        let dir = tempfile::tempdir().unwrap();
        let exe = dir.path().join("echo-server");
        std::fs::write(&exe, "#!/bin/sh\necho started >&2\nexec cat\n").unwrap();
        std::fs::set_permissions(&exe, std::fs::Permissions::from_mode(0o755)).unwrap();

        let state = Arc::new(LspState::default());
        let (tx, rx) = channel();
        let tx = Mutex::new(tx);
        let info = state
            .spawn(&exe, dir.path(), &[], move |event| {
                let _ = lock(&tx).send(event);
            })
            .unwrap();
        assert_eq!(info.version, None);
        state
            .send(info.id, r#"{"jsonrpc":"2.0","method":"한글"}"#)
            .unwrap();
        match rx.recv_timeout(Duration::from_secs(5)).unwrap() {
            LspEvent::Message { text } => assert_eq!(text, r#"{"jsonrpc":"2.0","method":"한글"}"#),
            other => panic!("메시지가 아니다: {other:?}"),
        }
        assert_eq!(state.running_ids(), vec![info.id]);
        // 입력을 닫으면 cat 이 끝난다
        state.stop(info.id);
        match rx.recv_timeout(Duration::from_secs(5)).unwrap() {
            LspEvent::Exit { code, stderr } => {
                assert_eq!(code, Some(0));
                assert_eq!(stderr, vec!["started".to_string()]);
            }
            other => panic!("끝이 아니다: {other:?}"),
        }
        assert!(state.running_ids().is_empty());
        assert!(state.send(info.id, "{}").is_err());
    }

    #[test]
    fn missing_executable_is_not_found() {
        let dir = tempfile::tempdir().unwrap();
        let state = Arc::new(LspState::default());
        let err = state
            .spawn(&dir.path().join("none"), dir.path(), &[], |_| {})
            .unwrap_err();
        assert_eq!(err.code, ErrorCode::NotFound);
    }

    #[test]
    fn version_comes_from_luals_json() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("bin")).unwrap();
        let exe = dir.path().join("bin").join(LUALS_EXE);
        std::fs::write(&exe, b"").unwrap();
        assert_eq!(read_version(&exe), None);
        std::fs::write(dir.path().join("luals.json"), r#"{"version":"3.19.1"}"#).unwrap();
        assert_eq!(read_version(&exe).as_deref(), Some("3.19.1"));
    }
}
