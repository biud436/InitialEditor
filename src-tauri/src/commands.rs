// Tauri 명령 (docs/plans/01-tech-stack.md 6절의 표). 얇은 껍데기다: 상태를 꺼내 각 모듈을 부르고,
// 오류는 BackendError 그대로 직렬화한다. 프런트 래퍼는 packages/backend-tauri/src/index.ts.
//
// 계약 요약
//   project_open(path) → ProjectInfo, project_close()
//   fs_list(rel), fs_read_text(rel), fs_read_binary(rel) → 바이트(ArrayBuffer), fs_write_text(rel, text),
//   fs_write_binary(raw body + 헤더 x-rel), fs_mkdir(rel), fs_remove(rel), fs_rename(from, to), fs_exists(rel)
//   hmr_push(host, port, files[{path, data(base64)}]) → { count }
//   engine_run(exe, cwd, args, env) → { id, pid }, engine_stop(id), engine_features(exe, timeout_ms?) → string[]
//   engine_exists(paths) → boolean[], engine_bundled() → { path, meta, metaError? } | null
//   settings_load() → string | null, settings_save(json)
//   lsp_available() → { exe, version } | null, lsp_start(root, channel, library?) → { id, pid, exe, version, library },
//   lsp_send(id, text), lsp_stop(id). 서버의 메시지와 끝은 lsp_start 에 넘긴 채널로 온다 (LspEvent)
// 이벤트: fs:change { path, kind, origin }, engine:output { id, stream, line }, engine:exit { id, code }
//
// 동기 명령은 메인 스레드에서 돌므로 파일과 소켓을 만지는 것은 전부 `async` 로 표시해 별도 스레드에서 돈다.
// fs_write_binary 만 raw body(빌려 온 Request)를 받아야 해서 동기다. 파일 쓰기 하나라 짧다.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use percent_encoding::percent_decode_str;
use tauri::ipc::{Channel, InvokeBody, Request, Response};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::bundled::{self, BundledEngine};
use crate::engine::{self, EngineState, RunInfo};
use crate::error::{BackendError, ErrorCode, Result};
use crate::fsutil::lock;
use crate::hmr::{self, HmrFile, PushResult};
use crate::lsp::{self, LspEvent, LspInfo, LspState};
use crate::project::{Entry, ProjectFs, ProjectInfo};
use crate::settings;
use crate::watcher::{self, WatcherCore, WatcherHandle};

pub const EVENT_FS_CHANGE: &str = "fs:change";
pub const EVENT_ENGINE_OUTPUT: &str = "engine:output";
pub const EVENT_ENGINE_EXIT: &str = "engine:exit";
/// fs_write_binary 가 상대 경로를 받는 헤더 (값은 percent 인코딩된 UTF-8)
pub const HEADER_REL: &str = "x-rel";

pub struct OpenProject {
    pub fs: ProjectFs,
    /// 감시를 켜지 못한 환경이면 None (프로젝트는 열린다)
    pub watcher: Option<WatcherHandle>,
}

#[derive(Default)]
pub struct AppState {
    pub project: Mutex<Option<OpenProject>>,
}

fn with_fs<T>(state: &AppState, f: impl FnOnce(&ProjectFs) -> Result<T>) -> Result<T> {
    let guard = lock(&state.project);
    match guard.as_ref() {
        Some(project) => f(&project.fs),
        None => Err(BackendError::not_open()),
    }
}

#[tauri::command(async)]
pub fn project_open(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<ProjectInfo> {
    let fs = ProjectFs::open(&path)?;
    let info = fs.info();
    let emitter = app.clone();
    let core = WatcherCore::new(fs.root().to_path_buf(), fs.recent(), move |event| {
        let _ = emitter.emit(EVENT_FS_CHANGE, event);
    });
    let watcher = match watcher::start(core) {
        Ok(handle) => Some(handle),
        Err(e) => {
            eprintln!(
                "[initial-editor] 파일 감시 시작 실패 ({}): {e}",
                info.root
            );
            None
        }
    };
    // 이전 프로젝트와 그 감시는 여기서 놓인다
    *lock(&state.project) = Some(OpenProject { fs, watcher });
    Ok(info)
}

/// 감시를 끄고 루트를 잊는다. 그 뒤의 fs_* 는 not_open 이다.
#[tauri::command(async)]
pub fn project_close(state: State<'_, AppState>) -> Result<()> {
    let previous = lock(&state.project).take();
    drop(previous);
    Ok(())
}

#[tauri::command(async)]
pub fn fs_list(state: State<'_, AppState>, rel: String) -> Result<Vec<Entry>> {
    with_fs(&state, |fs| fs.list(&rel))
}

#[tauri::command(async)]
pub fn fs_read_text(state: State<'_, AppState>, rel: String) -> Result<String> {
    with_fs(&state, |fs| fs.read_text(&rel))
}

/// 바이트를 그대로 돌려준다 (JS 쪽은 ArrayBuffer 로 받는다)
#[tauri::command(async)]
pub fn fs_read_binary(state: State<'_, AppState>, rel: String) -> Result<Response> {
    with_fs(&state, |fs| fs.read(&rel)).map(Response::new)
}

#[tauri::command(async)]
pub fn fs_write_text(state: State<'_, AppState>, rel: String, text: String) -> Result<()> {
    with_fs(&state, |fs| fs.write(&rel, text.as_bytes()))
}

/// 본문이 파일 내용(raw body)이고 상대 경로는 `x-rel` 헤더(percent 인코딩)로 온다.
/// JS: invoke("fs_write_binary", bytes, { headers: { "x-rel": encodeURIComponent(rel) } })
#[tauri::command]
pub fn fs_write_binary(state: State<'_, AppState>, request: Request<'_>) -> Result<()> {
    let InvokeBody::Raw(data) = request.body() else {
        return Err(BackendError::new(
            ErrorCode::Io,
            "fs_write_binary: raw body가 필요합니다",
        ));
    };
    let encoded = request
        .headers()
        .get(HEADER_REL)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| BackendError::new(ErrorCode::Io, "fs_write_binary: x-rel 헤더가 없습니다"))?;
    let rel = percent_decode_str(encoded)
        .decode_utf8()
        .map_err(|_| BackendError::new(ErrorCode::Io, "x-rel 헤더가 UTF-8이 아닙니다"))?;
    with_fs(&state, |fs| fs.write(&rel, data))
}

