// 자가 검사 모드 (docs/plans/e6-packaging.md 5절). 환경 변수 INITIAL_EDITOR_SELFTEST 가 가리키는 계획 JSON 으로만 켜진다.
// 명령 인자로는 경로를 받지 않는다. 셸이 맡는 것은 계획 읽기와 검사, workDir 과 logs/ 와 템플릿 프로젝트 폴더 만들기
// (앱에는 fs 플러그인이 없다), 전체 시간 감시(보고서를 쓰고 1 로 끝낸다), 명령 넷이다. 판정은 scripts/selftest-check.mjs 가 한다.
//
//   selftest_plan() → 계획 JSON 또는 null (평소 실행)
//   selftest_progress(step)                         감시가 시간 초과 보고서에 적을 마지막 단계. stderr 에 한 줄
//   selftest_write_log(name, text, encoding?)        workDir/logs/<name> (단순 이름만. encoding 이 "base64" 면 풀어서 쓴다)
//   selftest_finish(report, code)                    계획의 report 에 보고서를 쓰고 앱을 code 로 끝낸다
// 자가 검사가 아니면 뒤의 셋은 unsupported 오류다 (웹뷰가 파일을 쓰는 창구가 되지 않게).

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use base64::Engine as _;
use serde_json::{json, Value};
use tauri::{AppHandle, State};

use crate::engine::EngineState;
use crate::error::{BackendError, ErrorCode, Result};
use crate::fsutil::{lock, write_atomic};

pub const ENV_PLAN: &str = "INITIAL_EDITOR_SELFTEST";
/// 계획 오류 (읽지 못함, 모양이 틀림, workDir 이 이미 있음)
pub const EXIT_PLAN_ERROR: i32 = 2;
/// 필수 검사 실패와 시간 초과
pub const EXIT_FAILED: i32 = 1;
pub const LOGS_DIR: &str = "logs";
pub const MIN_TOTAL_TIMEOUT_MS: u64 = 1_000;
pub const MAX_TOTAL_TIMEOUT_MS: u64 = 3_600_000;
const MAX_NAME_LEN: usize = 128;
const WATCH_POLL: Duration = Duration::from_millis(100);

#[derive(Debug, Clone)]
pub struct Plan {
    pub work_dir: PathBuf,
    pub report: PathBuf,
    pub total_timeout: Duration,
    pub show_window: bool,
    /// 셸이 만드는 프로젝트 폴더 (root 를 주지 않은 프로젝트)
    pub project_dirs: Vec<PathBuf>,
    /// 프런트에 그대로 넘기는 원래 JSON
    pub raw: Value,
}

/// logs/ 안에 쓸 수 있는 이름: 영문자, 숫자, 점, 밑줄, 붙임표만. 점으로 시작하지 않는다
pub fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= MAX_NAME_LEN
        && !name.starts_with('.')
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-')
}

fn absolute(value: &Value, key: &str) -> std::result::Result<PathBuf, String> {
    let s = value
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("{key} 없음 (절대 경로 문자열)"))?;
    let p = PathBuf::from(s);
    if !p.is_absolute() {
        return Err(format!("{key}: 절대 경로여야 함 (현재: {s})"));
    }
    Ok(p)
}

