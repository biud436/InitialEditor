// 안드로이드 에셋 스테이징 (docs/plans/e6-packaging.md 6.3). 엔진 저장소의 android/prepare_assets.sh 를 bash 로 띄운다.
// 스크립트 경로는 <저장소>/android/prepare_assets.sh 로 고정하고 인자는 정해진 목록만 만든다 (임의 명령 창구가 되지 않게).
// 프로세스 표는 엔진과 같은 EngineState 라 정지는 engine_stop 이 한다. 출력은 tool:output, tool:exit 이벤트로 간다.
// bash 와 python3 는 여기서 찾는다. Windows 는 Git for Windows 의 bash 이고, python3 은 Store 로 넘기는 가짜 실행 파일을
// 가려내려고 버전을 찍어 보게 한다. 찾은 python 은 INITIAL2D_PYTHON 으로 스크립트에 넘긴다.

use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::engine::{EngineState, ExitEvent, OutputEvent, RunInfo};
use crate::error::{BackendError, ErrorCode, Result};

pub const EVENT_TOOL_OUTPUT: &str = "tool:output";
pub const EVENT_TOOL_EXIT: &str = "tool:exit";
/// 저장소 안의 스크립트 자리 (바꿀 수 없다)
pub const STAGE_SCRIPT: [&str; 2] = ["android", "prepare_assets.sh"];
/// --project 를 아는 스크립트가 함께 부르는 도구. 없으면 옛 스크립트라 인자를 무시하고 저장소 자신을 스테이징한다
pub const STAGE_LIST: [&str; 2] = ["tools", "stage_list.py"];
pub const OLD_STAGE_SCRIPT: &str = "이 엔진 저장소의 스테이징 스크립트는 --project 를 모른다 (tools/stage_list.py 가 없다). 엔진 저장소를 --project 를 아는 판으로 올린다";
/// SDL 소스 자리. 없으면 다음 명령은 download_sdl.sh 부터다
pub const SDL_DIR: [&str; 4] = ["android", "app", "jni", "SDL2"];
/// Gradle 래퍼 (커밋하지 않는다). 없으면 gradle wrapper 부터다
pub const GRADLEW: [&str; 2] = ["android", "gradlew"];
/// 스크립트가 python3 대신 쓸 실행 파일을 읽는 변수
pub const PYTHON_ENV: &str = "INITIAL2D_PYTHON";
/// python 판을 물을 때 기다리는 시간
pub const PYTHON_TIMEOUT: Duration = Duration::from_secs(5);
pub const NEED_BASH: &str = "Git for Windows 의 bash 가 필요하다";
pub const NEED_PYTHON: &str = "Python 3 이 필요하다";

/// 저장소 후보 하나를 실행하지 않고 본 결과
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct RepoProbe {
    /// android/prepare_assets.sh 가 파일로 있다
    pub script: bool,
    /// android/app/jni/SDL2 가 있다
    pub sdl: bool,
    /// android/gradlew 가 있다
    pub gradlew: bool,
}

pub fn probe_repo(repo: &str) -> RepoProbe {
    let base = Path::new(repo);
    let under = |parts: &[&str]| parts.iter().fold(base.to_path_buf(), |p, s| p.join(s));
    if repo.is_empty() || !base.is_absolute() {
        return RepoProbe::default();
    }
    RepoProbe {
        script: under(&STAGE_SCRIPT).is_file(),
        sdl: under(&SDL_DIR).is_dir(),
        gradlew: under(&GRADLEW).is_file(),
    }
}