#[tauri::command(async)]
pub fn fs_mkdir(state: State<'_, AppState>, rel: String) -> Result<()> {
    with_fs(&state, |fs| fs.mkdir(&rel))
}

#[tauri::command(async)]
pub fn fs_remove(state: State<'_, AppState>, rel: String) -> Result<()> {
    with_fs(&state, |fs| fs.remove(&rel))
}

#[tauri::command(async)]
pub fn fs_rename(state: State<'_, AppState>, from: String, to: String) -> Result<()> {
    with_fs(&state, |fs| fs.rename(&from, &to))
}

#[tauri::command(async)]
pub fn fs_exists(state: State<'_, AppState>, rel: String) -> Result<bool> {
    with_fs(&state, |fs| fs.exists(&rel))
}

#[tauri::command(async)]
pub fn hmr_push(host: String, port: u16, files: Vec<HmrFile>) -> Result<PushResult> {
    hmr::push(&host, port, &files)
}

#[tauri::command(async)]
pub fn engine_run(
    app: AppHandle,
    engine: State<'_, Arc<EngineState>>,
    exe: String,
    cwd: String,
    args: Option<Vec<String>>,
    env: Option<HashMap<String, String>>,
) -> Result<RunInfo> {
    let output_app = app.clone();
    let exit_app = app;
    EngineState::spawn(
        engine.inner(),
        &exe,
        &cwd,
        &args.unwrap_or_default(),
        &env.unwrap_or_default(),
        move |event| {
            let _ = output_app.emit(EVENT_ENGINE_OUTPUT, event);
        },
        move |event| {
            let _ = exit_app.emit(EVENT_ENGINE_EXIT, event);
        },
    )
}

#[tauri::command(async)]
pub fn engine_stop(engine: State<'_, Arc<EngineState>>, id: u32) -> Result<()> {
    engine.stop(id)
}

/// `exe --features`. timeout_ms 가 없으면 5초 (앱에 든 엔진은 프런트가 15초를 준다). 결과를 stderr 에 한 줄 남긴다
#[tauri::command(async)]
pub fn engine_features(exe: String, timeout_ms: Option<u64>) -> Result<Vec<String>> {
    let started = std::time::Instant::now();
    let result = engine::features(&exe, engine::features_timeout(timeout_ms));
    let ms = started.elapsed().as_millis();
    match &result {
        Ok(words) => eprintln!(
            "[initial-editor] {exe} --features: {} ({ms} ms)",
            words.join(" ")
        ),
        Err(e) => eprintln!(
            "[initial-editor] {exe} --features 실패 ({ms} ms): {}",
            e.message
        ),
    }
    result
}

/// 경로마다 파일이 있는지. 실행하지 않는다 (신뢰를 묻기 전의 확인)
#[tauri::command(async)]
pub fn engine_exists(paths: Vec<String>) -> Vec<bool> {
    engine::exists(&paths)
}

/// 메인 실행 파일 옆의 사이드카와 번들 리소스의 engine.json. 사이드카가 없으면 null
#[tauri::command(async)]
pub fn engine_bundled(app: AppHandle) -> Option<BundledEngine> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;
    let resources = app.path().resource_dir().ok();
    let found = bundled::find(dir, resources.as_deref());
    match &found {
        Some(engine) => eprintln!(
            "[initial-editor] 앱에 든 엔진: {} ({})",
            engine.path,
            engine
                .meta
                .as_ref()
                .map(|m| format!(
                    "{} {}",
                    m.describe.as_deref().unwrap_or(""),
                    m.engine_commit
                ))
                .or_else(|| engine.meta_error.clone())
                .unwrap_or_default()
        ),
        None => eprintln!("[initial-editor] 앱에 든 엔진 없음 ({})", dir.display()),
    }
    found
}