pub fn parse_plan(text: &str) -> std::result::Result<Plan, String> {
    let raw: Value = serde_json::from_str(text).map_err(|e| format!("JSON 구문 오류: {e}"))?;
    if !raw.is_object() {
        return Err("계획은 JSON 객체여야 함".into());
    }
    if raw.get("version").and_then(Value::as_u64) != Some(1) {
        return Err("version: 1 이어야 함".into());
    }
    let work_dir = absolute(&raw, "workDir")?;
    let report = absolute(&raw, "report")?;
    let timeout_ms = raw
        .get("totalTimeoutMs")
        .and_then(Value::as_u64)
        .ok_or("totalTimeoutMs 없음")?;
    if !(MIN_TOTAL_TIMEOUT_MS..=MAX_TOTAL_TIMEOUT_MS).contains(&timeout_ms) {
        return Err(format!(
            "totalTimeoutMs: {MIN_TOTAL_TIMEOUT_MS}..{MAX_TOTAL_TIMEOUT_MS} 범위여야 함 (현재: {timeout_ms})"
        ));
    }
    let show_window = match raw.get("showWindow") {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(_) => return Err("showWindow: 불리언이어야 함".into()),
    };
    let projects = raw
        .get("projects")
        .and_then(Value::as_array)
        .ok_or("projects 없음 (배열)")?;
    if projects.is_empty() {
        return Err("projects 비어 있음".into());
    }
    let mut ids: Vec<String> = Vec::new();
    let mut project_dirs = Vec::new();
    for p in projects {
        let id = p
            .get("id")
            .and_then(Value::as_str)
            .ok_or("프로젝트에 id 없음")?;
        if !valid_name(id) {
            return Err(format!(
                "프로젝트 id 는 영문자, 숫자, 점, 밑줄, 하이픈만 허용: {id}"
            ));
        }
        if id == LOGS_DIR {
            return Err(format!("프로젝트 id 로 {LOGS_DIR} 사용 불가"));
        }
        if ids.iter().any(|x| x == id) {
            return Err(format!("프로젝트 id 중복: {id}"));
        }
        ids.push(id.to_string());
        match p.get("root") {
            None | Some(Value::Null) => project_dirs.push(work_dir.join(id)),
            Some(_) => {
                // 이미 있는 폴더를 연다 (계획을 만든 쪽이 준비한 사본). 셸은 만들지 않는다
                absolute(p, "root")?;
            }
        }
    }
    Ok(Plan {
        work_dir,
        report,
        total_timeout: Duration::from_millis(timeout_ms),
        show_window,
        project_dirs,
        raw,
    })
}

pub fn load(path: &Path) -> std::result::Result<Plan, String> {
    let text = fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
    parse_plan(&text)
}

/// workDir, workDir/logs, 프로젝트 폴더를 만든다. workDir 이 이미 있으면 아무것도 지우지 않고 오류
pub fn prepare(plan: &Plan) -> std::result::Result<(), String> {
    if plan.work_dir.exists() {
        return Err(format!(
            "workDir 이 이미 있음 (삭제하지 않음): {}",
            plan.work_dir.display()
        ));
    }
    let mk = |p: &Path| fs::create_dir_all(p).map_err(|e| format!("{}: {e}", p.display()));
    mk(&plan.work_dir.join(LOGS_DIR))?;
    for dir in &plan.project_dirs {
        mk(dir)?;
    }
    Ok(())
}

pub struct SelftestState {
    pub plan: Plan,
    started: Instant,
    progress: Mutex<Option<Value>>,
    finished: AtomicBool,
}

impl SelftestState {
    pub fn new(plan: Plan) -> Self {
        Self {
            plan,
            started: Instant::now(),
            progress: Mutex::new(None),
            finished: AtomicBool::new(false),
        }
    }

    pub fn is_finished(&self) -> bool {
        self.finished.load(Ordering::SeqCst)
    }

    pub fn set_progress(&self, step: Value) {
        eprintln!("[selftest] {step}");
        *lock(&self.progress) = Some(step);
    }

    pub fn last_progress(&self) -> Option<Value> {
        lock(&self.progress).clone()
    }

    /// logs/<name> 에 쓴다. 돌려주는 것은 쓴 절대 경로
    pub fn write_log(&self, name: &str, data: &[u8]) -> Result<PathBuf> {
        if !valid_name(name) {
            return Err(BackendError::outside_root(name));
        }
        let path = self.plan.work_dir.join(LOGS_DIR).join(name);
        write_atomic(&path, data).map_err(|e| BackendError::io(&e, Some(name)))?;
        Ok(path)
    }

    /// 보고서를 계획의 report 에 쓰고 끝났다고 표시한다. 두 번째부터는 쓰지 않는다
    pub fn finish(&self, report_json: &str) -> Result<()> {
        serde_json::from_str::<Value>(report_json).map_err(|e| {
            BackendError::new(ErrorCode::Io, format!("보고서 JSON 구문 오류: {e}"))
        })?;
        if self.finished.swap(true, Ordering::SeqCst) {
            return Ok(());
        }
        write_report(&self.plan.report, report_json.as_bytes())
    }

    pub fn timeout_report(&self) -> Value {
        json!({
            "version": 1,
            "ok": false,
            "error": "total_timeout",
            "totalTimeoutMs": self.plan.total_timeout.as_millis() as u64,
            "elapsedMs": self.started.elapsed().as_millis() as u64,
            "progress": self.last_progress(),
        })
    }

