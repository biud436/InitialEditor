// 엔진 프로세스 (docs/plans/03-project-and-runtime.md 4절 모드 A).
// 실행 파일을 프로젝트 루트를 작업 폴더로 띄우고, stdout 과 stderr 를 줄 단위로 콜백에 넘기고, 끝나면 종료 코드를
// 알린다. 셸(commands.rs)은 그 콜백을 `engine:output`, `engine:exit` 이벤트로 프런트에 보낸다.
// 자식은 id 로 관리한다. 프로세스는 이 구조체 밖의 스레드 셋(stdout, stderr, 종료 대기)이 따라다닌다.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::error::{BackendError, ErrorCode, Result};
use crate::fsutil::lock;

/// SIGTERM 뒤 이만큼 기다렸다가 강제 종료
pub const STOP_GRACE: Duration = Duration::from_secs(2);
/// `--features` 응답을 기다리는 기본 시간. 앱에 든 엔진은 프런트가 15초를 준다 (첫 실행의 격리 검사)
pub const FEATURES_TIMEOUT: Duration = Duration::from_secs(5);
/// 프런트가 줄 수 있는 가장 긴 시간
pub const FEATURES_TIMEOUT_MAX: Duration = Duration::from_secs(60);
const POLL: Duration = Duration::from_millis(30);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Stream {
    Stdout,
    Stderr,
}

