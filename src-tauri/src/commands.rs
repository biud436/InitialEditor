// Tauri 명령 (docs/plans/01-tech-stack.md 6절의 표). 얇은 껍데기다: 상태를 꺼내 각 모듈을 부르고,
// 오류는 BackendError 그대로 직렬화한다. 프런트 래퍼는 packages/backend-tauri/src/index.ts.
//
// 계약 요약
//   project_open(path) → ProjectInfo, project_close()
//   fs_list(rel), fs_read_text(rel), fs_read_binary(rel) → 바이트(ArrayBuffer), fs_write_text(rel, text),
//   fs_write_binary(raw body + 헤더 x-rel), fs_mkdir(rel), fs_remove(rel), fs_rename(from, to), fs_exists(rel)
//   hmr_push(host, port, files[{path, data(base64)}]) → { count }
//   engine_run(exe, cwd, args, env) → { id, pid }, engine_stop(id), engine_features(exe) → string[]
//   settings_load() → string | null, settings_save(json)
// 이벤트: fs:change { path, kind, origin }, engine:output { id, stream, line }, engine:exit { id, code }
//
// 동기 명령은 메인 스레드에서 돌므로 파일과 소켓을 만지는 것은 전부 `async` 로 표시해 별도 스레드에서 돈다.
// fs_write_binary 만 raw body(빌려 온 Request)를 받아야 해서 동기다. 파일 쓰기 하나라 짧다.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use percent_encoding::percent_decode_str;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::engine::{self, EngineState, RunInfo};
use crate::error::{BackendError, ErrorCode, Result};
use crate::fsutil::lock;
use crate::hmr::{self, HmrFile, PushResult};
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
                "[initial-editor] 파일 감시를 켤 수 없다 ({}): {e}",
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
            "fs_write_binary 는 raw body 가 필요하다",
        ));
    };
    let encoded = request
        .headers()
        .get(HEADER_REL)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| BackendError::new(ErrorCode::Io, "fs_write_binary 에 x-rel 헤더가 없다"))?;
    let rel = percent_decode_str(encoded)
        .decode_utf8()
        .map_err(|_| BackendError::new(ErrorCode::Io, "x-rel 헤더가 UTF-8 이 아니다"))?;
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

#[tauri::command(async)]
pub fn engine_features(exe: String) -> Result<Vec<String>> {
    engine::features(&exe)
}

fn config_dir(app: &AppHandle) -> Result<PathBuf> {
    app.path()
        .app_config_dir()
        .map_err(|e| BackendError::new(ErrorCode::Io, format!("앱 설정 폴더를 찾을 수 없다: {e}")))
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
    args.iter().position(|a| a == "--open").and_then(|i| args.get(i + 1).cloned())
}