/// 저장소와 그 안의 스크립트를 확인한다. 저장소는 절대 경로의 폴더이고, 스크립트는 정규화한 뒤에도 저장소 안이어야 한다
/// (심볼릭 링크로 밖을 가리키면 거부). --project 를 모르는 옛 스크립트(tools/stage_list.py 가 없다)도 거부한다.
/// 돌려주는 것은 (정규화한 저장소, 정규화한 스크립트)
pub fn stage_script(repo: &str) -> Result<(PathBuf, PathBuf)> {
    let given = Path::new(repo);
    if repo.is_empty() || !given.is_absolute() {
        return Err(BackendError::with_path(
            ErrorCode::Unsupported,
            format!("엔진 저장소는 절대 경로여야 한다: {repo}"),
            repo,
        ));
    }
    let root = std::fs::canonicalize(given).map_err(|_| {
        BackendError::with_path(
            ErrorCode::NotFound,
            format!("엔진 저장소가 없다: {repo}"),
            repo,
        )
    })?;
    if !root.is_dir() {
        return Err(BackendError::with_path(
            ErrorCode::NotFound,
            format!("엔진 저장소가 폴더가 아니다: {repo}"),
            repo,
        ));
    }
    let script = STAGE_SCRIPT.iter().fold(root.clone(), |p, s| p.join(s));
    let shown = script.to_string_lossy().into_owned();
    if !script.is_file() {
        return Err(BackendError::with_path(
            ErrorCode::NotFound,
            format!("스테이징 스크립트가 없다: {shown}"),
            shown,
        ));
    }
    let real = std::fs::canonicalize(&script).map_err(|e| BackendError::io(&e, Some(&shown)))?;
    if !real.starts_with(&root) {
        return Err(BackendError::with_path(
            ErrorCode::OutsideRoot,
            format!("스테이징 스크립트가 저장소 밖을 가리킨다: {shown}"),
            shown,
        ));
    }
    if !STAGE_LIST
        .iter()
        .fold(root.clone(), |p, s| p.join(s))
        .is_file()
    {
        return Err(BackendError::with_path(
            ErrorCode::Unsupported,
            OLD_STAGE_SCRIPT,
            shown,
        ));
    }
    Ok((root, real))
}

/// Windows 의 canonicalize 가 붙이는 \\?\ 머리를 뗀다 (bash 와 사람이 읽는 경로로). 다른 모양은 그대로
pub fn plain_path(path: &str) -> String {
    if let Some(rest) = path.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{rest}")
    } else if let Some(rest) = path.strip_prefix(r"\\?\") {
        rest.to_string()
    } else {
        path.to_string()
    }
}

/// Git Bash 는 C:\ 꼴 인자를 바꾸려 들므로 Windows 경로는 / 로 나눠 넘긴다. 다른 OS 는 그대로
pub fn bash_path(path: &str, windows: bool) -> String {
    if windows {
        path.replace('\\', "/")
    } else {
        path.to_string()
    }
}

/// bash 에 줄 인자: 스크립트, --project <프로젝트>, 그리고 고른 스위치만
pub fn stage_args(
    script: &str,
    project: &str,
    with_rtp: bool,
    dry_run: bool,
    windows: bool,
) -> Vec<String> {
    let mut args = vec![
        bash_path(script, windows),
        "--project".to_string(),
        bash_path(project, windows),
    ];
    if with_rtp {
        args.push("--with-rtp".to_string());
    }
    if dry_run {
        args.push("--dry-run".to_string());
    }
    args
}

/// `python -c "import sys; print(sys.version_info[0])"` 의 출력이 Python 3 인가
pub fn is_python3_output(stdout: &str) -> bool {
    stdout.trim() == "3"
}

/// 실행 파일에 판을 물어 Python 3 이면 true. 답이 없거나 늦으면(Store 의 가짜 실행 파일) false
pub fn python_ok(exe: &Path, timeout: Duration) -> bool {
    if !exe.is_file() {
        return false;
    }
    let Ok(mut child) = Command::new(exe)
        .args(["-c", "import sys; print(sys.version_info[0])"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    else {
        return false;
    };
    let stdout = child.stdout.take();
    let reader = thread::spawn(move || {
        let mut text = String::new();
        if let Some(mut out) = stdout {
            let _ = out.read_to_string(&mut text);
        }
        text
    });
    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(20)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                break None;
            }
        }
    };
    let text = reader.join().unwrap_or_default();
    matches!(status, Some(s) if s.success()) && is_python3_output(&text)
}

fn path_dirs(path_var: Option<&str>, windows: bool) -> Vec<PathBuf> {
    let sep = if windows { ';' } else { ':' };
    path_var
        .unwrap_or("")
        .split(sep)
        .filter(|d| !d.trim().is_empty())
        .map(PathBuf::from)
        .collect()
}

/// WSL 의 bash.exe (System32) 는 리눅스 경로로 돌아 쓸 수 없다
fn is_wsl_launcher(dir: &Path) -> bool {
    let low = dir.to_string_lossy().to_lowercase().replace('/', "\\");
    low.contains("\\windows\\system32") || low.contains("\\windowsapps")
}

