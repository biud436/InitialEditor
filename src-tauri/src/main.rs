// 데스크톱 진입점. 본체는 lib.rs 의 run() 이다 (Tauri 2 표준 구조).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    initial_editor_lib::run()
}
