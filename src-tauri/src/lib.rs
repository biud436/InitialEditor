// InitialEditor 데스크톱 셸 (Tauri 2). Rust 는 명령 표(docs/plans/01-tech-stack.md 6절)만 맡는다.
// 파일 접근(project.rs), 감시(watcher.rs), 핫 리로드 push(hmr.rs), 엔진 프로세스(engine.rs), 앱에 든 엔진(bundled.rs),
// 설정(settings.rs)이 그 표의 전부이고, 메뉴와 창 상태와 테마는 프런트가 Tauri API 로 직접 한다.
// 바깥 링크는 opener 플러그인이 연다 (capabilities/default.json 이 주소를 좁힌다).
// 창 main 은 설정(tauri.conf.json, create: false)대로 여기서 만든다. 자가 검사(selftest.rs)면 계획의 showWindow 로
// 보임을 정하고, 사용자의 상태를 건드리지 않게 window-state 플러그인을 붙이지 않고 웹뷰 저장소를 남기지 않는다.

pub mod android;
pub mod bundled;
pub mod commands;
pub mod engine;
pub mod error;
pub mod fsutil;
pub mod hmr;
pub mod paths;
pub mod project;
pub mod selftest;
pub mod settings;
pub mod watcher;

use std::sync::Arc;

use tauri::Manager;

pub const MAIN_WINDOW: &str = "main";

/// 설정의 창 main 을 만든다. 자가 검사면 계획대로 보이거나 숨기고, 저장소를 남기지 않는 웹뷰로
fn create_main_window(
    app: &tauri::App,
    selftest: Option<&selftest::SelftestState>,
) -> Result<(), Box<dyn std::error::Error>> {
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == MAIN_WINDOW)
        .cloned()
        .ok_or("tauri.conf.json 에 창 main 이 없다")?;
    let mut builder = tauri::WebviewWindowBuilder::from_config(app.handle(), &config)?;
    if let Some(state) = selftest {
        let show = state.plan.show_window;
        // 숨은 웹뷰는 몇 초 뒤 타이머를 멈춘다 (WebKit). 자가 검사는 기다리는 동안에도 돌아야 한다 (macOS 14 이상)
        builder = builder
            .visible(show)
            .focused(show)
            .incognito(true)
            .background_throttling(tauri::utils::config::BackgroundThrottlingPolicy::Disabled);
        // 숨은 자가 검사는 Dock 아이콘도 초점도 가져가지 않는다
        #[cfg(target_os = "macos")]
        if !show {
            app.handle()
                .set_activation_policy(tauri::ActivationPolicy::Accessory)?;
        }
    }
    builder.build()?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 계획은 창을 만들기 전에 읽는다. 틀리면 창 없이 2 로 끝난다
    let selftest = match selftest::from_env() {
        Ok(state) => state,
        Err(e) => {
            eprintln!("[selftest] 계획 오류: {e}");
            std::process::exit(selftest::EXIT_PLAN_ERROR);
        }
    };
    let mut builder = tauri::Builder::default().plugin(tauri_plugin_dialog::init());
    if selftest.is_none() {
        builder = builder.plugin(tauri_plugin_window_state::Builder::new().build());
    }
    let setup_selftest = selftest.clone();
    builder
        .plugin(tauri_plugin_opener::init())
        .manage(commands::AppState::default())
        .manage(Arc::new(engine::EngineState::default()))
        .manage(selftest::SelftestSlot(selftest))
        .setup(move |app| {
            create_main_window(app, setup_selftest.as_deref())?;
            if let Some(state) = setup_selftest {
                let handle = app.handle().clone();
                selftest::watch(state, move || {
                    let engine = handle.state::<Arc<engine::EngineState>>();
                    selftest::exit_app(&handle, &engine, selftest::EXIT_FAILED);
                });
            }
            Ok(())
        })
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
            commands::engine_exists,
            commands::engine_bundled,
            commands::settings_load,
            commands::settings_save,
            commands::startup_open_path,
            android::android_stage,
            android::android_repo_probe,
            selftest::selftest_plan,
            selftest::selftest_progress,
            selftest::selftest_write_log,
            selftest::selftest_finish,
        ])
        .run(tauri::generate_context!())
        .expect("InitialEditor 를 시작할 수 없다");
}