/// bash 후보. env 는 환경 변수를 읽는다 (시험에서 바꾼다)
pub fn bash_candidates(env: &dyn Fn(&str) -> Option<String>, windows: bool) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if windows {
        for var in ["ProgramW6432", "ProgramFiles", "ProgramFiles(x86)"] {
            if let Some(base) = env(var) {
                out.push(
                    PathBuf::from(&base)
                        .join("Git")
                        .join("bin")
                        .join("bash.exe"),
                );
            }
        }
        if let Some(local) = env("LOCALAPPDATA") {
            out.push(
                PathBuf::from(local)
                    .join("Programs")
                    .join("Git")
                    .join("bin")
                    .join("bash.exe"),
            );
        }
        out.push(PathBuf::from(r"C:\Program Files\Git\bin\bash.exe"));
        for dir in path_dirs(env("PATH").as_deref(), true) {
            if !is_wsl_launcher(&dir) {
                out.push(dir.join("bash.exe"));
            }
        }
    } else {
        for fixed in [
            "/bin/bash",
            "/usr/bin/bash",
            "/usr/local/bin/bash",
            "/opt/homebrew/bin/bash",
        ] {
            out.push(PathBuf::from(fixed));
        }
        for dir in path_dirs(env("PATH").as_deref(), false) {
            out.push(dir.join("bash"));
        }
    }
    dedupe(out, windows)
}

/// python 후보. 데스크톱 앱은 셸의 PATH 를 물려받지 않을 수 있어(macOS 의 Finder) 흔한 자리를 더한다
pub fn python_candidates(env: &dyn Fn(&str) -> Option<String>, windows: bool) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if windows {
        for dir in path_dirs(env("PATH").as_deref(), true) {
            out.push(dir.join("python3.exe"));
            out.push(dir.join("python.exe"));
        }
    } else {
        for dir in path_dirs(env("PATH").as_deref(), false) {
            out.push(dir.join("python3"));
        }
        for fixed in [
            "/opt/homebrew/bin/python3",
            "/usr/local/bin/python3",
            "/usr/bin/python3",
        ] {
            out.push(PathBuf::from(fixed));
        }
    }
    dedupe(out, windows)
}

/// 같은 자리는 처음 것만. Windows 후보는 대소문자와 구분자를 가리지 않는다. 그 밖에는 경로를 구성 요소로 견준다
/// ("/usr//bin/python3" 와 "/usr/bin/python3" 는 같은 자리다. Windows 에서 돌면 join 이 붙인 "\" 도 구분자다)
fn dedupe(paths: Vec<PathBuf>, windows: bool) -> Vec<PathBuf> {
    let mut seen = std::collections::HashSet::new();
    let mut out: Vec<PathBuf> = Vec::new();
    for p in paths {
        let fresh = if windows {
            seen.insert(p.to_string_lossy().replace('\\', "/").to_lowercase())
        } else {
            !out.contains(&p)
        };
        if fresh {
            out.push(p);
        }
    }
    out
}

fn system_env(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|v| !v.is_empty())
}

pub fn find_bash() -> Result<PathBuf> {
    bash_candidates(&system_env, cfg!(windows))
        .into_iter()
        .find(|p| p.is_file())
        .ok_or_else(|| BackendError::new(ErrorCode::Unsupported, NEED_BASH))
}

pub fn find_python() -> Result<PathBuf> {
    python_candidates(&system_env, cfg!(windows))
        .into_iter()
        .find(|p| python_ok(p, PYTHON_TIMEOUT))
        .ok_or_else(|| BackendError::new(ErrorCode::Unsupported, NEED_PYTHON))
}

/// 한 번의 스테이징
pub struct StageRequest<'a> {
    pub repo: &'a str,
    pub project: &'a str,
    pub with_rtp: bool,
    pub dry_run: bool,
}

