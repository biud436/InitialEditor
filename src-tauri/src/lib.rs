// InitialEditor 데스크톱 셸 (Tauri 2). Rust 는 명령 표(docs/plans/01-tech-stack.md 6절)만 맡는다.
// 파일 접근(project.rs), 감시(watcher.rs), 핫 리로드 push(hmr.rs), 엔진 프로세스(engine.rs), 설정(settings.rs)이
// 그 표의 전부이고, 메뉴와 창 상태와 테마는 프런트가 Tauri API 로 직접 한다.

pub mod commands;
pub mod engine;
pub mod error;
pub mod fsutil;
pub mod hmr;
pub mod paths;
pub mod project;
pub mod settings;
pub mod watcher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .manage(commands::AppState::default())
        .manage(std::sync::Arc::new(engine::EngineState::default()))
        .invoke_handler(tauri::generate_handler![
            commands::project_open,
            commands::project_close,
            commands::fs_list,
            commands::fs_read_text,
            commands::fs_read_binary,
            commands::fs_write_text,
            commands::fs_write_binary,
            commands::fs_mkdir,
            commands::fs_remove,
            commands::fs_rename,
            commands::fs_exists,
            commands::hmr_push,
            commands::engine_run,
            commands::engine_stop,
            commands::engine_features,
            commands::settings_load,
            commands::settings_save,
            commands::startup_open_path,
        ])
        .run(tauri::generate_context!())
        .expect("InitialEditor 를 시작할 수 없다");
}