    /// 감시가 부른다. 이미 끝났으면(보고서를 썼으면) false
    pub fn finish_timeout(&self) -> bool {
        if self.finished.swap(true, Ordering::SeqCst) {
            return false;
        }
        let text = serde_json::to_string_pretty(&self.timeout_report()).unwrap_or_default();
        if let Err(e) = write_report(&self.plan.report, text.as_bytes()) {
            eprintln!("[selftest] 시간 초과 보고서 쓰기 실패: {}", e.message);
        }
        true
    }
}

fn write_report(path: &Path, data: &[u8]) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| BackendError::io(&e, Some(&parent.to_string_lossy())))?;
    }
    write_atomic(path, data).map_err(|e| BackendError::io(&e, Some(&path.to_string_lossy())))
}

/// 환경 변수의 계획을 읽고 폴더를 만든다. 변수가 없으면 None. 오류면 창을 만들기 전에 2 로 끝낼 일이다
pub fn from_env() -> std::result::Result<Option<Arc<SelftestState>>, String> {
    let Some(path) = std::env::var_os(ENV_PLAN).filter(|v| !v.is_empty()) else {
        return Ok(None);
    };
    let plan = load(Path::new(&path))?;
    prepare(&plan)?;
    eprintln!(
        "[selftest] 계획 {} (workDir {}, 창 {})",
        Path::new(&path).display(),
        plan.work_dir.display(),
        if plan.show_window { "보임" } else { "숨김" }
    );
    Ok(Some(Arc::new(SelftestState::new(plan))))
}

/// 전체 시간 감시. 끝나기 전에 시간이 다 되면 시간 초과 보고서를 쓰고 on_timeout 을 부른다 (앱을 1 로 끝낸다)
pub fn watch(
    state: Arc<SelftestState>,
    on_timeout: impl FnOnce() + Send + 'static,
) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let deadline = state.started + state.plan.total_timeout;
        while Instant::now() < deadline {
            if state.is_finished() {
                return;
            }
            thread::sleep(WATCH_POLL);
        }
        if state.finish_timeout() {
            eprintln!(
                "[selftest] 전체 시간 {} ms 초과. 보고서: {}",
                state.plan.total_timeout.as_millis(),
                state.plan.report.display()
            );
            on_timeout();
        }
    })
}

/// 떠 있는 엔진 프로세스를 모두 멈춘다 (끝내기 전에)
pub fn stop_engines(engine: &EngineState) {
    for id in engine.running_ids() {
        let _ = engine.stop(id);
    }
}

/// 떠 있는 엔진을 멈추고 프로세스를 code 로 끝낸다. 보고서는 이미 썼고 자가 검사는 남길 상태가 없다 (창 위치도 설정도
/// 저장하지 않는다). app.exit 는 macOS 에서 종료 코드를 0 으로 바꾸므로 쓰지 않는다
pub fn exit_app(_app: &AppHandle, engine: &EngineState, code: i32) {
    stop_engines(engine);
    std::process::exit(code);
}

/// 관리 상태. 자가 검사가 아니면 None
pub struct SelftestSlot(pub Option<Arc<SelftestState>>);

fn active<'a>(slot: &'a State<'_, SelftestSlot>) -> Result<&'a Arc<SelftestState>> {
    slot.0
        .as_ref()
        .ok_or_else(|| BackendError::new(ErrorCode::Unsupported, "자가 검사 모드 아님"))
}

#[tauri::command]
pub fn selftest_plan(slot: State<'_, SelftestSlot>) -> Option<Value> {
    slot.0.as_ref().map(|s| s.plan.raw.clone())
}

#[tauri::command]
pub fn selftest_progress(slot: State<'_, SelftestSlot>, step: Value) -> Result<()> {
    active(&slot)?.set_progress(step);
    Ok(())
}

#[tauri::command(async)]
pub fn selftest_write_log(
    slot: State<'_, SelftestSlot>,
    name: String,
    text: String,
    encoding: Option<String>,
) -> Result<String> {
    let state = active(&slot)?;
    let data = match encoding.as_deref() {
        None | Some("utf8") => text.into_bytes(),
        Some("base64") => base64::engine::general_purpose::STANDARD
            .decode(text.as_bytes())
            .map_err(|e| BackendError::new(ErrorCode::Io, format!("base64 구문 오류: {e}")))?,
        Some(other) => {
            return Err(BackendError::new(
                ErrorCode::Unsupported,
                format!("지원하지 않는 encoding: {other}"),
            ))
        }
    };
    let path = state.write_log(&name, &data)?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command(async)]