/// 확인을 마치고 `bash <저장소>/android/prepare_assets.sh --project ...` 를 저장소를 작업 폴더로 띄운다
pub fn spawn_stage(
    state: &Arc<EngineState>,
    req: &StageRequest<'_>,
    bash: &Path,
    python: &Path,
    on_output: impl Fn(OutputEvent) + Send + Sync + 'static,
    on_exit: impl FnOnce(ExitEvent) + Send + 'static,
) -> Result<RunInfo> {
    let (root, script) = stage_script(req.repo)?;
    let project = Path::new(req.project);
    if req.project.is_empty() || !project.is_absolute() || !project.is_dir() {
        return Err(BackendError::with_path(
            ErrorCode::NotFound,
            format!("프로젝트 폴더가 없다: {}", req.project),
            req.project,
        ));
    }
    let windows = cfg!(windows);
    let args = stage_args(
        &plain_path(&script.to_string_lossy()),
        req.project,
        req.with_rtp,
        req.dry_run,
        windows,
    );
    let env: HashMap<String, String> = [(
        PYTHON_ENV.to_string(),
        bash_path(&python.to_string_lossy(), windows),
    )]
    .into_iter()
    .collect();
    state.spawn(
        &bash.to_string_lossy(),
        &plain_path(&root.to_string_lossy()),
        &args,
        &env,
        on_output,
        on_exit,
    )
}

/// 스테이징을 띄운다. 출력은 tool:output, 끝은 tool:exit. 정지는 engine_stop(id)
#[tauri::command(async)]
pub fn android_stage(
    app: AppHandle,
    engine: State<'_, Arc<EngineState>>,
    repo: String,
    project: String,
    with_rtp: bool,
    dry_run: bool,
) -> Result<RunInfo> {
    stage_script(&repo)?;
    let bash = find_bash()?;
    let python = find_python()?;
    let output_app = app.clone();
    let exit_app = app;
    spawn_stage(
        engine.inner(),
        &StageRequest {
            repo: &repo,
            project: &project,
            with_rtp,
            dry_run,
        },
        &bash,
        &python,
        move |event| {
            let _ = output_app.emit(EVENT_TOOL_OUTPUT, event);
        },
        move |event| {
            let _ = exit_app.emit(EVENT_TOOL_EXIT, event);
        },
    )
}