fn config_dir(app: &AppHandle) -> Result<PathBuf> {
    app.path()
        .app_config_dir()
        .map_err(|e| BackendError::new(ErrorCode::Io, format!("앱 설정 폴더 경로 확인 실패: {e}")))
}

#[tauri::command(async)]
pub fn settings_load(app: AppHandle) -> Result<Option<String>> {
    settings::load(&config_dir(&app)?)
}

#[tauri::command(async)]
pub fn settings_save(app: AppHandle, json: String) -> Result<()> {
    settings::save(&config_dir(&app)?, &json)
}

/// 시작할 때 열 프로젝트. 환경 변수 INITIAL_EDITOR_OPEN 또는 인자 `--open <경로>`.
/// 브리지 모드의 `?url=` 에 대응하며, Tauri 창의 자동 검수(스크린샷)도 이것으로 프로젝트를 연다.
#[tauri::command]
pub fn startup_open_path() -> Option<String> {
    if let Ok(path) = std::env::var("INITIAL_EDITOR_OPEN") {
        if !path.trim().is_empty() {
            return Some(path);
        }
    }
    let args: Vec<String> = std::env::args().collect();
    args.iter()
        .position(|a| a == "--open")
        .and_then(|i| args.get(i + 1).cloned())
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LspAvailable {
    pub exe: String,
    pub version: Option<String>,
}

fn luals_exe(app: &AppHandle) -> Option<PathBuf> {
    lsp::find_luals(app.path().resource_dir().ok().as_deref())
}

/// 앱에 든 LuaLS. 없으면 null (브라우저와 같은 명세 공급자를 쓴다)
#[tauri::command(async)]
pub fn lsp_available(app: AppHandle) -> Option<LspAvailable> {
    let exe = luals_exe(&app)?;
    Some(LspAvailable {
        exe: exe.to_string_lossy().into_owned(),
        version: lsp::read_version(&exe),
    })
}

/// 프로젝트 루트에서 LuaLS 를 띄운다. 로그와 생성 메타 파일은 앱 폴더에 둔다 (설치 폴더는 읽기 전용일 수 있다).
/// library 가 있으면 엔진 API 스텁의 글이고, 앱 캐시의 luals-library/initial2d.lua 에 써서 그 경로를 돌려준다
#[tauri::command(async)]
pub fn lsp_start(
    app: AppHandle,
    state: State<'_, Arc<LspState>>,
    root: String,
    channel: Channel<LspEvent>,
    library: Option<String>,
) -> Result<LspInfo> {
    let exe = luals_exe(&app).ok_or_else(|| {
        BackendError::new(ErrorCode::NotFound, "앱에 든 언어 서버(LuaLS)가 없습니다")
    })?;
    let path = app.path();
    let log = path
        .app_log_dir()
        .map_err(|e| BackendError::new(ErrorCode::Io, format!("앱 로그 폴더 경로 확인 실패: {e}")))?
        .join("luals");
    let meta = path
        .app_cache_dir()
        .map_err(|e| BackendError::new(ErrorCode::Io, format!("앱 캐시 폴더 경로 확인 실패: {e}")))?
        .join("luals-meta");
    for dir in [&log, &meta] {
        std::fs::create_dir_all(dir).map_err(|e| BackendError::io(&e, Some(&dir.to_string_lossy())))?;
    }
    let library_path = match library {
        Some(text) => {
            let dir = meta
                .parent()
                .map(|p| p.join("luals-library"))
                .unwrap_or_else(|| meta.join("library"));
            std::fs::create_dir_all(&dir)
                .map_err(|e| BackendError::io(&e, Some(&dir.to_string_lossy())))?;
            let file = dir.join("initial2d.lua");
            std::fs::write(&file, text)
                .map_err(|e| BackendError::io(&e, Some(&file.to_string_lossy())))?;
            Some(file.to_string_lossy().into_owned())
        }
        None => None,
    };
    let args = vec![
        format!("--logpath={}", log.to_string_lossy()),
        format!("--metapath={}", meta.to_string_lossy()),
    ];
    let mut info = LspState::spawn(state.inner(), &exe, std::path::Path::new(&root), &args, move |event| {
        let _ = channel.send(event);
    })?;
    info.library = library_path;
    eprintln!(
        "[initial-editor] 언어 서버 시작: {} {} (pid {}, {root})",
        info.exe,
        info.version.as_deref().unwrap_or(""),
        info.pid
    );
    Ok(info)
}

#[tauri::command(async)]
pub fn lsp_send(state: State<'_, Arc<LspState>>, id: u32, text: String) -> Result<()> {
    state.send(id, &text)
}

#[tauri::command(async)]
pub fn lsp_stop(state: State<'_, Arc<LspState>>, id: u32) {
    state.stop(id);
}