#[derive(Debug, Clone, Serialize)]
pub struct OutputEvent {
    pub id: u32,
    pub stream: Stream,
    pub line: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExitEvent {
    pub id: u32,
    /// 시그널로 죽었으면 None (JSON 의 null)
    pub code: Option<i32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunInfo {
    pub id: u32,
    pub pid: u32,
}

#[derive(Clone)]
struct Running {
    child: Arc<Mutex<Child>>,
    exited: Arc<AtomicBool>,
    pid: u32,
}

#[derive(Default)]
pub struct EngineState {
    next_id: AtomicU32,
    children: Mutex<HashMap<u32, Running>>,
}

fn check_exe(exe: &str) -> Result<()> {
    if exe.is_empty() || !Path::new(exe).is_file() {
        return Err(BackendError::with_path(
            ErrorCode::EngineNotFound,
            format!("엔진 실행 파일이 없다: {exe}"),
            exe,
        ));
    }
    Ok(())
}

fn spawn_error(exe: &str, err: std::io::Error) -> BackendError {
    match err.kind() {
        std::io::ErrorKind::NotFound => BackendError::with_path(
            ErrorCode::EngineNotFound,
            format!("엔진 실행 파일이 없다: {exe}"),
            exe,
        ),
        _ => BackendError::with_path(
            ErrorCode::Io,
            format!("엔진을 띄울 수 없다 ({exe}): {err}"),
            exe,
        ),
    }
}

/// 파이프를 줄 단위로 읽어 콜백에 넘긴다. UTF-8 이 아닌 바이트는 대체 문자로.
fn pump_lines(reader: impl Read, mut on_line: impl FnMut(String)) {
    let mut reader = BufReader::new(reader);
    let mut buf = Vec::new();
    loop {
        buf.clear();
        match reader.read_until(b'\n', &mut buf) {
            Ok(0) | Err(_) => break,
            Ok(_) => {
                while matches!(buf.last(), Some(b'\n') | Some(b'\r')) {
                    buf.pop();
                }
                on_line(String::from_utf8_lossy(&buf).into_owned());
            }
        }
    }
}

impl EngineState {
    /// 프로세스를 띄운다. on_output 은 줄마다, on_exit 는 두 파이프가 닫힌 뒤 한 번 불린다.
    pub fn spawn(
        self: &Arc<Self>,
        exe: &str,
        cwd: &str,
        args: &[String],
        env: &HashMap<String, String>,
        on_output: impl Fn(OutputEvent) + Send + Sync + 'static,
        on_exit: impl FnOnce(ExitEvent) + Send + 'static,
    ) -> Result<RunInfo> {
        check_exe(exe)?;
        if !Path::new(cwd).is_dir() {
            return Err(BackendError::with_path(
                ErrorCode::NotFound,
                format!("작업 폴더가 없다: {cwd}"),
                cwd,
            ));
        }
        let mut child = Command::new(exe)
            .args(args)
            .envs(env)
            .current_dir(cwd)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| spawn_error(exe, e))?;

        let id = self.next_id.fetch_add(1, Ordering::Relaxed) + 1;
        let pid = child.id();
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let on_output = Arc::new(on_output);

        let out_cb = Arc::clone(&on_output);
        let out_thread = thread::spawn(move || {
            if let Some(stdout) = stdout {
                pump_lines(stdout, |line| {
                    out_cb(OutputEvent {
                        id,
                        stream: Stream::Stdout,
                        line,
                    })
                });
            }
        });
        let err_cb = Arc::clone(&on_output);
        let err_thread = thread::spawn(move || {
            if let Some(stderr) = stderr {
                pump_lines(stderr, |line| {
                    err_cb(OutputEvent {
                        id,
                        stream: Stream::Stderr,
                        line,
                    })
                });
            }
        });

        let running = Running {
            child: Arc::new(Mutex::new(child)),
            exited: Arc::new(AtomicBool::new(false)),
            pid,
        };
        lock(&self.children).insert(id, running.clone());

        // 종료 대기: try_wait 를 짧게 잠그고 폴링해 stop() 이 언제든 자식을 잡을 수 있게 한다
        let state = Arc::clone(self);
        thread::spawn(move || {
            let code = loop {
                let status = lock(&running.child).try_wait();
                match status {
                    Ok(Some(status)) => break status.code(),
                    Ok(None) => thread::sleep(POLL),
                    Err(_) => break None,
                }
            };
            running.exited.store(true, Ordering::SeqCst);
            let _ = out_thread.join();
            let _ = err_thread.join();
            lock(&state.children).remove(&id);
            on_exit(ExitEvent { id, code });
        });

        Ok(RunInfo { id, pid })
    }

    /// 정지. unix 는 SIGTERM 뒤 2초 기다렸다 kill, 그 밖은 바로 kill. 이미 끝났거나 모르는 id 면 아무것도 안 한다.
    pub fn stop(&self, id: u32) -> Result<()> {
        let Some(running) = lock(&self.children).get(&id).cloned() else {
            return Ok(());
        };
        if running.exited.load(Ordering::SeqCst) {
            return Ok(());
        }
        #[cfg(unix)]
        {
            // SAFETY: 우리가 띄운 자식의 pid 에 시그널을 보낼 뿐이다
            unsafe {
                libc::kill(running.pid as libc::pid_t, libc::SIGTERM);
            }
            let deadline = Instant::now() + STOP_GRACE;
            while Instant::now() < deadline {
                if running.exited.load(Ordering::SeqCst) {
                    return Ok(());
                }
                thread::sleep(POLL);
            }
        }
        if !running.exited.load(Ordering::SeqCst) {
            let _ = lock(&running.child).kill();
        }
        Ok(())
    }

    pub fn running_ids(&self) -> Vec<u32> {
        lock(&self.children).keys().copied().collect()
    }
}

/// 프런트가 준 밀리초를 시간 제한으로. 없으면 기본 5초, 가장 길게 60초
pub fn features_timeout(timeout_ms: Option<u64>) -> Duration {
    match timeout_ms {
        Some(ms) if ms > 0 => Duration::from_millis(ms).min(FEATURES_TIMEOUT_MAX),
        _ => FEATURES_TIMEOUT,
    }
}

/// `exe --features` 의 stdout 을 공백으로 나눈 단어들 (엔진은 "lua" 또는 "lua mruby" 를 찍는다).
/// 작업 폴더는 끝나면 지우는 임시 폴더다. `--features` 를 모르는 옛 엔진은 게임을 띄우고 작업 폴더에
/// config.setting 을 쓰는데, 그것이 프로젝트에 남지 않게 한다. 같은 까닭으로 창과 소리는 dummy 드라이버다.
pub fn features(exe: &str, timeout: Duration) -> Result<Vec<String>> {
    check_exe(exe)?;
    let work = tempfile::Builder::new()
        .prefix("initial-editor-probe-")
        .tempdir()
        .map_err(|e| BackendError::io(&e, None))?;
    let mut child = Command::new(exe)
        .arg("--features")
        .current_dir(work.path())
        .env("SDL_VIDEODRIVER", "dummy")
        .env("SDL_AUDIODRIVER", "dummy")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| spawn_error(exe, e))?;
    let stdout = child.stdout.take();
    let reader = thread::spawn(move || {
        let mut bytes = Vec::new();
        if let Some(mut stdout) = stdout {
            let _ = stdout.read_to_end(&mut bytes);
        }
        String::from_utf8_lossy(&bytes).into_owned()
    });
    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(20)),
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(BackendError::with_path(
                    ErrorCode::Io,
                    format!(
                        "{exe} --features 가 {}초 안에 응답하지 않는다",
                        timeout.as_secs_f32()
                    ),
                    exe,
                ));
            }
            Err(e) => return Err(BackendError::io(&e, Some(exe))),
        }
    }
    let text = reader.join().unwrap_or_default();
    Ok(text.split_whitespace().map(String::from).collect())
}