/// 저장소 후보들을 실행하지 않고 본다 (스크립트, SDL 소스, Gradle 래퍼가 있는가)
#[tauri::command(async)]
pub fn android_repo_probe(paths: Vec<String>) -> Vec<RepoProbe> {
    paths.iter().map(|p| probe_repo(p)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn env_of(pairs: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> {
        let map: HashMap<String, String> = pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect();
        move |name: &str| map.get(name).cloned()
    }

    #[test]
    fn args_are_the_fixed_list() {
        assert_eq!(
            stage_args(
                "/r/android/prepare_assets.sh",
                "/p/my game",
                false,
                false,
                false
            ),
            vec!["/r/android/prepare_assets.sh", "--project", "/p/my game"]
        );
        assert_eq!(
            stage_args("/r/android/prepare_assets.sh", "/p", true, true, false),
            vec![
                "/r/android/prepare_assets.sh",
                "--project",
                "/p",
                "--with-rtp",
                "--dry-run"
            ]
        );
        assert_eq!(
            stage_args(
                r"C:\e\android\prepare_assets.sh",
                r"C:\Users\한글 이름\game",
                true,
                false,
                true
            ),
            vec![
                "C:/e/android/prepare_assets.sh",
                "--project",
                "C:/Users/한글 이름/game",
                "--with-rtp"
            ]
        );
    }

    #[test]
    fn verbatim_prefix_is_dropped() {
        assert_eq!(
            plain_path(r"\\?\C:\Users\a\Initial2D"),
            r"C:\Users\a\Initial2D"
        );
        assert_eq!(plain_path(r"\\?\UNC\server\share\e"), r"\\server\share\e");
        assert_eq!(plain_path("/Users/a/Initial2D"), "/Users/a/Initial2D");
        assert_eq!(plain_path(r"C:\e"), r"C:\e");
    }

    #[test]
    fn python_output_must_say_three() {
        assert!(is_python3_output("3\n"));
        assert!(is_python3_output("3\r\n"));
        assert!(!is_python3_output("2\n"));
        assert!(!is_python3_output(""));
        assert!(!is_python3_output(
            "Python was not found; run without arguments to install from the Microsoft Store"
        ));
    }

    #[test]
    fn windows_bash_prefers_git_and_skips_wsl() {
        let env = env_of(&[
            ("ProgramFiles", r"C:\Program Files"),
            ("LOCALAPPDATA", r"C:\Users\a\AppData\Local"),
            (
                "PATH",
                r"C:\Windows\System32;C:\tools\msys\usr\bin;C:\Users\a\AppData\Local\Microsoft\WindowsApps",
            ),
        ]);
        let list = bash_candidates(&env, true);
        let shown: Vec<String> = list
            .iter()
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .collect();
        assert_eq!(shown[0], "C:/Program Files/Git/bin/bash.exe");
        assert!(shown.contains(&"C:/Users/a/AppData/Local/Programs/Git/bin/bash.exe".to_string()));
        assert!(shown.contains(&"C:/tools/msys/usr/bin/bash.exe".to_string()));
        assert!(
            !shown.iter().any(|p| p.to_lowercase().contains("system32")),
            "{shown:?}"
        );
        assert!(
            !shown
                .iter()
                .any(|p| p.to_lowercase().contains("windowsapps")),
            "{shown:?}"
        );
        // 같은 자리는 한 번만
        assert_eq!(
            shown
                .iter()
                .filter(|p| p.as_str() == "C:/Program Files/Git/bin/bash.exe")
                .count(),
            1
        );
    }

    #[test]
    fn python_candidates_cover_path_and_common_places() {
        let unix = python_candidates(&env_of(&[("PATH", "/usr/bin:/bin")]), false);
        assert_eq!(unix[0], PathBuf::from("/usr/bin/python3"));
        assert!(unix.contains(&PathBuf::from("/opt/homebrew/bin/python3")));
        assert_eq!(
            unix.iter()
                .filter(|p| **p == PathBuf::from("/usr/bin/python3"))
                .count(),
            1
        );
        // 같은 자리를 다르게 적어도 한 번 ("//", 그리고 Windows 에서 돌면 join 이 붙인 "\")
        let doubled = python_candidates(&env_of(&[("PATH", "/usr//bin")]), false);
        assert_eq!(doubled[0], PathBuf::from("/usr//bin/python3"));
        assert_eq!(
            doubled
                .iter()
                .filter(|p| p.as_path() == Path::new("/usr/bin/python3"))
                .count(),
            1
        );
        let win = python_candidates(&env_of(&[("PATH", r"C:\Python312;C:\x")]), true);
        let shown: Vec<String> = win
            .iter()
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .collect();
        assert_eq!(
            shown[..2],
            [
                "C:/Python312/python3.exe".to_string(),
                "C:/Python312/python.exe".to_string()
            ]
        );
    }

    #[test]
    fn relative_or_missing_repo_is_rejected() {
        assert_eq!(
            stage_script("relative/repo").unwrap_err().code,
            ErrorCode::Unsupported
        );
        assert_eq!(stage_script("").unwrap_err().code, ErrorCode::Unsupported);
        let dir = tempfile::tempdir().unwrap();
        let missing = dir.path().join("nope");
        assert_eq!(
            stage_script(missing.to_str().unwrap()).unwrap_err().code,
            ErrorCode::NotFound
        );
        // 저장소는 있지만 스크립트가 없다
        assert_eq!(
            stage_script(dir.path().to_str().unwrap()).unwrap_err().code,
            ErrorCode::NotFound
        );
        assert_eq!(
            probe_repo(dir.path().to_str().unwrap()),
            RepoProbe::default()
        );
        assert!(!probe_repo("relative").script);
    }

    #[cfg(unix)]
    mod unix {
        use super::super::*;
        use std::os::unix::fs::PermissionsExt;
        use std::sync::mpsc::channel;

        fn write_exec(path: &Path, body: &str) {
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, body).unwrap();
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755)).unwrap();
        }

        /// 가짜 저장소: 스크립트는 작업 폴더와 인자와 python 변수를 찍는다. --project 를 아는 판이라 tools/stage_list.py 가 있다
        fn fake_repo(dir: &Path) -> PathBuf {
            let repo = dir.join("engine repo");
            write_exec(
                &repo.join("android").join("prepare_assets.sh"),
                "echo \"cwd=$(pwd)\"\necho \"script=$0\"\nfor a in \"$@\"; do echo \"arg=$a\"; done\necho \"py=$INITIAL2D_PYTHON\"\necho 'STAGED files=1 bytes=2 stamp=0123456789ab rtp=no dest=x'\nexit 0\n",
            );
            std::fs::create_dir_all(repo.join("tools")).unwrap();
            std::fs::write(repo.join("tools").join("stage_list.py"), "").unwrap();
            repo
        }

        #[test]
        fn old_script_that_ignores_project_is_never_run() {
            // 인자 없는 옛 스크립트는 --project 와 --dry-run 을 무시하고 저장소 자신을 스테이징한다
            let dir = tempfile::tempdir().unwrap();
            let repo = dir.path().join("old engine");
            write_exec(
                &repo.join("android").join("prepare_assets.sh"),
                "touch \"$(dirname \"$0\")/ran\"\n",
            );
            let err = stage_script(repo.to_str().unwrap()).unwrap_err();
            assert_eq!(err.code, ErrorCode::Unsupported);
            assert_eq!(err.message, OLD_STAGE_SCRIPT);
            let project = dir.path().join("p");
            std::fs::create_dir_all(&project).unwrap();
            let state = Arc::new(EngineState::default());
            for dry_run in [true, false] {
                let err = spawn_stage(
                    &state,
                    &StageRequest {
                        repo: repo.to_str().unwrap(),
                        project: project.to_str().unwrap(),
                        with_rtp: false,
                        dry_run,
                    },
                    Path::new("/bin/bash"),
                    Path::new("/usr/bin/python3"),
                    |_| {},
                    |_| {},
                )
                .unwrap_err();
                assert_eq!(err.code, ErrorCode::Unsupported);
            }
            assert!(!repo.join("android").join("ran").exists());
        }

        #[test]
        fn probe_sees_script_and_sdl() {
            let dir = tempfile::tempdir().unwrap();
            let repo = fake_repo(dir.path());
            let shown = repo.to_string_lossy().into_owned();
            assert_eq!(
                probe_repo(&shown),
                RepoProbe {
                    script: true,
                    sdl: false,
                    gradlew: false
                }
            );
            std::fs::create_dir_all(repo.join("android").join("app").join("jni").join("SDL2"))
                .unwrap();
            std::fs::write(repo.join("android").join("gradlew"), "#!/bin/sh\n").unwrap();
            assert_eq!(
                probe_repo(&shown),
                RepoProbe {
                    script: true,
                    sdl: true,
                    gradlew: true
                }
            );
            assert_eq!(
                android_repo_probe(vec![
                    shown.clone(),
                    dir.path().to_string_lossy().into_owned()
                ]),
                vec![
                    RepoProbe {
                        script: true,
                        sdl: true,
                        gradlew: true
                    },
                    RepoProbe::default()
                ]
            );
        }

        #[test]
        fn runs_the_fixed_script_in_the_repo_with_the_fixed_args() {
            let dir = tempfile::tempdir().unwrap();
            let repo = fake_repo(dir.path());
            let project = dir.path().join("my game");
            std::fs::create_dir_all(&project).unwrap();
            let state = Arc::new(EngineState::default());
            let (out_tx, out_rx) = channel::<OutputEvent>();
            let (exit_tx, exit_rx) = channel::<ExitEvent>();
            let info = spawn_stage(
                &state,
                &StageRequest {
                    repo: repo.to_str().unwrap(),
                    project: project.to_str().unwrap(),
                    with_rtp: true,
                    dry_run: false,
                },
                Path::new("/bin/bash"),
                Path::new("/usr/bin/python3"),
                move |e| {
                    let _ = out_tx.send(e);
                },
                move |e| {
                    let _ = exit_tx.send(e);
                },
            )
            .unwrap();
            let exit = exit_rx.recv_timeout(Duration::from_secs(10)).unwrap();
            assert_eq!(exit.id, info.id);
            assert_eq!(exit.code, Some(0));
            let lines: Vec<String> = out_rx.try_iter().map(|e| e.line).collect();
            let real_repo = std::fs::canonicalize(&repo).unwrap();
            let script = real_repo.join("android").join("prepare_assets.sh");
            assert_eq!(
                lines,
                vec![
                    format!("cwd={}", real_repo.display()),
                    format!("script={}", script.display()),
                    "arg=--project".to_string(),
                    format!("arg={}", project.display()),
                    "arg=--with-rtp".to_string(),
                    "py=/usr/bin/python3".to_string(),
                    "STAGED files=1 bytes=2 stamp=0123456789ab rtp=no dest=x".to_string(),
                ]
            );
        }

        #[test]
        fn script_pointing_outside_the_repo_is_refused() {
            let dir = tempfile::tempdir().unwrap();
            let evil = dir.path().join("evil.sh");
            write_exec(&evil, "touch \"$(dirname \"$0\")/ran\"\n");
            let repo = dir.path().join("repo");
            std::fs::create_dir_all(repo.join("android")).unwrap();
            std::os::unix::fs::symlink(&evil, repo.join("android").join("prepare_assets.sh"))
                .unwrap();
            let err = stage_script(repo.to_str().unwrap()).unwrap_err();
            assert_eq!(err.code, ErrorCode::OutsideRoot);
            let project = dir.path().join("p");
            std::fs::create_dir_all(&project).unwrap();
            let state = Arc::new(EngineState::default());
            let err = spawn_stage(
                &state,
                &StageRequest {
                    repo: repo.to_str().unwrap(),
                    project: project.to_str().unwrap(),
                    with_rtp: false,
                    dry_run: false,
                },
                Path::new("/bin/bash"),
                Path::new("/usr/bin/python3"),
                |_| {},
                |_| {},
            )
            .unwrap_err();
            assert_eq!(err.code, ErrorCode::OutsideRoot);
            assert!(!dir.path().join("ran").exists());
            // 경로에 .. 를 넣어도 스크립트 자리는 정규화한 저장소 안의 그 자리 하나다
            let real = fake_repo(dir.path());
            let twisty = format!(
                "{}/../{}",
                real.display(),
                real.file_name().unwrap().to_string_lossy()
            );
            let (root, script) = stage_script(&twisty).unwrap();
            assert_eq!(root, std::fs::canonicalize(&real).unwrap());
            assert_eq!(script, root.join("android").join("prepare_assets.sh"));
        }

        #[test]
        fn missing_project_is_not_found() {
            let dir = tempfile::tempdir().unwrap();
            let repo = fake_repo(dir.path());
            let state = Arc::new(EngineState::default());
            for project in ["", "relative/p", "/definitely/not/here"] {
                let err = spawn_stage(
                    &state,
                    &StageRequest {
                        repo: repo.to_str().unwrap(),
                        project,
                        with_rtp: false,
                        dry_run: true,
                    },
                    Path::new("/bin/bash"),
                    Path::new("/usr/bin/python3"),
                    |_| {},
                    |_| {},
                )
                .unwrap_err();
                assert_eq!(err.code, ErrorCode::NotFound, "{project}");
            }
        }

        #[test]
        fn python_check_runs_the_candidate() {
            let dir = tempfile::tempdir().unwrap();
            let good = dir.path().join("good");
            write_exec(&good, "#!/bin/sh\necho 3\n");
            let old = dir.path().join("old");
            write_exec(&old, "#!/bin/sh\necho 2\n");
            let failing = dir.path().join("failing");
            write_exec(&failing, "#!/bin/sh\necho 3\nexit 9\n");
            let slow = dir.path().join("slow");
            write_exec(&slow, "#!/bin/sh\nexec sleep 30\n");
            assert!(python_ok(&good, PYTHON_TIMEOUT));
            assert!(!python_ok(&old, PYTHON_TIMEOUT));
            assert!(!python_ok(&failing, PYTHON_TIMEOUT));
            assert!(!python_ok(&dir.path().join("missing"), PYTHON_TIMEOUT));
            let started = Instant::now();
            assert!(!python_ok(&slow, Duration::from_millis(300)));
            assert!(started.elapsed() < Duration::from_secs(5));
        }

        #[test]
        fn unix_bash_candidates_start_with_bin_bash() {
            let list = bash_candidates(
                &|name: &str| (name == "PATH").then(|| "/usr/local/bin:/bin".to_string()),
                false,
            );
            assert_eq!(list[0], PathBuf::from("/bin/bash"));
            assert!(list.contains(&PathBuf::from("/usr/local/bin/bash")));
            assert_eq!(
                list.iter()
                    .filter(|p| **p == PathBuf::from("/bin/bash"))
                    .count(),
                1
            );
            assert!(find_bash().is_ok(), "이 기계에는 bash 가 있다");
        }
    }
}