pub fn selftest_finish(
    app: AppHandle,
    slot: State<'_, SelftestSlot>,
    engine: State<'_, Arc<EngineState>>,
    report: String,
    code: i32,
) -> Result<()> {
    let state = active(&slot)?;
    state.finish(&report)?;
    let code = code.clamp(0, EXIT_PLAN_ERROR);
    eprintln!(
        "[selftest] 종료 (코드 {code}). 보고서: {}",
        state.plan.report.display()
    );
    exit_app(&app, &engine, code);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;

    fn plan_json(work: &Path, extra: Value) -> String {
        let mut v = json!({
            "version": 1,
            "workDir": work,
            "report": work.join("report.json"),
            "totalTimeoutMs": 600000,
            "projects": [{ "id": "flappy-lua", "template": "flappy" }, { "id": "tilemap", "template": "tilemap" }]
        });
        if let (Some(obj), Some(more)) = (v.as_object_mut(), extra.as_object()) {
            for (k, val) in more {
                obj.insert(k.clone(), val.clone());
            }
        }
        v.to_string()
    }

    #[test]
    fn parses_a_plan() {
        let dir = tempfile::tempdir().unwrap();
        let work = dir.path().join("run");
        let plan = parse_plan(&plan_json(&work, json!({}))).unwrap();
        assert_eq!(plan.work_dir, work);
        assert_eq!(plan.report, work.join("report.json"));
        assert_eq!(plan.total_timeout, Duration::from_millis(600000));
        assert!(!plan.show_window);
        assert_eq!(
            plan.project_dirs,
            vec![work.join("flappy-lua"), work.join("tilemap")]
        );
        assert_eq!(plan.raw["projects"][0]["template"], "flappy");
        let shown = parse_plan(&plan_json(&work, json!({ "showWindow": true }))).unwrap();
        assert!(shown.show_window);
    }

    #[test]
    fn a_project_with_root_is_not_created() {
        let dir = tempfile::tempdir().unwrap();
        let work = dir.path().join("run");
        let fixture = dir.path().join("forest");
        let plan = parse_plan(&plan_json(
            &work,
            json!({ "projects": [{ "id": "forest", "root": fixture }] }),
        ))
        .unwrap();
        assert!(plan.project_dirs.is_empty());
        let relative = parse_plan(&plan_json(
            &work,
            json!({ "projects": [{ "id": "forest", "root": "forest" }] }),
        ));
        assert!(relative.unwrap_err().contains("root"));
    }

    #[test]
    fn rejects_bad_plans() {
        let dir = tempfile::tempdir().unwrap();
        let work = dir.path().join("run");
        let cases = [
            ("{", "JSON"),
            ("[]", "객체"),
            (
                &plan_json(&work, json!({ "version": 2 })) as &str,
                "version",
            ),
            (
                &plan_json(&work, json!({ "workDir": "relative/run" })),
                "workDir",
            ),
            (&plan_json(&work, json!({ "report": null })), "report"),
            (
                &plan_json(&work, json!({ "totalTimeoutMs": 10 })),
                "totalTimeoutMs",
            ),
            (
                &plan_json(&work, json!({ "totalTimeoutMs": 99_999_999 })),
                "totalTimeoutMs",
            ),
            (
                &plan_json(&work, json!({ "showWindow": "yes" })),
                "showWindow",
            ),
            (&plan_json(&work, json!({ "projects": [] })), "비어 있음"),
            (
                &plan_json(&work, json!({ "projects": [{ "id": "../x" }] })),
                "id",
            ),
            (
                &plan_json(&work, json!({ "projects": [{ "id": "logs" }] })),
                "logs",
            ),
            (
                &plan_json(&work, json!({ "projects": [{ "id": "a" }, { "id": "a" }] })),
                "중복",
            ),
        ];
        for (text, needle) in cases {
            let err = parse_plan(text).unwrap_err();
            assert!(err.contains(needle), "{needle} 가 없다: {err}");
        }
    }

    #[test]
    fn prepare_makes_folders_and_refuses_an_existing_work_dir() {
        let dir = tempfile::tempdir().unwrap();
        let work = dir.path().join("run");
        let plan = parse_plan(&plan_json(&work, json!({}))).unwrap();
        prepare(&plan).unwrap();
        assert!(work.join("logs").is_dir());
        assert!(work.join("flappy-lua").is_dir());
        assert!(work.join("tilemap").is_dir());
        // 두 번째는 계획 오류이고 안에 둔 것을 지우지 않는다
        fs::write(work.join("keep.txt"), "x").unwrap();
        let err = prepare(&plan).unwrap_err();
        assert!(err.contains("이미 있음"), "{err}");
        assert!(work.join("keep.txt").exists());
    }

    #[test]
    fn log_names_stay_inside_logs() {
        for good in ["flappy-lua-1.log", "tilemap-1.bmp", "forest_map.bmp", "a"] {
            assert!(valid_name(good), "{good}");
        }
        for bad in [
            "",
            "../x",
            "a/b",
            "a\\b",
            ".hidden",
            "..",
            "한글.log",
            "a b",
            &"x".repeat(200),
        ] {
            assert!(!valid_name(bad), "{bad}");
        }
        let dir = tempfile::tempdir().unwrap();
        let work = dir.path().join("run");
        let plan = parse_plan(&plan_json(&work, json!({}))).unwrap();
        prepare(&plan).unwrap();
        let state = SelftestState::new(plan);
        let written = state
            .write_log("flappy-lua-1.log", "줄 하나\n".as_bytes())
            .unwrap();
        assert_eq!(written, work.join("logs").join("flappy-lua-1.log"));
        assert_eq!(fs::read_to_string(&written).unwrap(), "줄 하나\n");
        let err = state.write_log("../escape.log", b"x").unwrap_err();
        assert_eq!(err.code, ErrorCode::OutsideRoot);
        assert!(!work.join("escape.log").exists());
        assert!(!dir.path().join("escape.log").exists());
    }

    #[test]
    fn finish_writes_the_report_once() {
        let dir = tempfile::tempdir().unwrap();
        let work = dir.path().join("run");
        let plan = parse_plan(&plan_json(&work, json!({}))).unwrap();
        prepare(&plan).unwrap();
        let state = SelftestState::new(plan);
        assert!(state.finish("not json").is_err());
        assert!(!state.is_finished());
        state.finish(r#"{"version":1,"ok":true}"#).unwrap();
        assert!(state.is_finished());
        state.finish(r#"{"version":1,"ok":false}"#).unwrap();
        let text = fs::read_to_string(work.join("report.json")).unwrap();
        assert_eq!(text, r#"{"version":1,"ok":true}"#);
        // 끝난 뒤에는 감시가 덮어쓰지 않는다
        assert!(!state.finish_timeout());
    }

    #[test]
    fn watchdog_writes_a_timeout_report_with_the_last_step() {
        let dir = tempfile::tempdir().unwrap();
        let work = dir.path().join("run");
        let plan = parse_plan(&plan_json(
            &work,
            json!({ "totalTimeoutMs": MIN_TOTAL_TIMEOUT_MS }),
        ))
        .unwrap();
        prepare(&plan).unwrap();
        let state = Arc::new(SelftestState::new(plan));
        state.set_progress(json!({ "project": "flappy-lua", "step": "run", "run": 1 }));
        let calls = Arc::new(AtomicUsize::new(0));
        let c = calls.clone();
        watch(state.clone(), move || {
            c.fetch_add(1, Ordering::SeqCst);
        })
        .join()
        .unwrap();
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        let report: Value =
            serde_json::from_str(&fs::read_to_string(work.join("report.json")).unwrap()).unwrap();
        assert_eq!(report["ok"], false);
        assert_eq!(report["error"], "total_timeout");
        assert_eq!(report["progress"]["project"], "flappy-lua");
        assert_eq!(report["progress"]["step"], "run");
        assert!(report["elapsedMs"].as_u64().unwrap() >= MIN_TOTAL_TIMEOUT_MS);
    }

    #[test]
    fn watchdog_stays_quiet_after_finish() {
        let dir = tempfile::tempdir().unwrap();
        let work = dir.path().join("run");
        let plan = parse_plan(&plan_json(
            &work,
            json!({ "totalTimeoutMs": MIN_TOTAL_TIMEOUT_MS }),
        ))
        .unwrap();
        prepare(&plan).unwrap();
        let state = Arc::new(SelftestState::new(plan));
        state.finish(r#"{"version":1,"ok":true}"#).unwrap();
        let calls = Arc::new(AtomicUsize::new(0));
        let c = calls.clone();
        watch(state, move || {
            c.fetch_add(1, Ordering::SeqCst);
        })
        .join()
        .unwrap();
        assert_eq!(calls.load(Ordering::SeqCst), 0);
        assert_eq!(
            fs::read_to_string(work.join("report.json")).unwrap(),
            r#"{"version":1,"ok":true}"#
        );
    }
}