/// 경로마다 파일이 있는지 (실행하지 않는다). 신뢰를 묻기 전에 프로젝트가 가리키는 후보를 본다
pub fn exists(paths: &[String]) -> Vec<bool> {
    paths
        .iter()
        .map(|p| !p.is_empty() && Path::new(p).is_file())
        .collect()
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;
    use std::path::PathBuf;
    use std::sync::mpsc::channel;

    fn script(dir: &Path, name: &str, body: &str) -> String {
        let path = dir.join(name);
        std::fs::write(&path, format!("#!/bin/sh\n{body}\n")).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        path.to_string_lossy().into_owned()
    }

    #[test]
    fn missing_executable_is_engine_not_found() {
        let state = Arc::new(EngineState::default());
        let err = state
            .spawn(
                "/nope/Initial2D",
                "/tmp",
                &[],
                &HashMap::new(),
                |_| {},
                |_| {},
            )
            .unwrap_err();
        assert_eq!(err.code, ErrorCode::EngineNotFound);
        assert_eq!(
            features("/nope/Initial2D", FEATURES_TIMEOUT)
                .unwrap_err()
                .code,
            ErrorCode::EngineNotFound
        );
    }

    #[test]
    fn streams_lines_and_exit_code() {
        let dir = tempfile::tempdir().unwrap();
        let exe = script(
            dir.path(),
            "engine.sh",
            "echo \"cwd=$(pwd)\"; echo \"arg=$1 env=$INITIAL2D_HMR\"; echo 'oops' 1>&2; exit 3",
        );
        let state = Arc::new(EngineState::default());
        let (out_tx, out_rx) = channel::<OutputEvent>();
        let (exit_tx, exit_rx) = channel::<ExitEvent>();
        let env: HashMap<String, String> = [("INITIAL2D_HMR".to_string(), "1".to_string())]
            .into_iter()
            .collect();
        let cwd = std::fs::canonicalize(dir.path()).unwrap();
        let info = state
            .spawn(
                &exe,
                cwd.to_str().unwrap(),
                &["--x".to_string()],
                &env,
                move |e| {
                    let _ = out_tx.send(e);
                },
                move |e| {
                    let _ = exit_tx.send(e);
                },
            )
            .unwrap();
        assert!(info.pid > 0);
        let exit = exit_rx.recv_timeout(Duration::from_secs(5)).unwrap();
        assert_eq!(exit.id, info.id);
        assert_eq!(exit.code, Some(3));
        let lines: Vec<(Stream, String)> = out_rx.try_iter().map(|e| (e.stream, e.line)).collect();
        assert!(
            lines.contains(&(Stream::Stdout, format!("cwd={}", cwd.display()))),
            "{lines:?}"
        );
        assert!(
            lines.contains(&(Stream::Stdout, "arg=--x env=1".to_string())),
            "{lines:?}"
        );
        assert!(
            lines.contains(&(Stream::Stderr, "oops".to_string())),
            "{lines:?}"
        );
        assert!(state.running_ids().is_empty());
        // 끝난 뒤 stop 은 아무것도 하지 않는다
        state.stop(info.id).unwrap();
        state.stop(9999).unwrap();
    }

    #[test]
    fn stop_terminates_a_running_process() {
        let dir = tempfile::tempdir().unwrap();
        let exe = script(dir.path(), "sleep.sh", "exec sleep 30");
        let state = Arc::new(EngineState::default());
        let (exit_tx, exit_rx) = channel::<ExitEvent>();
        let info = state
            .spawn(
                &exe,
                dir.path().to_str().unwrap(),
                &[],
                &HashMap::new(),
                |_| {},
                move |e| {
                    let _ = exit_tx.send(e);
                },
            )
            .unwrap();
        assert_eq!(state.running_ids(), vec![info.id]);
        let started = Instant::now();
        state.stop(info.id).unwrap();
        let exit = exit_rx.recv_timeout(Duration::from_secs(5)).unwrap();
        assert_eq!(exit.code, None, "signal death has no code");
        assert!(started.elapsed() < Duration::from_secs(4));
        assert!(state.running_ids().is_empty());
    }

    #[test]
    fn features_splits_stdout_words() {
        let dir = tempfile::tempdir().unwrap();
        let exe = script(
            dir.path(),
            "features.sh",
            "if [ \"$1\" = \"--features\" ]; then echo 'lua mruby'; fi",
        );
        assert_eq!(
            features(&exe, FEATURES_TIMEOUT).unwrap(),
            vec!["lua".to_string(), "mruby".to_string()]
        );
        let silent = script(dir.path(), "silent.sh", "exit 0");
        assert!(features(&silent, FEATURES_TIMEOUT).unwrap().is_empty());
    }

    #[test]
    fn features_timeout_is_an_argument() {
        // 7초 뒤에 답하는 엔진: 기본 5초에는 실패하고 15초에는 통과한다 (앱에 든 엔진의 첫 실행)
        let dir = tempfile::tempdir().unwrap();
        let exe = script(dir.path(), "late.sh", "sleep 7; echo 'lua mruby'");
        let started = Instant::now();
        let err = features(&exe, features_timeout(None)).unwrap_err();
        assert_eq!(err.code, ErrorCode::Io);
        assert!(err.message.contains("응답하지 않는다"), "{}", err.message);
        assert!(
            started.elapsed() < Duration::from_secs(7),
            "기본 시간에 끊는다"
        );
        assert_eq!(
            features(&exe, features_timeout(Some(15_000))).unwrap(),
            vec!["lua".to_string(), "mruby".to_string()]
        );
    }

    #[test]
    fn features_timeout_defaults_and_clamps() {
        assert_eq!(features_timeout(None), FEATURES_TIMEOUT);
        assert_eq!(features_timeout(Some(0)), FEATURES_TIMEOUT);
        assert_eq!(features_timeout(Some(15_000)), Duration::from_secs(15));
        assert_eq!(features_timeout(Some(3_600_000)), FEATURES_TIMEOUT_MAX);
    }

    #[test]
    fn features_runs_in_a_throwaway_folder_with_dummy_drivers() {
        // 옛 엔진처럼 작업 폴더에 config.setting 을 쓰는 스크립트. 그 폴더는 프로젝트도 이 프로세스의 폴더도 아니고, 끝나면 없다
        let dir = tempfile::tempdir().unwrap();
        let marker = dir.path().join("cwd.txt");
        let exe = script(
            dir.path(),
            "writes.sh",
            &format!(
                "pwd > '{}'; echo x > config.setting; echo \"lua $SDL_VIDEODRIVER $SDL_AUDIODRIVER\"",
                marker.display()
            ),
        );
        let here = std::env::current_dir().unwrap();
        let had_config = here.join("config.setting").exists();
        assert_eq!(
            features(&exe, FEATURES_TIMEOUT).unwrap(),
            vec!["lua".to_string(), "dummy".to_string(), "dummy".to_string()]
        );
        let cwd = PathBuf::from(std::fs::read_to_string(&marker).unwrap().trim());
        assert_ne!(std::fs::canonicalize(&here).unwrap(), cwd);
        assert_ne!(std::fs::canonicalize(dir.path()).unwrap(), cwd);
        assert!(!cwd.exists(), "임시 작업 폴더는 지운다: {}", cwd.display());
        assert_eq!(here.join("config.setting").exists(), had_config);
    }

    #[test]
    fn exists_checks_files_without_running_them() {
        let dir = tempfile::tempdir().unwrap();
        let ran = dir.path().join("ran.txt");
        let exe = script(
            dir.path(),
            "engine.sh",
            &format!("echo ran > '{}'", ran.display()),
        );
        let folder = dir.path().to_string_lossy().into_owned();
        let missing = dir.path().join("nope").to_string_lossy().into_owned();
        assert_eq!(
            exists(&[exe, folder, missing, String::new()]),
            vec![true, false, false, false]
        );
        assert!(!ran.exists(), "exists 는 실행하지 않는다");
    }
}
