# E6: 배포. 설치 하나로 편집하고 실행한다

**권장 모델**: Claude Opus 5. 대부분이 설정, 스크립트, 워크플로우다. 다만 사이드카 계약(찾는 순서, 신뢰 규칙, `engine-pin.json`, `engine.json`)과
자가 검사 계약(5절)은 이후의 모든 릴리스가 기대는 토대라 그 두 곳의 설계와 첫 구현은 Fable 5 로 한다. 엔진 R4 의 정적 링크
(SDL2 소스 빌드와 mruby)에서 같은 실패가 두 번 나면 Fable 5 로 올린다.

> 목표: **태그 하나를 밀면 CI 가 macOS, Windows, Linux 설치 파일을 만들고, 그 설치본이 새 프로젝트 셋(플래피 Lua, 플래피 Ruby, 타일맵)을
> 만들어 동봉한 엔진으로 돌리고, 맵 문서로 칠한 타일이 엔진 화면에 그대로 나오는 것까지 스스로 확인한 뒤 초안 릴리스에 올린다.**
> 같은 커밋의 웹판은 Cloudflare Pages 에서 돌고, 안드로이드는 열린 프로젝트를 엔진의 안드로이드 에셋 폴더로 스테이징하는 데까지 에디터가 한다.

## 왜 지금

저자의 목표는 에디터를 끝내는 것이다. 지금 이 에디터를 쓰려면 저장소 둘을 받고, Homebrew 로 SDL2 와 mruby 를 깔고, 엔진을 CMake 로
빌드하고, Rust 를 올리고, `yarn tauri dev` 를 띄워야 한다. 저자 말고는 아무도 못 쓴다. 이 단계가 끝나면 dmg 하나를 받아 열고,
"타일맵" 템플릿으로 새 프로젝트를 만들고, 맵을 칠하고, F5 를 누르면 칠한 맵이 게임 창에 뜬다. "엔진을 빌드하지 않고 맵 위에서 고치고
그 자리에서 실행" 은 텍스트 편집기와 터미널로는 안 되는 일이다.

그 이야기가 새 설치본에서 참이 되려면 칠할 맵이 있어야 한다. 지금 새 프로젝트 템플릿(28개 파일)에는 타일셋도 맵도 오브젝트 스키마도
없고, E3 의 "새 맵 만들기" 는 아직 옛 작업 항목에 있다. 그래서 이 단계가 장르 중립 **타일맵 템플릿**(작은 타일셋, 맵 한 장, 타일맵
오브젝트 하나인 씬, 오브젝트 스키마)을 더한다 (3.1 절, 마일스톤 2 와 3). 새 맵 만들기는 여전히 E3 의 몫이고 이 단계는 그것을 기다리지 않는다.

이 단계에 장르 개념은 없다. 설치 파일, 엔진 동봉, 타일맵 템플릿, 웹판, 안드로이드 스테이징 모두 플래피버드에도 그대로 말이 된다.

## 현재 상태 (2026-09-27 조사)

### 에디터 (InitialEditor, `feat/e4-play` 기준)

| 항목 | 상태 |
|---|---|
| Tauri 설정 | `src-tauri/tauri.conf.json`: `productName` InitialEditor, `version` 2.0.0, `identifier` `com.biud436.initialeditor`, `bundle.targets` "all", `category` DeveloperTool, 아이콘 다섯(32, 128, 128@2x, icns, ico. `src-tauri/icons/` 에는 Windows 스토어용 Square 로고까지 있다). 창 `main` 하나를 설정에서 만든다. `externalBin`, `resources`, 플랫폼별 절(macOS, windows, linux), 게시자와 라이선스 칸이 없다. `app.security.csp` 는 null 이고 그 결정의 기록이 없다. `window-state` 플러그인이 창 위치를 앱 설정 폴더에 남긴다. Tauri 크레이트 2.11.6, CLI 2.11.5 |
| 판 | 워크스페이스 `package.json` 일곱 개가 `2.0.0-dev`, `tauri.conf.json` 과 `Cargo.toml` 이 `2.0.0`. 태그 없음. 정보 창은 `__APP_VERSION__`(app 의 package.json)만 보인다 |
| 엔진 찾기 | `packages/app/src/editor/runner/engineCandidates.ts`: 설정의 `enginePath` > `.initial-editor/engine`(절대 경로도 받는다) > 프로젝트의 `build/Initial2D` > 형제 폴더 `../Initial2D/build/Initial2D`. `RunnerStore.resolveEngine` 이 차례로 `--features` 로 **실행해** 찔러(시간 제한 5초, `src-tauri/src/engine.rs` 의 상수 `FEATURES_TIMEOUT`, 명령 `engine_features(exe)` 는 시간 인자가 없다) 처음 답한 것을 쓴다. `runner/index.ts` 가 `projectOpened` 마다 이 탐색을 부르므로 **폴더를 열기만 해도 그 폴더가 가리키는 실행 파일이 돈다.** 동봉 엔진 후보는 없다. 03 문서 4절은 "E6 의 동봉 사이드카" 를 맨 뒤 후보로 적어 두었다 |
| 프로세스 | `engine.rs` 가 `std::process::Command` 로 직접 띄운다. shell 플러그인과 fs 플러그인은 열지 않았다 (`src-tauri/capabilities/default.json`). `project_open` 은 이미 있는 폴더만 열고 `fs_mkdir` 는 열린 루트 안의 상대 경로만 받는다. 01 문서 6절 표는 "E6 에서는 사이드카(shell 플러그인)" 라고 적었다 |
| 실행 방식 | `settings.runMode` 기본 `process`. `RunnerStore.mode` 가 설정을 읽고, `StartOptions` 는 `scene` 과 `env` 뿐이라 한 번의 실행이 방식을 고르려면 저장되는 설정을 바꿔야 한다. 엔진을 못 찾으면 실행 버튼이 이유를 띄울 뿐 웹 엔진으로 넘어가지 않는다 |
| 설정과 상태 | `TauriSettingsStorage` 가 Tauri `app_config_dir()`(identifier 별)에 쓴다. 최근 프로젝트도 설정 안이다. 레이아웃은 `localStorage` 와 프로젝트의 `.initial-editor/layout.json`. 코어에 `MemorySettingsStorage` 가 이미 있다 |
| CI | `.github/workflows/ci.yml` 하나, 전부 `macos-latest`: 웹(타입, 린트, Vitest, 브리지 적합성, 빌드, 색 검사, Playwright), Rust(`cargo test`), Tauri 디버그 빌드(산출물은 올리지 않는다). 웹 잡은 엔진 저장소를 **기본 브랜치로** 체크아웃한다. Windows 와 Linux 는 한 번도 빌드하지 않았다 |
| 웹 빌드 | `yarn build` 가 저장소 루트 `dist/` 로 낸다 (27 MB, 그중 소스맵 19 MB, 엔진 1.9 MB). Tauri 도 같은 `dist/` 를 `frontendDist` 로 싣는다. 웹 엔진은 `packages/app/public/engine/` 에 커밋한 사본(`Initial2D.js`, `Initial2D.wasm`, `initial2d-loader.js`, `MANIFEST.json`. 엔진 커밋 55d1bc3 을 40자로, 기능 `lua wasm`)이고 `gameView/engineAssets.ts` 가 `BASE_URL` 기준 `engine/` 에서 읽는다 |
| Cloudflare Pages | 저장소에 설정이 없다. `wrangler.toml`, `_headers`, `_redirects`, 배포 워크플로우 모두 없다. `vite.config.ts` 주석과 E1 문서가 "Pages 가 `yarn build` 뒤 `dist/` 를 배포한다" 고만 적는다. 설정은 대시보드(Git 연동)에 있고 주소와 프로덕션 브랜치는 기록이 없다. 통합 브랜치는 `next`(origin/HEAD)이고 `main` 은 2025-12-01 에 멈춰 있다 (`next` 의 조상이라 빨리 감기가 된다) |
| 템플릿 | `packages/app/templates/`(씬 로더 두 언어, `scene_types/tilemap`, 플래피 컴포넌트와 그림과 소리, `hangul.fnt` 폰트, API 명세, 진입 파일. 28개)를 Vite 가 번들에 넣는다. 타일셋, 맵, `resources/schema/map-objects.json` 은 없다. `yarn sync:templates` 가 엔진 체크아웃에서 복사한다 (MANIFEST 의 엔진 커밋은 7자 `1d41771`). 플래피 그림 넷(`resources/background_768x896.png`, `ground_768x64.png`, `bird_276x64.png`, `object_52x271.png`)은 **엔진 저장소가 추적하지 않는 생성물**이다 (`.gitignore` 의 `resources/*.*`, `tools/generate_placeholder_assets.py` 가 Pillow 로 만든다). 복사 스크립트는 원본이 없으면 종료 코드 1 이고, `templates.test.ts` 는 원본이 없으면 조용히 건너뛴다. 새 프로젝트는 `.gitignore`(`.initial-editor/`)도 쓴다 |
| 새 프로젝트 | Tauri 에서만 켜진다. `appCommands.ts` 의 `enabled: () => !browser`(`isBrowser` 는 Tauri 가 아닌 모든 모드)가 막는다. `FsAccessBackend` 는 `pickFolder: true` 이고 쓸 수 있다 |
| 샘플 프로젝트 | `sampleProject.ts` 의 `main.lua` 는 64x48 사각형을 칠하고 `sample:frame` 을 찍는다. 같은 샘플에 `resources/maps/meadow.json` 과 코드로 그린 타일셋이 있지만 게임은 그 맵을 읽지 않는다 |
| 링크 | 정보 창(`AboutDialog.tsx`)의 링크는 `<a target="_blank">` 이고 opener 플러그인이 없다. Tauri 웹뷰에서 새 창 요청은 처리기가 없으면 아무 일도 하지 않는다 |
| 라이선스 | 두 저장소 모두 루트에 `LICENSE` 파일이 없다. 에디터는 README 와 `package.json` 이 MIT |
| 앱 검수 선례 | E0 가 빌드한 `.app` 을 `INITIAL_EDITOR_OPEN=<임시 프로젝트>` 로 띄워 `.initial-editor/layout.json` 이 생기는지 봤다 (`commands.rs` 의 `startup_open_path`) |

### 엔진 (Initial2D, `master` 55d1bc3)

| 항목 | 상태 |
|---|---|
| macOS 빌드 | `build/Initial2D`(arm64, 3.2 MB)가 Homebrew 의 `/opt/homebrew/opt/sdl2*/lib/*.dylib` 셋을 동적으로 링크한다 (`otool -L`). 다른 맥에 옮기면 뜨지 않는다. libmruby 는 정적이다 (`--features` 는 `lua mruby`) |
| Linux | CMake 의 게임 실행 파일 조건(`NOT WIN32 AND SDL2_IMAGE_LIBRARY AND SDL2_MIXER_LIBRARY`)은 열려 있고 POSIX 어댑터에 `__linux__` 분기가 있다 (`/proc/self/exe`). mruby 는 Homebrew 경로만 찾는다. 빌드해 본 기록과 CI 가 없다 |
| Windows (SDL2) | 게임 실행 파일이 `NOT WIN32` 로 꺼져 있다. `src/Constants.h` 가 `_WIN32` 면 늘 `RS_WINDOWS` 를 정의하고 그 가드가 `src/` 의 22개 파일에 있다 (`src/platform/` 밖 15개, 안쪽 7개는 `HotReloadServer.cpp` 와 sdl2 어댑터들과 `sdl2Main.cpp`). 같은 헤더가 `_WIN32` 면 `RSLIB` 을 `__declspec(dllexport)` 로 바꾼다. MSVC 로 SDL2 판을 빌드하면 GDI 경로가 켜진다. 핫 리로드 서버는 POSIX 소켓이다. 즉 Windows SDL2 엔진은 없다 |
| 웹 | R3 완료. `tools/build_web.sh`(Emscripten 6.0.10, 로컬 `~/emsdk`)가 `build-web/site/` 를 만든다. CI 에서는 빌드하지 않는다. 스레드(`-pthread`)를 쓰지 않는다 |
| CI | `.github/workflows/tests.yml`: `macos-26` 에서 헤드리스 전체 검수 (`tests/run_all.sh`). 검수 전에 `generate_placeholder_assets.py` 로 그림을 만든다. 산출물은 실패 시 프레임 덤프뿐이고 릴리스 워크플로우는 없다. 태그는 `v1.0.0`, `v1.1.0`(GDI 판 보존) |
| 테스트 러너 | `tests/run_engine_tests.py <실행 파일> [--only=...]` 가 실행 파일 경로를 인자로 받는다. 배포용 실행 파일을 같은 검수에 넣을 수 있다 |
| 인자 | `src/platform/sdl2/sdl2Main.cpp` 는 `--features` 하나만 안다. 다른 인자는 무시하고 **게임을 띄운다** (`--version` 도 그렇다: 작업 폴더에 `config.setting` 을 다시 쓴다) |
| 실행 부작용 | 엔진은 시작할 때 작업 폴더(프로젝트 루트)에 `config.setting` 을 쓴다 (`src/main.cpp` `App::Initialize`, 실행 파일 경로와 작업 폴더가 들어간다). **이 파일을 읽는 코드는 없다** |
| 소리 | `AppSDL2.cpp` 174행의 `SDL_Init` 이 `SDL_INIT_AUDIO` 를 포함하고 실패하면 -1 로 끝난다. 쓸 수 있는 오디오 드라이버가 없는 CI 러너에서는 포장과 무관한 이유로 실행이 실패할 수 있다 |
| 안드로이드 | `android/download_sdl.sh`(SDL2 2.30.9, SDL2_image 2.8.2, SDL2_mixer 2.8.0 소스)와 `android/prepare_assets.sh`. `android/app/jni/CMakeLists.txt` 는 SDL 셋을 `add_subdirectory` 로 빌드하되 기본값대로 **공유 라이브러리**(`.so`)로 만들고, Apple 이 아니라 SDL2_image 가 stb 로 PNG 를 푼다. `prepare_assets.sh` 는 **엔진 저장소 자신**의 `scripts/`, `resources/`, `game.json`, `config.setting`, `db.sqlite` 를 `android/app/src/main/assets/` 로 복사하고 원본 폴더를 바꾸는 인자가 없다. `resources/RTP.zip` 만 빼므로 `resources/rtp/`(변환물, 이 맥에서 20 MB)는 들어간다. `assets_manifest.txt` 는 파일 목록이고, `src/platform/android/AndroidBootstrap.cpp` 는 기기에 풀어 둔 목록과 **바이트가 같으면 다시 풀지 않는다**. 그래서 파일 목록은 그대로이고 내용만 바뀐 프로젝트를 다시 넣으면 기기에는 옛 내용이 남는다 |
| 스테이징 규칙 | 세 벌이 다르다. 에디터 게임 탭(`gameView/staging.ts`): `resources/rtp/`, `resources/aldebaran/src/`, `.initial-editor/`, 점 이름, `*.zip`, `*.psd`, 32 MB 초과를 뺀다. 엔진 웹(`tools/web_stage.py`): `game.json`, `scripts/lua/`(Ruby 는 올리지 않는다), `resources/` 만 보고, `resources/rtp/`, `resources/RTP.zip`(다른 zip 은 올린다), `*.psd`, 점 이름, `resources/aldebaran/src/gpt/` 를 뺀다. 크기 규칙은 없다. 안드로이드: `RTP.zip` 과 점 이름만 |

## 결정 요약

| 물음 | 결정 | 절 |
|---|---|---|
| 엔진을 어떻게 싣나 | Tauri `bundle.externalBin` 사이드카 하나(`binaries/Initial2D-<타깃 트리플>`). 정적 링크한 자립 실행 파일이라 라이브러리 폴더가 없다. `externalBin` 은 릴리스 빌드에만 덮어쓰기 설정(`tauri.sidecar.conf.json`)으로 켠다 | 2 |
| 앱이 엔진을 찾는 순서 | 설정 > `.initial-editor/engine` > 프로젝트의 `build/` > **앱에 든 엔진** > 형제 폴더. 다 없으면 웹 엔진(에디터 안)으로 넘어간다 | 2.3 |
| 받은 프로젝트의 실행 파일 | **신뢰 규칙.** 신뢰하지 않은 프로젝트는 설정과 앱에 든 엔진만 찌른다. 프로젝트가 가리키는 실행 파일(`.initial-editor/engine`, `build/`, 형제 폴더)은 실행 파일 경로를 보인 한 번의 확인 뒤에만 부른다. 답은 프로젝트가 아니라 앱 설정에 남는다 | 2.3 |
| 엔진과 함께 실리는 것 | 실행 파일과 판 정보와 라이선스 고지뿐. 스크립트 런타임(씬 로더 등), 폰트, 템플릿은 프런트 번들의 템플릿이 새 프로젝트에 복사하고, 게임은 프로젝트 폴더만 읽는다 | 1 |
| 엔진 바이너리와 사본의 출처 | 엔진 저장소가 태그마다 **공개** 릴리스로 낸다 (새 단계 **R4**). 네이티브 실행 파일, 웹 엔진, **템플릿 묶음**(`Initial2D-templates.zip`, 생성한 그림 포함), 제3자 고지가 한 릴리스에서 온다. 에디터는 `engine-pin.json` 이 가리키는 판을 받아 sha256 을 확인한다. 결정 기록: 공개 릴리스가 생기기 전에는 에디터의 CI(`release.yml` 의 `engine` 잡)가 핀의 커밋을 체크아웃해 `tools/build_dist.sh` 로 만들고 `yarn engine:fetch --from` 으로 싣는다 | 3, 4 |
| 새 프로젝트 템플릿 | 빈 프로젝트, 플래피에 **타일맵**(작은 타일셋, 맵 한 장, 타일맵 오브젝트 씬, 오브젝트 스키마)을 더한다. 원본은 엔진 `resources/templates/tilemap/` | 3.1 |
| CI | 세 OS 행렬. macOS arm64(dmg), Linux x86_64(AppImage, deb), Windows x86_64(NSIS). 엔진은 핀의 커밋에서 워크플로가 빌드한다. `workflow_dispatch`(dry run)와 PR 은 산출물만, 태그는 초안 릴리스까지 (결정 기록). 설치본의 자가 검사가 게이트다 | 4, 5 |
| 자가 검사 | 설치본이 격리된 상태(메모리 설정)로 새 프로젝트 셋을 만들고 돈다. 판정은 앱이 아니라 `selftest-check.mjs` 가 실행마다 남긴 **전체 로그**와 스크린샷으로 한다 | 5 |
| Windows 의 엔진 | Windows SDL2 엔진(**R5**, 저자 결정)이 생길 때까지 사이드카 없이 내고, F5 는 엔진을 못 찾아 웹 엔진으로 넘어간다 (Lua 만). 자가 검사가 그 넘어감과 플래피 실행을 필수로 본다 | 3.2, 5 |
| 웹뷰 보안 정책 | 릴리스에서 CSP 를 켠다 (`wasm-unsafe-eval`, 템플릿 자산의 `data:` 읽기. 업데이트 확인이 없으므로 `api.github.com` 은 뺐다). 자가 검사가 위반 보고를 모아 실패로 친다 | 2.5 |
| 안드로이드 | 에디터의 "안드로이드로 스테이징" 명령이 엔진 저장소의 `android/prepare_assets.sh --project <열린 프로젝트>` 를 돌린다. RTP 변환물은 `--with-rtp` 로만 들어간다. APK 빌드와 설치는 범위 밖 | 6 |
| 웹판 | 같은 `dist/` 를 Cloudflare Pages 가 낸다. `_headers` 를 저장소에 두고 CI 가 `wrangler pages dev` 로 그 헤더까지 검사한다. 교차 출처 격리 헤더는 두지 않는다 (엔진이 스레드를 안 쓴다). 폴더를 열 수 있는 브라우저는 새 프로젝트도 만든다 | 7 |
| 서명 | 첫 판은 서명 없음 (macOS 는 ad-hoc). 공증과 Windows 서명은 저자 결정 | 8 |
| 판과 업데이트 | 판은 루트 `package.json` 하나에서 오고 `tauri.conf.json` 은 그 파일을 가리킨다. 태그 `v<semver>`, 첫 판 후보는 `v2.0.0-alpha.1`(문서에만). 자동 업데이트와 업데이트 확인은 이 단계에서 하지 않는다 (결정 기록) | 9 |

## 1. 무엇이 어디에 실리는가

원칙 하나: **프로젝트 폴더가 게임의 전부다.** 엔진 실행 파일은 스크립트도 폰트도 품지 않는다. 씬 로더, `scene_types`, 컴포넌트,
BMFont 는 새 프로젝트를 만들 때 템플릿에서 프로젝트로 복사된다. 그래서 같은 폴더를 네이티브 엔진(작업 폴더), 웹 엔진(MEMFS
스테이징), 안드로이드(에셋 스테이징)가 똑같이 읽는다. 엔진 옆에 스크립트를 두는 순간 세 경로가 갈라지므로 하지 않는다.

| 무엇 | 어디에 실리나 | 만드는 곳 | 비고 |
|---|---|---|---|
| 엔진 실행 파일 `Initial2D` | 사이드카. macOS `InitialEditor.app/Contents/MacOS/`, Windows 설치 폴더, Linux `usr/bin/` | 엔진 R4 릴리스 | 정적 링크. `--features`, `--version` |
| 엔진 판 정보 `engine.json` | 번들 리소스 `engine/engine.json` | `scripts/fetch-engine.mjs` | 엔진 태그, 커밋, 타깃, sha256, 기능. 앱이 보이는 엔진 판은 이것에서 온다 |
| 웹 엔진 (js, wasm, 로더, MANIFEST, `THIRD-PARTY.md`) | `dist/engine/` (프런트) | `yarn engine:pin` (개발 중에는 `yarn sync:engine-web`) | E4 그대로. Pages 와 Tauri 둘 다 |
| 새 프로젝트 템플릿 (씬 로더 두 언어, `scene_types`, 플래피, **타일맵**, `hangul.fnt`, API 명세, 진입 파일) | 프런트 번들 | `yarn engine:pin` 이 릴리스의 `Initial2D-templates.zip` 에서 (개발 중에는 `yarn sync:templates` 가 엔진 체크아웃에서) | E2 의 방식. MANIFEST 가 생성물(`generated: true`)을 표시한다 |
| 제3자 라이선스 고지 | 번들 리소스 `licenses/` | 에디터 쪽 `src-tauri/licenses/THIRD-PARTY-editor.md`(커밋, `scripts/gen-licenses.mjs` 가 만들고 `--check` 로 최신인지 본다)와 저장소 루트의 MIT `LICENSE`(번들의 `licenses/LICENSE`). 엔진 쪽 `licenses/engine/THIRD-PARTY.md`(gitignore, `yarn engine:fetch` 가 엔진 릴리스에서 받는다) | 엔진 고지: SDL2, SDL2_image, SDL2_mixer(zlib), stb, Lua(MIT), mruby(MIT), jsoncpp, SQLite, TinyXML, 나눔고딕(OFL, `hangul.fnt` 가 구운 글꼴). 웹판은 `dist/engine/THIRD-PARTY.md` 로 같은 고지를 낸다 |
| 게임 (`game.json`, `scripts/`, `resources/`) | 사용자 프로젝트 | 사용자 | 엔진은 작업 폴더에서 읽는다 |
| 맵 오브젝트 스키마 (`resources/schema/map-objects.json`) | 사용자 프로젝트 | 게임마다 (타일맵 템플릿이 장르 중립 한 장을 준다) | 에디터는 프로젝트의 것을 읽는다 |
| **싣지 않는 것** | | | `resources/RTP.zip` 과 `resources/rtp/`, 알데바란 소재, 엔진 저장소의 게임과 테스트, 데스크톱 번들의 소스맵 |

E5 는 템플릿 그룹을 더하지 않는다. `yarn sync:rpg`(`scripts/sync-engine-rpg.mjs`)가 엔진 커밋과 sha256 을 적은 자기 MANIFEST 로
`packages/ext-rpg/test/fixtures/` 에 픽스처를 복사하고, RPG 프로젝트 템플릿은 그 뒤 후보로 남긴다. 그 픽스처는 배포물에 실리지 않지만
엔진 커밋에 묶인 셋째 사본이라, 9절의 대조와 `engine:pin` 은 저장소 안의 **엔진에서 온 MANIFEST 전부**(템플릿, 웹 엔진, ext-rpg 픽스처)를 본다.
2026-09-27 `next`(E5 마일스톤 2)를 이 브랜치에 합치자 `yarn engine:check` 가 ext-rpg 픽스처의 커밋(`fab4710`)이 핀(`cac4b94`)과 다르다고
멈췄다. 열 파일은 두 커밋에서 바이트가 같아 핀의 커밋에서 `yarn sync:rpg` 를 다시 돌려 MANIFEST 의 커밋만 바뀌었다. 그 스크립트는 처음부터
`source: "checkout"` 과 `syncCommand: "yarn sync:rpg"` 를 쓰고, 이제 `--out` 과 모르는 인자의 종료 코드 2 가 있다 (`engineScripts.test.ts` 가
가짜 엔진 체크아웃으로 돌려 그 MANIFEST 를 `engine:check` 가 받는지 본다).

## 2. 엔진 사이드카

### 2.1 방식

| 방식 | 장점 | 단점 | 판정 |
|---|---|---|---|
| `bundle.externalBin` | 타깃 트리플 이름 규칙을 Tauri 가 처리하고 설치 뒤 메인 실행 파일 옆에 놓인다. macOS 에서는 `Contents/MacOS/` 라 서명과 공증 규칙에 맞고 Tauri 가 함께 서명한다 | 빌드할 때 파일이 반드시 있어야 한다 (`tauri-build` 의 `copy_binaries` 가 실패한다). 라이브러리 폴더는 못 싣는다 | **채택** (정적 링크가 전제) |
| `bundle.resources` 폴더 | 실행 파일과 dylib 를 폴더째 | macOS 에서 실행 코드가 `Contents/Resources/` 에 있으면 서명과 공증이 까다롭다. 경로를 `resource_dir()` 로 따로 푼다 | 대체안 |
| Homebrew dylib 를 `Contents/Frameworks/` 로 (`bundle.macOS.frameworks`, `install_name_tool`) | 엔진 CMake 무수정 | SDL2_image 와 SDL2_mixer 의 Homebrew 의존(libpng, jpeg, webp, avif, jxl, flac, mpg123, opus 등)이 줄줄이 따라온다. 빌드 머신의 Homebrew 에 묶인다 | 정적 링크가 막힐 때의 후퇴안 (macOS 만) |
| 사용자가 엔진을 따로 설치 | 가장 쉽다 | "설치 하나로" 가 깨진다 | 기각 |

shell 플러그인의 `Command::sidecar()` 는 쓰지 않는다. 이미 `engine.rs` 가 `std::process` 로 띄우고 있고, 플러그인을 열면 권한 표면만
넓어진다. `externalBin` 은 파일을 제자리에 놓는 데만 쓰고, 경로는 셸이 직접 구한다.

### 2.2 파일과 설정

| 파일 | 내용 |
|---|---|
| `src-tauri/binaries/` (gitignore) | `Initial2D-aarch64-apple-darwin`, `Initial2D-x86_64-unknown-linux-gnu`, (R5 뒤) `Initial2D-x86_64-pc-windows-msvc.exe`, 그리고 `engine.json`. `yarn engine:fetch` 가 채운다 |
| `src-tauri/licenses/` | 커밋: `THIRD-PARTY-editor.md`(npm 과 cargo 의존성, `node scripts/gen-licenses.mjs` 가 쓴다). 루트의 `LICENSE` 는 `tauri.dist.conf.json` 이 `licenses/LICENSE` 로 싣는다. gitignore: `engine/THIRD-PARTY.md`(`yarn engine:fetch` 가 모든 타깃에서 받는다. 사이드카가 없는 Windows 도 웹 엔진을 싣기 때문이다). 폴더가 늘 있으므로 번들 리소스 경로가 비어 빌드가 깨지는 일이 없다 |
| `src-tauri/tauri.dist.conf.json` (새) | 모든 릴리스 빌드의 덮어쓰기. `build.beforeBuildCommand` 를 `yarn build:desktop`(소스맵 없는 빌드)으로, `bundle.resources` 에 `{"licenses/": "licenses/"}` |
| `src-tauri/tauri.sidecar.conf.json` (새) | 사이드카가 있는 타깃의 덮어쓰기. `bundle.externalBin: ["binaries/Initial2D"]`, `bundle.resources` 에 `{"binaries/engine.json": "engine/engine.json"}` |
| `src-tauri/tauri.conf.json` (고침) | `"version": "../package.json"` (9절). 창 `main` 에 `"create": false` (셸이 만든다, 아래 `lib.rs`). `app.security.csp` 와 `devCsp`, `dangerousDisableAssetCspModification: ["style-src"]` (2.5 절). 모든 빌드에 두는 칸: `publisher`(biud436), `copyright`, `shortDescription`, `longDescription`, `homepage`(에디터 저장소), `macOS.minimumSystemVersion: "11.0"`, `macOS.signingIdentity: "-"`, `windows.nsis.installMode: "currentUser"`, `windows.nsis.languages: ["Korean", "English"]`, `windows.webviewInstallMode: { "type": "downloadBootstrapper" }`. `license: "MIT"` (2026-09-27 저자 위임 뒤의 결정 기록). `licenseFile` 은 두지 않는다: dmg 에 사용권 동의(SLA)가 붙어 `hdiutil attach` 가 대화 없이는 열지 못한다 (CI 자가 검사가 "attach canceled" 로 멈췄다). `LICENSE` 원문은 `tauri.dist.conf.json` 이 `licenses/LICENSE` 로 싣는다. `targets` 는 "all" 로 두고 CI 가 `--bundles` 로 고른다 |
| `src-tauri/src/lib.rs` (고침) | `setup` 에서 창 `main` 을 설정 그대로 만든다 (`WebviewWindowBuilder::from_config`). 자가 검사 모드(5절, `selftest.rs`)면 계획의 `showWindow` 로 보임과 초점을 정하고, `window-state` 플러그인을 붙이지 않고, 웹뷰를 `incognito`(저장소를 남기지 않는다)와 `background_throttling(Disabled)`(숨은 WKWebView 는 몇 초 뒤 타이머를 멈춘다. macOS 14 이상)로 만든다. 숨은 창이면 macOS 에서 `ActivationPolicy::Accessory` 로 Dock 아이콘과 초점을 가져가지 않는다. 평소에는 전과 같다 |
| `src-tauri/src/bundled.rs` (새) | `find(exe_dir, resource_dir) -> Option<BundledEngine>`: `std::env::current_exe()` 의 부모 폴더에서 `Initial2D`(Windows 는 `Initial2D.exe`)를 찾고, `resource_dir()/engine/engine.json` 을 읽어 붙인다. 명령 `engine_bundled` 는 `{ path, meta, metaError? }` 또는 null. `engine.json` 이 없거나 깨져도 엔진은 쓰고 `meta` 가 null 이다. 실행하지 않고 파일만 본다. 찾은 결과를 stderr 에 한 줄 남긴다 (CI 로그와 숨은 창 검수가 이 줄을 본다) |
| `src-tauri/src/engine.rs` (고침) | `features(exe, timeout)`: 시간 제한을 인자로 받고, 작업 폴더를 끝나면 지우는 임시 폴더로 두고, 창과 소리는 dummy 드라이버다 (`--features` 를 모르는 옛 엔진이 게임을 띄워도 프로젝트에 `config.setting` 을 쓰지 않고 창도 뜨지 않게). 명령 `engine_features(exe, timeout_ms: Option<u64>)`, 없으면 5초, 가장 길게 60초. 결과를 stderr 에 한 줄 남긴다. 새 명령 `engine_exists(paths) -> Vec<bool>` 은 실행하지 않고 파일인지만 본다 (신뢰 확인용, 2.3) |

릴리스 빌드 한 줄은 이렇다 (Tauri 2 의 `--config` 는 여러 개를 준 순서대로 병합한다).

```sh
yarn tauri build --target aarch64-apple-darwin --bundles app,dmg \
  --config src-tauri/tauri.dist.conf.json --config src-tauri/tauri.sidecar.conf.json
```

`externalBin` 을 기본 `tauri.conf.json` 에 넣지 않는 이유: `cargo test` 와 `yarn tauri dev` 와 지금의 CI 디버그 빌드가 사이드카 파일
없이도 되어야 한다. 플랫폼별 자동 병합 파일(`tauri.macos.conf.json` 등)도 개발 빌드에 섞이므로 쓰지 않는다. 병합은 JSON merge patch 라
객체는 키끼리 합쳐지고 배열은 뒤 것이 통째로 덮는다. 그래서 두 덮어쓰기 파일의 `bundle.resources` 는 둘 다 맵 꼴(`{"원본": "대상"}`)로 쓴다.

`engine.json` 의 모양 (`scripts/fetch-engine.mjs` 가 쓴다. 앱은 `engineTag`, `engineCommit`, `describe`, `target`, `sha256`, `features` 만 읽는다):

```json
{
  "comment": "scripts/fetch-engine.mjs 가 쓴다. ...",
  "engineTag": null,
  "engineCommit": "<40자 커밋>",
  "describe": "cac4b94",
  "target": "aarch64-apple-darwin",
  "sha256": "<실행 파일의 sha256>",
  "size": 3432688,
  "features": ["lua", "mruby"],
  "source": "dist-folder",
  "pinned": true
}
```

`engineTag` 는 v2 이상의 태그가 커밋을 가리킬 때만 있고(지금은 태그가 없어 null), `describe` 는 엔진 `--version` 의 describe(태그가
없으면 짧은 커밋)다. `source` 는 받은 곳(`dist-folder` 또는 `release`), `pinned` 는 커밋이 핀과 같은가(`--any-commit` 으로 받으면 거짓).

### 2.3 찾는 순서와 신뢰

| 순서 | 후보 (`EngineSource`) | 신뢰가 필요한가 | 왜 이 자리인가 |
|---|---|---|---|
| 1 | 설정의 엔진 경로 (`settings`) | 아니다 | 사람이 앱에서 고른 것 |
| 2 | 프로젝트의 `.initial-editor/engine` (`project-file`) | **그렇다** | 프로젝트가 고른 것. 절대 경로도 받으므로 어디든 가리킬 수 있다 |
| 3 | 프로젝트의 `build/Initial2D` (`project-build`) | **그렇다** | 프로젝트가 곧 엔진 저장소다. 고치는 중인 엔진이 진실이다 (저자가 알데바란을 열 때) |
| 4 | **앱에 든 엔진 (`bundled`, 새)** | 아니다 | 이 앱의 템플릿과 웹 엔진과 같은 엔진 커밋으로 맞춰 낸 판이다 |
| 5 | 형제 폴더 `../Initial2D/build/Initial2D` (`sibling`) | **그렇다** | 개발 배치. 받은 압축 파일 하나가 `game/` 과 `Initial2D/build/Initial2D` 를 함께 풀 수 있으므로 프로젝트와 같은 출처로 본다 |

03 문서는 동봉을 맨 뒤에 두었지만 형제 폴더보다 앞에 둔다. 개발자는 1 이나 2 로 언제든 형제 빌드를 고르고, `yarn tauri dev` 에는
동봉이 없으므로 개발 중의 동작은 지금과 같다 (신뢰 확인 한 번이 더해진다).

**신뢰 규칙.** 탐색은 후보를 `--features` 로 **실행**하고, 탐색은 `projectOpened` 마다 돈다. 지금까지는 저자만 썼으므로 괜찮았지만,
E6 의 목적은 남이 설치하고 남이 받은 프로젝트를 여는 것이다. 폴더를 여는 것만으로 그 안의 실행 파일이 돌아서는 안 된다.

- 신뢰하지 않은 프로젝트는 `settings` 와 `bundled` 만 찌른다.
- `project-file`, `project-build`, `sibling` 후보는 먼저 `engine_exists` 로 **실행하지 않고** 파일이 있는지만 본다. 하나라도 있으면
  한 번 묻는다: "이 프로젝트가 가리키는 엔진을 실행할까? `<실행 파일의 절대 경로>` (출처: 프로젝트의 build/)". 파일이 있는 후보를
  모두 한 대화상자에 보인다. 단추는 "이 엔진 실행 허용" 과 "앱에 든 엔진만 쓰기"(앱에 든 엔진이 없는 개발 빌드는 "실행하지 않기")이고
  처음 초점은 실행하지 않는 쪽이다. 어느 쪽이든 기억한다. Escape 나 가림막으로 닫으면 이번만 건너뛰고 기억하지 않는다.
- 묻는 때는 순서대로 찌르다가 **처음 신뢰가 필요한 후보에 닿을 때**다. 설정의 엔진이 먼저 답하면 묻지도 파일을 보지도 않는다.
  탐색이 겹쳐도(프로젝트 열기와 설정 바꾸기) 같은 질문은 한 번만 뜬다.
- **무리마다 묻는다** (2026-09-27 검증에서 고쳤다). 신뢰가 필요한 후보는 신뢰가 필요 없는 후보 사이의 무리로 나뉜다: `.initial-editor/engine` 과
  `build/` 가 한 무리, 앱에 든 엔진 뒤의 형제 폴더가 또 한 무리다. 앞 무리에 닿으면 그 무리만 파일을 보고 묻는다. 앱에 든 엔진이 답하면 형제는
  보지도 묻지도 않는다 (전에는 늘 있는 `build/` 후보에 닿는 순간 형제까지 물어서, 저자의 배치처럼 게임 폴더 옆에 `Initial2D/build/` 가 있으면
  설치본이 여는 모든 프로젝트에서 쓸모없는 질문이 떴다). 앱에 든 엔진이 없으면(개발 빌드) 셋이 한 무리라 한 번에 묻는다. 앱에 든 엔진이 있지만
  답하지 않으면 형제 무리를 따로 묻고, 그때의 거절 단추는 "실행하지 않기" 다. 같은 답은 기록의 `exes` 에 합치고 다른 답이면 새 답으로 바꾼다
  (한 프로젝트의 기록은 답 하나라, 두 무리에 다른 답을 주면 다음 탐색에서 앞 무리를 다시 묻는다. 앱에 든 엔진이 고장 난 때만 생긴다).
  형제만 묻는 대화상자는 "프로젝트 옆 폴더의 엔진을 실행할까?" 라고 묻는다 (프로젝트가 가리킨 것이 아니다).
- **겹친 탐색**: 같은 프로젝트의 같은 무리를 정하는 중이면 그 결정(파일 보기, 기록 읽기, 묻기, 답 남기기)을 기다려 같은 답을 쓴다. 기록은
  파일을 본 뒤에 읽는다. 전에는 탐색 2 가 기록을 먼저 읽고 `engine_exists` 를 기다리는 사이 탐색 1 의 질문이 답해지면, 탐색 2 가 빈 기록으로
  한 번 더 물었고 두 번째 질문을 닫으면 허용한 `build/` 대신 앱에 든 엔진이 쓰였다 (`RunnerStore.trust.test.ts` 가 그 순서를 그대로 만든다).
  실행(`start`)도 엔진이 아직 없을 때 새로 찾지 않고 돌고 있는 탐색을 기다려 그 결과를 쓴다. 자가 검사는 프로젝트를 열자마자 실행해서, 열기의
  탐색이 질문을 닫은 뒤 앱에 든 엔진을 찌르는 사이에 실행이 새 탐색을 시작해 같은 질문을 한 번 더 띄웠다 (검증의 "열기 한 번과 실행 한 번에
  질문 둘"). 사람도 질문이 떠 있는 동안 F5 를 누르면 같은 일이 생긴다.
- 답은 **앱 설정**의 `engineTrust: { [프로젝트 정규 경로]: { allow: boolean, exes: [<물을 때 보인 실행 파일의 절대 경로>] } }` 에 남는다
  (구현하며 `exe` 하나를 `exes` 목록으로 바꿨다. 한 번에 여러 후보를 보이기 때문이다). 프로젝트 폴더에는 쓰지 않는다 (프로젝트가 스스로
  신뢰를 적을 수 없게). 지금 파일이 있는 후보가 기록의 `exes` 밖에 하나라도 있으면(`.initial-editor/engine` 이 다른 파일을 가리키면)
  다시 묻는다. 허용한 경로가 사라지기만 한 것은 다시 묻지 않는다. 손으로 고친 설정 파일의 틀린 항목은 버린다.
- 설정 대화상자에 "찾은 엔진" 줄(찾은 엔진의 설명, 없으면 "없음 (F5 는 에디터 안에서 돈다)")과, 열린 프로젝트에 답이 있으면 그 옆에
  "신뢰 취소"(허용을 지우고 이번에는 묻지 않고 다시 찾는다. 다음에 열 때 다시 묻는다) 또는 "다시 묻기"(거절을 지우고 곧바로 묻는다).
- 프로젝트가 앱에 든 엔진과 같은 파일을 가리키면(`.initial-editor/engine` 이나 설정에 번들 안 경로) 그 자리의 후보가 **앱에 든 엔진**(`bundled`)이다:
  신뢰를 묻지 않고, 15초 시간 제한과 재시도, `engine.json` 의 판과 "앱에 든 엔진" 이름이 따른다 (전에는 `project-file` 로 남아 5초였다).
  같은 파일인지는 구분자를 맞춰 보고, Windows 는 대소문자를 가리지 않는다.
- 자가 검사 모드에서는 이 확인이 뜨는 것 자체가 실패다 (5절). 자가 검사의 임시 프로젝트에는 그런 후보가 없다.
- 단위 시험: 가짜 `probe` 가 부른 경로를 기록하고, 신뢰하지 않은 프로젝트를 열면 프로젝트 안과 형제 경로가 한 번도 불리지 않는다.
  허용한 뒤에는 순서대로 불린다. 거절을 기억한다. 경로가 바뀌면 다시 묻는다.

**그 밖의 규칙**

- **다 못 찾으면** 에디터 안(웹 엔진)으로 돌리고 콘솔에 한 줄 남긴다: "엔진 실행 파일을 찾지 못해 에디터 안에서 돈다 (찾아본 곳: ...)".
  신뢰하지 않아 건너뛴 후보가 있으면 그 경로도 적는다. 설정의 `runMode` 는 바꾸지 않는다. `game.json` 이 mruby 면 지금처럼
  이유(`WASM_NO_MRUBY`)를 띄우고 멈춘다. Windows 번들은 R5 전까지 늘 이 길이다. 그래서 에디터 안 실행이 있는 앱에서는 엔진이 없어도
  실행 버튼이 켜져 있고 툴팁이 넘어감을 알린다 (찾아보기 전에는 알리지 않는다). 넘어간 사실은 `RunnerStore.fallback`(`"embedded"`)에
  남고 다음 실행에서 지운다. 한 번의 실행만 방식을 고르는 `StartOptions.mode` 가 있다 (자가 검사가 쓴다. 설정은 그대로다).
- **첫 실행의 느림.** 다운로드한 앱의 사이드카는 macOS 가 처음 실행할 때 격리 속성 검사로 몇 초 걸릴 수 있다. `bundled` 후보만
  `--features` 시간 제한을 15초로 두고, 시간 초과면 한 번 더 찌른다 (구현: 파일이 없다는 `engine_not_found` 말고의 실패면 한 번 더.
  실행 직전의 다시 묻기도 같은 규칙이다). 시간 제한은 셸의 상수라 프런트가 늘릴 수 없었으므로 셸부터 고친다:
  `engine_features(exe, timeout_ms)`(2.2), 백엔드 `engineFeatures(exe, { timeoutMs })`, `RunnerOptions.probe(exe, { timeoutMs })`.
  `cargo test`: 7초 뒤에 답하는 가짜 스크립트가 기본 시간에는 실패하고 15초에는 통과한다.
- **`--version` 은 부르지 않는다.** 에디터는 어떤 후보에도 `--features` 말고는 부르지 않는다. R4 이전 엔진은 모르는 인자를 무시하고
  게임을 띄우기 때문이다. 앱에 든 엔진의 판은 `engine.json` 에서 읽는다. `--version` 은 CI 의 검사 도구(`check_dist.sh`,
  `check-sidecar.mjs`)만 부르고, 그때도 시간 제한과 버리는 작업 폴더를 쓴다.
- **보이는 곳.** 상태 바 툴팁과 설정 대화상자의 "찾은 엔진" 줄, 정보 창: "앱에 든 엔진 v2.0.0-alpha.1 (abc1234, lua mruby)".
  태그가 없으면 "앱에 든 엔진 (cac4b94, lua mruby)" (`bundledEngineLabel`, `RunnerStore.engineDescription`). 판은 `RunnerStore.bundled`
  (`engine_bundled` 의 결과)에 있다. 라벨은 `ENGINE_SOURCE_LABELS` 에 "앱에 든 엔진" 으로 더한다.

### 2.4 개발 중에

- 평소: 지금처럼 형제 폴더의 개발 빌드 (처음 한 번 신뢰를 묻는다).
- 동봉 경로를 시험할 때: `yarn engine:fetch --from ../Initial2D/dist`(엔진에서 `tools/build_dist.sh` 로 만든 것. 공개 릴리스가 생기면
  `yarn engine:fetch` 만으로 핀의 릴리스를 받는다) 뒤 `yarn tauri dev --config src-tauri/tauri.sidecar.conf.json`. Tauri 가 개발 빌드에도
  `target/debug/` 옆에 사이드카(`Initial2D`)와 `engine/engine.json` 을 놓고, 개발 빌드의 `resource_dir()` 은 그 폴더다 (확인함).
- 받은 사이드카 검사: `node scripts/check-sidecar.mjs src-tauri/binaries/Initial2D-<트리플>` 또는 빌드한 `.app`. `engine.json` 은 `.app` 이면
  `Contents/Resources/engine/`, 파일이나 폴더면 옆의 `engine/` 다음에 옆(`yarn engine:fetch` 가 쓰는 `src-tauri/binaries/engine.json`)에서 찾고,
  없으면 찾아본 곳을 적고 실패한다. 전에는 받은 파일 옆을 보지 않아 "(없음)" 이라 찍고 그 대조를 조용히 건너뛰었다. 엔진 실행 파일만 볼 때는
  `--no-engine-json`, 다른 곳이면 `--engine-json <경로>`(없는 경로면 실패).
- 2026-09-27 이 맥의 검수: 엔진 `cac4b94` 를 버리는 작업 트리에서 `tools/build_dist.sh`(3.4 MB), `yarn engine:fetch --from <그 dist>`,
  `check-sidecar.mjs` 가 받은 파일과 빌드한 `.app` 둘 다 전부 통과. 사이드카 덮어쓰기와, 창을 숨기고 식별자를 바꾼 덮어쓰기로
  `yarn tauri build --debug --bundles app` 을 만들어 `Contents/MacOS/Initial2D` 와 `Contents/Resources/engine/engine.json` 이 놓이는 것을 보고,
  그 앱을 `INITIAL_EDITOR_OPEN=<임시 프로젝트>` 로 30초 띄웠다 (창 없음). 셸의 stderr 에 `앱에 든 엔진: .../Contents/MacOS/Initial2D (cac4b94 ...)`
  와 `--features: lua mruby (31 ms)` 가 찍혔다. 프로젝트 안 후보는 파일이 없어 묻지 않았고 프로젝트에 `config.setting` 이 생기지 않았다.

### 2.5 웹뷰 보안 정책 (CSP)

지금은 `csp: null` 이고 결정의 기록이 없다. 릴리스는 남의 프로젝트를 여는 앱이므로 정책을 켠다. 구현한 정책 (`tauri.conf.json` 의
`app.security.csp`, 지시어별 맵 꼴):

```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self' data:;
worker-src 'self' blob:;
connect-src 'self' ipc: http://ipc.localhost data:
```

- `wasm-unsafe-eval`: 웹 엔진(에디터 안 실행)의 WebAssembly 컴파일. `unsafe-eval` 은 넣지 않는다. PIXI 8 은 기본으로 `new Function` 을
  쓰므로 `main.tsx` 가 맨 먼저 `pixi.js/unsafe-eval` 을 들여와 그 경로를 끈다.
- `style-src 'unsafe-inline'`: Monaco 와 dockview 가 인라인 스타일을 쓴다. Tauri 는 빌드할 때 HTML 의 인라인 스크립트와 스타일에
  해시나 논스를 붙이는데, `style-src` 에 해시가 하나라도 붙으면 브라우저가 `'unsafe-inline'` 을 무시한다. 그래서
  `dangerousDisableAssetCspModification: ["style-src"]` 로 그 지시어만 Tauri 가 고치지 않게 한다 (`script-src` 는 Tauri 가 그대로 지킨다).
- `connect-src data:`: 새 프로젝트 템플릿의 작은 자산(4 KB 아래의 그림과 소리)은 Vite 가 `data:` 주소로 번들에 넣고
  `scene/templateFiles.ts` 가 그것을 `fetch` 한다. 2026-09-27 이 맥의 첫 자가 검사가 이 위반(`connect-src data`, 플래피 템플릿 쓰기가
  "Load failed")을 잡아 더했다. `data:` 읽기는 바깥으로 나가는 길이 아니다.
- `connect-src https://api.github.com` 은 뺐다. 업데이트 확인을 이 단계에서 만들지 않기 때문이다 (결정 기록). 만들 때 더한다.
- `devCsp` 는 같은 정책에 Vite 개발 서버(`http://127.0.0.1:5173`, `ws://127.0.0.1:5173`)를 더하고, `script-src` 에 `'unsafe-inline'` 을
  더한다. `@vitejs/plugin-react` 가 개발 중에 인라인 스크립트(react-refresh 머리말)를 넣기 때문이다. 개발 중에도 나머지 위반은 콘솔에 보인다.
  개발 빌드의 CSP 는 창을 띄워야 볼 수 있어 이 맥에서 확인하지 않았다 (저자 실기).
- 검사: 자가 검사가 `securitypolicyviolation` 사건을 모아(`selftest/csp.ts`, `main.tsx` 가 에디터를 만들기 전에 붙인다) 보고서의
  `cspViolations` 에 적고, 하나라도 있으면 실패다 (5절). 자가 검사는 맵 문서(PIXI)와 스크립트 편집기(Monaco)를 열고, 계획에 있으면
  에디터 안 실행(wasm)도 한다. 숨은 창의 로컬 자가 검사(프로세스 실행만)는 위의 `data:` 하나를 고친 뒤 위반이 없다. 에디터 안
  실행과 보이는 창의 위반 목록은 첫 CI 실행이 보이고, 그때 이 절을 고친다.
- 웹판(Pages)의 CSP 헤더는 이 단계에서 두지 않는다 (7.3).

## 3. 엔진 쪽 선행 작업

### 3.1 R4: 배포용 엔진 빌드와 템플릿 묶음 (새 단계, 엔진 저장소)

엔진 저장소의 `docs/plans/index.md` 8절(에디터 트랙)에 R4 로 더하고 정본 문서는 `docs/plans/r4-dist-build.md` 로 쓴다. 목표는
"다른 컴퓨터에 복사해도 뜨는 실행 파일 한 개" 와 "에디터가 복사할 템플릿을 생성물까지 한 묶음으로" 다. C++ 은 `sdl2Main.cpp` 의
인자 처리 한 곳만 고친다.

| 파일 | 할 일 |
|---|---|
| `CMakeLists.txt` | 옵션 `INITIAL2D_VENDORED_SDL`(기본 OFF). 켜면 `external/sdl-src/`(gitignore)의 SDL2, SDL2_image, SDL2_mixer 를 `add_subdirectory` 로 **정적** 빌드한다. 캐시 값을 명시한다: `SDL_SHARED=OFF`, `SDL_STATIC=ON`, `SDL_TEST=OFF`, `BUILD_SHARED_LIBS=OFF`, `SDL2IMAGE_BACKEND_IMAGEIO=OFF`(Apple 기본은 ON 이라 PNG 와 JPG 를 ImageIO 가 풀어 색 처리가 골든을 움직일 수 있다), `SDL2IMAGE_BACKEND_STB=ON`, `SDL2IMAGE_DEPS_SHARED=OFF`, `SDL2MIXER_DEPS_SHARED=OFF`, `SDL2MIXER_VORBIS=STB`, 그리고 안드로이드와 같은 포맷 스위치(이미지 AVIF, JXL, TIF, WEBP 끔. 소리 FLAC, MOD, MP3, MIDI, OPUS, WAVPACK 끔. 남는 것은 png, jpg, ogg, wav). 링크는 `SDL2::SDL2-static`, `SDL2_image`, `SDL2_mixer` 의 정적 대상. Linux 는 SDL 의 `SDL_X11_SHARED`, `SDL_WAYLAND_SHARED`, `SDL_ALSA_SHARED`, `SDL_PULSEAUDIO_SHARED` 기본값(ON, 실행 중 dlopen)을 그대로 둔다. 이때 Homebrew 를 찾지 않는다. mruby 탐색 힌트 앞에 캐시 변수 `MRUBY_ROOT` 를 둔다. `CMAKE_OSX_DEPLOYMENT_TARGET` 11.0. 설정 때 `git describe --tags --always --dirty` 와 커밋을 생성 헤더로 |
| `src/platform/sdl2/sdl2Main.cpp` | `--features` 옆에 `--version`: `Initial2D <describe> <커밋 40자>` 한 줄. 그리고 **모르는 `--` 인자**는 사용법을 stderr 에 찍고 종료 코드 2 로 `App::Run` 전에 끝낸다 (`-psn_` 같은 한 줄표 인자는 그대로 무시). GDI 와 무관한 파일이다 |
| `tools/sdl_versions.sh` (새) | SDL 셋의 판 번호 한 곳. `android/download_sdl.sh` 도 이것을 읽는다 |
| `tools/fetch_sdl_src.sh` (새) | SDL 소스 셋을 `external/sdl-src/` 로 받는다 |
| `tools/build_mruby.sh` (새) | mruby 4.0.0 을 `full-core` gembox 로 소스 빌드 (지금 `tests.yml` 의 대체 경로와 같은 설정). rake 는 CMake 의 배포 대상을 물려받지 않으므로 macOS 에서 `MACOSX_DEPLOYMENT_TARGET=11.0` 을 내보낸다. 엔진은 빌드한 mruby 의 `bin/mruby-config --cflags` 정의를 그대로 쓴다. Linux 에서도 같은 스크립트 |
| `tools/build_dist.sh` (새) | 위 둘을 부르고 `cmake -B build-dist -DINITIAL2D_VENDORED_SDL=ON -DMRUBY_ROOT=... -DCMAKE_BUILD_TYPE=Release`, `--target Initial2D`, `strip`, `dist/Initial2D-<트리플>` 과 `dist/engine-dist.json`(태그, 커밋, 타깃, sha256, 기능) |
| `tools/check_dist.sh` (새) | 동적 의존 허용 목록 검사. macOS 는 `otool -L` 에 `/usr/lib/` 와 `/System/Library/` 만, `otool -l` 의 `minos` 가 11.0. Linux 는 `ldd` 에 glibc 계열(`libc`, `libm`, `libdl`, `libpthread`, `librt`, `ld-linux`)과 `libstdc++`, `libgcc_s` 만 (X11, Wayland, ALSA, PulseAudio 는 SDL 이 실행 중에 dlopen 하므로 목록에 없어야 정상). `--features` 에 `lua`(macOS 와 Linux 는 `mruby` 도), `--version` 의 커밋이 HEAD, `--bogus` 가 종료 코드 2. 실행은 모두 `mktemp -d` 작업 폴더에서 시간 제한으로 (표준 `timeout` 이 없는 macOS 는 `perl -e 'alarm shift; exec @ARGV'`) |
| `THIRD-PARTY.md` (새, 저장소 루트) | 엔진이 싣는 제3자 고지: SDL2, SDL2_image, SDL2_mixer(zlib), stb(MIT 또는 퍼블릭 도메인), Lua 5.3(MIT), mruby(MIT), jsoncpp(MIT), SQLite(퍼블릭 도메인), TinyXML(zlib), 나눔고딕(OFL, `hangul.fnt`). 각 절에 판 번호와 원문. 네이티브와 웹 판이 같은 파일을 쓴다 |
| `resources/templates/tilemap/` (새) | 장르 중립 타일맵 템플릿. **결정 기록대로 새로 그리지 않았다**: 타일셋은 이미 커밋된 `resources/tiles/tileset16-8x13.png`(8열, `resources/maps/sample.json` 과 같은 그림)이고 새 프로젝트에도 같은 경로로 들어간다. 초안의 `tiles16.png` 와 `tools/gen_template_tiles.py` 는 만들지 않았다. **표식 칸**은 있는 타일 44(0 부터, gid 45, 모래. 256 픽셀 가운데 251 개가 `#d8c880`)이고 템플릿 맵에는 없다. 칠해 보는 칸은 (24, 28)(deco 가 비고 통행할 수 있다). `map.json`(맵 포맷 v2, 이름 `start`, 화면 768x896 을 채우는 48x56 칸, 레이어 `ground` 와 `deco` 와 통행 레이어, 오브젝트 없음, `tools/mapfile.py` 의 고정 형식), `scene.json`(씬 포맷 v1, 오브젝트 `map` 하나: 타입 `tilemap`, `props.map` 은 `resources/maps/start.json`, `groundLayers` 1), `map-objects.json`(오브젝트 스키마. 타입 `marker` 하나: 점 모양, 칸 `label`(글). `play` 절은 없다). 정본은 엔진 `docs/plans/r4-dist-build.md` 6절 |
| `tools/templates_list.txt` (새) | 템플릿 묶음에 넣는 엔진 경로 목록 (에디터의 `sync-engine-templates.mjs` 가 쓰는 `from` 전부와 타일맵 템플릿) |
| `tools/pack_templates.py` (새) | 목록의 파일을 `dist/Initial2D-templates.zip` 으로 묶고 안에 `MANIFEST.json`(엔진 커밋 40자, 경로, 크기, sha256, `generated`)을 넣는다. `git ls-files` 에 없는 파일은 `generated: true` (플래피 그림 넷). 목록의 파일이 하나라도 없으면 실패 |
| `tests/run_engine_tests.py` | 이미 실행 파일 인자를 받는다. macOS 는 배포용 실행 파일로 **전체** 씬 검수를 한 번 더 돈다 (stb 디코더가 Homebrew 의 libpng 와 같은 골든을 내는지가 여기서 드러난다). Linux 는 먼저 `--only=` 로 플래피 씬 넷(Lua, Ruby)만 |
| `.github/workflows/dist.yml` (새) | 4.2 절 |
| 문서 | `docs/plans/r4-dist-build.md`, index 8절의 R4 행, README 의 "배포용 빌드" 절 (`tools/build_dist.sh`, `tools/check_dist.sh`, `tools/pack_templates.py`, 모르는 인자의 종료 코드) |

엔진의 SDL2 배포 판 번호는 `v2.0.0-alpha.1` 부터다. `v1.x` 태그는 GDI 판이다.

타일맵 템플릿을 엔진 쪽에서 돌려 보는 검사는 에디터의 `scripts/e2e-engine-scene.mjs` 가 맡는다 (마일스톤 3: 템플릿으로 프로젝트를 쓰고,
맵 모델로 한 칸을 칠하고, 엔진의 스크린샷에서 그 칸의 색을 본다). 엔진 저장소에는 템플릿이 규칙대로인지(맵이 `mapfile.py` 로 읽히고
쓰면 바이트가 같다, 씬이 로더의 검사를 통과한다) 보는 `tests/tools/templates_test.py` 만 둔다.

### 3.2 R5: Windows SDL2 엔진 (선택, 저자 결정)

Windows 번들에 네이티브 엔진을 싣으려면 필요하다. 무엇이 막는가:

1. `src/Constants.h` 가 `_WIN32` 면 `RS_WINDOWS` 를 정의해 GDI 경로가 켜진다. 가드는 `src/` 의 22개 파일에 있다 (`src/platform/` 밖 15개,
   안쪽의 `HotReloadServer.cpp` 와 sdl2 어댑터와 `sdl2Main.cpp` 7개). 같은 헤더가 `_WIN32` 면 `RSLIB` 을 `__declspec(dllexport)` 로 바꾸므로
   정적 실행 파일 빌드에서도 내보내기 표가 생긴다.
2. POSIX 어댑터(`SystemPath`, `PosixProcess`)가 Windows 에 없다.
3. 핫 리로드 서버가 POSIX 소켓이다.
4. mruby 탐색이 `NOT WIN32` 다.

제안: CMake 가 SDL2 판을 빌드할 때 `INITIAL2D_SDL2_BACKEND` 를 정의하고, `Constants.h` 는 `_WIN32 && !INITIAL2D_SDL2_BACKEND` 일 때만
`RS_WINDOWS` 를 정의하고 `RSLIB` 도 그때만 `__declspec` 으로 둔다. `RS_WINDOWS` 블록 안의 코드는 한 줄도 안 바뀌고 vcxproj(GDI) 빌드는 그
정의가 없으니 전과 같다. Windows 용 SDL2 어댑터는 새 파일(`src/platform/win32sdl/SystemPath.cpp` 등, `GetModuleFileNameW`)로 두고, 핫 리로드
서버는 winsock 분기를 더하거나 Windows 에서 끈다 (에디터는 에디터 안 방식으로 리로드한다). 22개 파일 가운데 sdl2 어댑터 쪽 7개는 가드
안팎을 다시 읽어야 한다. 그래서 R5 의 크기는 "판정 줄 하나" 보다 크다.

이것이 "Windows GDI 코드는 수정하지 않는다" 원칙 안인지는 **저자 결정**이다. 판정 줄 자체를 고치기 때문이다. 검증은 vcxproj 빌드가
전과 같은 결과를 내는지(저자의 Parallels)와 CMake MSVC 빌드가 `windows-latest` 에서 플래피 씬 검수를 통과하는지다.

R5 전까지 Windows 번들은 사이드카 없이 내고 F5 는 웹 엔진으로 넘어가 돈다 (Lua 만, mruby 프로젝트는 이유를 띄운다). **E6 의 완료는 R5 를
기다리지 않는다.**

## 4. CI 와 릴리스

### 4.1 에디터 저장소

**`ci.yml` 고칠 것** (구현함, 2026-09-27)

- `web` 잡의 엔진 체크아웃을 **핀의 커밋**으로: 앞 단계가 `engine-pin.json` 을 읽어 `ciEngineRef`(있으면) 또는 `engineCommit` 을 `ref:` 로
  넘긴다. 핀이 없는 동안(R4 첫 릴리스 전)은 지금처럼 기본 브랜치. `ciEngineRef` 는 새 엔진 코드가 필요한 PR 이 잠시 쓰는 칸(브랜치나 커밋)이고,
  릴리스의 `check` 잡은 이 칸이 있으면 실패한다. 엔진 기본 브랜치가 핀보다 앞서 나가도 매일의 CI 가 흔들리지 않는다.
- `web` 잡의 `templates.test.ts` 는 그 체크아웃과 대조한다. 체크아웃에 없는 파일은 MANIFEST 가 `generated: true` 로 표시한 것만 건너뛰고,
  나머지가 없으면 실패한다 (지금은 없는 원본을 전부 조용히 건너뛴다). 생성물의 대조는 릴리스의 `check` 잡이 템플릿 묶음으로 한다.
- `web` 잡에 `yarn version:check`, `node scripts/gen-licenses.mjs --check`(macOS 러너에 있는 cargo 의 `cargo metadata` 를 쓴다),
  `yarn build` 뒤 `node scripts/check-web-dist.mjs` (7.5 절), Playwright 단계에 `PAGES_WRANGLER=1`, `PAGES_PORT=8788`(스펙이
  `npx wrangler@3 pages dev dist` 를 띄워 헤더까지 본다. wrangler 를 받지 못하면 까닭을 적고 헤더 검사만 건너뛴다), 끝에
  `yarn build:desktop` 과 `check-web-dist --desktop` (소스맵 없는 데스크톱 프런트).
- `rust` 잡을 세 OS 행렬로 (`macos-latest`, `ubuntu-22.04`, `windows-latest`, `fail-fast: false`). Linux 는 `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`.
  `engine.rs` 의 시험은 unix 전용이고 `android.rs` 의 Windows bash 후보 시험이 Windows 에서 돈다. Windows 에서 크레이트가 빌드되는지는
  첫 CI 실행이 처음 본다.
- `yarn test:android-stage` 는 엔진의 `--project` 가 엔진 master 에 들어간 뒤 더한다 (안드로이드 작업의 기록). 엔진 PR #54 가 2026-09-27
  master `0010ea5` 로 들어갔다. 다만 `ci.yml` 은 엔진을 핀의 커밋(`cac4b94`, `--project` 전)으로 받으므로, 핀을 `0010ea5` 이후로 올린 뒤에
  더한다 (핀을 올리면 웹 엔진, 템플릿, ext-rpg 픽스처, 앱에 싣는 엔진을 그 커밋에서 다시 맞춘다. 4.2 절 끝).

**`release.yml` 새로** (구현함. 결정 기록대로 산출물이 기본이고, 태그를 민 실행만 초안 릴리스를 만든다)

- 트리거: `push: tags: ["v*"]`, `workflow_dispatch`(입력 `dry_run`, 기본 참), PR 에서 `src-tauri/**`, `scripts/fetch-engine.mjs`,
  `scripts/check-sidecar.mjs`, `scripts/selftest-*.mjs`, `scripts/lib/**`, `scripts/version.mjs`, `scripts/gen-licenses.mjs`, `engine-pin.json`,
  `packages/app/src/editor/selftest/**`, 이 워크플로가 바뀔 때. 릴리스를 만드는 것은 태그를 민 실행뿐이고, `workflow_dispatch` 는 `dry_run` 을
  꺼도 릴리스를 만들지 않는다 (태그가 없으면 만들 릴리스가 없다).
- 잡 `pin` (ubuntu): `engine-pin.json` 의 `ciEngineRef` 또는 `engineCommit`.
- 잡 `engine` (행렬 `macos-26` aarch64, `ubuntu-22.04` x86_64): 엔진 저장소를 핀의 커밋으로 체크아웃하고 `dist.yml` 의 `native` 와 같은 길
  (`tools/build_dist.sh`, `tools/check_dist.sh`). macOS 는 `generate_placeholder_assets.py` 뒤 `pack_templates.py` 로 템플릿 묶음도.
  산출물 `engine-<트리플>`: 실행 파일, `engine-dist.json`, `THIRD-PARTY.md`, (macOS) `Initial2D-templates.zip`. SDL 과 mruby 소스는 캐시한다.
- 잡 `check` (ubuntu, `engine` 뒤): `yarn version:check`(태그면 `--tag`), `gen-licenses.mjs --check`, `yarn engine:check`(`ciEngineRef` 가
  비었는지, 엔진에서 온 MANIFEST 전부의 커밋), 템플릿 대조(`yarn engine:fetch --from <macOS 엔진 산출물> --templates <폴더>` 뒤
  `INITIAL2D_TEMPLATES_SRC=<폴더> yarn vitest run packages/app/src/editor/scene/templates.test.ts`. 생성물까지 빠짐없이).
  `bundle` 은 `check` 를 기다리지 않는다: dry run 은 산출물이 목적이고, 문이 닫힌 것은 `check` 잡의 실패로 보인다. 2026-09-27 이 맥에서
  같은 단계를 차례로 돌려 모두 통과했다 (판, 고지, `engine:check`, 핀의 커밋에서 만든 템플릿 묶음과의 대조 7건).
- **템플릿 대조의 생성물은 픽셀로** (2026-09-27 검증에서 고쳤다). `engine` 잡은 Pillow 판을 고정하지 않는다(지금 12.3.0). 커밋한 플래피 그림
  넷은 이 맥의 Pillow 10.4.0 이 만든 것이라, 같은 커밋이라도 압축한 바이트가 달라 바이트 대조는 CI 에서 늘 실패한다 (풀어 낸 RGBA 는 같다).
  위의 "이 맥에서 통과" 는 두 쪽을 같은 Pillow 로 만들어서였다. 그래서 `templates.test.ts` 의 대조(`scripts/lib/templateCompare.mjs`)는 추적하는
  파일을 바이트(sha256)로, MANIFEST 가 `generated` 로 적은 PNG 를 풀어 낸 픽셀(너비, 높이, RGBA 전부)로 견준다. PNG 읽기는 의존성 없는
  `scripts/lib/png.mjs`(node:zlib, 색 형식 다섯과 비트 깊이 1 에서 8, 필터 다섯, Adam7, CRC 확인. 16비트는 거절)이고 `tests/scripts/png.unit.ts`,
  `templateCompare.unit.ts` 가 두 길(바이트가 달라도 픽셀이 같으면 통과, 픽셀 하나나 추적 파일의 바이트 하나가 다르면 실패)을 본다. 이 맥에서
  핀의 커밋을 Pillow 12.3.0 으로 다시 생성하고 묶어 `INITIAL2D_TEMPLATES_SRC` 로 돌리면 통과하고(네 파일 모두 바이트는 다르다), 그 묶음의 그림
  한 픽셀과 추적 파일 한 바이트를 바꾸면 두 줄로 실패한다. Pillow 를 고정하는 안은 엔진 쪽 `dist.yml` 과 두 곳을 맞춰야 해서 택하지 않았다.
- 잡 `bundle` (행렬, `engine` 뒤):

| 러너 | 타깃 | `--bundles` | 덮어쓰기 | 사이드카 | 자가 검사 (5절) |
|---|---|---|---|---|---|
| `macos-26` | `aarch64-apple-darwin` | `app,dmg` | dist + sidecar | 있음 | dmg 를 `hdiutil attach -nobrowse -readonly` 해 그 안의 `.app` 으로. 계획 `--os mac --forest <엔진 체크아웃> --rpg <엔진 체크아웃>`: 플래피 Lua, 플래피 Ruby, 타일맵, 숲, 항구 마을 (프로세스 방식, `bundled`, 필수), 플래피 에디터 안 (시도). 창을 보인다 |
| `ubuntu-22.04` | `x86_64-unknown-linux-gnu` | `appimage,deb` | dist + sidecar | 있음 | `xvfb-run -a` 와 `APPIMAGE_EXTRACT_AND_RUN=1`, `WEBKIT_DISABLE_DMABUF_RENDERER=1`(xvfb 에는 GPU 가 없다) 로 AppImage. macOS 와 같은 계획. deb 는 `dpkg-deb -x` 로 푼 사이드카에 `check-sidecar.mjs`, `apt install ./<deb>` 뒤 `/usr/bin/Initial2D --version` (시간 제한, 임시 작업 폴더에 아무것도 남지 않는다) |
| `windows-latest` | `x86_64-pc-windows-msvc` | `nsis` | dist | 없음 | 설치 파일을 `/S` 로 무인 설치하고 `%LOCALAPPDATA%\InitialEditor` 의 실행 파일로. 필수: 플래피 Lua 를 프로세스 방식으로 시작해 엔진을 못 찾고 에디터 안으로 넘어가 돈다 |

  단계: 체크아웃(사이드카가 있는 타깃은 엔진 저장소도 핀의 커밋으로. 숲이 엔진의 맵을 쓴다), Node 22 와 `yarn install --immutable`, Rust 와 타깃,
  (Linux) apt, 엔진 산출물 받기와 `yarn engine:fetch --from <산출물> --target <트리플>`(Windows 는 macOS 산출물에서 고지만),
  `yarn tauri build --target <트리플> --bundles ... --config src-tauri/tauri.dist.conf.json [--config src-tauri/tauri.sidecar.conf.json]`,
  `yarn version:check --bundles <번들 폴더>`(태그면 `--tag` 도), `check-web-dist.mjs --desktop`, 번들 안 사이드카에 `check-sidecar.mjs`,
  자가 검사(`timeout-minutes: 20`, `selftest-plan.mjs` 로 계획을 쓰고 `selftest-app.mjs <앱> --plan <계획> --no-check` 로 띄운다),
  판정(`if: always()`, `node scripts/selftest-check.mjs --plan <계획>`. **보고서가 없으면 실패**), 자가 검사 폴더(계획, 보고서, 실행별 로그,
  스크린샷, 맵 뷰 뽑기. 숲 사본은 뺀다)와 번들을 산출물로.
- 잡 `collect` (ubuntu, `bundle` 뒤): 세 OS 의 번들을 한 산출물 `InitialEditor-<커밋>` 으로 모으고 `SHA256SUMS.txt` 를 붙인다.
- 잡 `release` (태그를 민 실행만, `check` 와 `collect` 뒤, 이 잡만 `contents: write`): `gh release create <태그> --draft`(판에 `-` 가 있으면
  `--prerelease`), 파일은 `collect` 산출물 전부. 본문은 `docs/releases/first-open.md`(서명 안 된 앱 여는 법) 뒤에 `docs/releases/<판>.md`
  가 있으면 그것, 없으면 지난 태그부터의 커밋 목록. **에디터의 초안을 공개하는 것은 저자다.**
- 산출물 이름은 Tauri 기본 그대로: `InitialEditor_<판>_aarch64.dmg`, `InitialEditor_<판>_amd64.AppImage`, `InitialEditor_<판>_amd64.deb`,
  `InitialEditor_<판>_x64-setup.exe`. `version:check --bundles` 가 이 이름들에 든 판이 루트 `package.json` 과 같은지 본다 (9절).
- 두 워크플로는 actionlint 1.7.12 (shellcheck 0.10.0 과 함께)로 검사해 깨끗하다. 1.7.7 은 `macos-26` 라벨을 모른다.
- 로컬의 dmg 만들기는 Tauri 의 `bundle_dmg.sh` 가 Finder 를 꾸미는 AppleScript 를 돌려 창이 잠깐 뜬다. CI 에서는 `CI` 변수가 있어
  Tauri 가 `--skip-jenkins` 로 건너뛴다. 로컬 검사는 `--bundles app` 으로 한다.

### 4.2 엔진 저장소 (`dist.yml`)

- 트리거: 태그 `v2.*`, `workflow_dispatch`, PR 에서 `CMakeLists.txt`, `tools/build_dist.sh`, `tools/build_web.sh`, `tools/pack_templates.py`,
  `resources/templates/**`, 이 워크플로우가 바뀔 때.
- `native` 행렬 (`macos-26` aarch64, `ubuntu-22.04` x86_64): 의존(cmake, ruby, bison. Linux 는 SDL 소스 빌드용 `libx11-dev libxext-dev
  libxrandr-dev libxcursor-dev libxi-dev libxss-dev libwayland-dev libxkbcommon-dev libegl1-mesa-dev libgl1-mesa-dev libasound2-dev
  libpulse-dev libdbus-1-dev libudev-dev`), `tools/build_dist.sh`(판 헤더가 `--dirty` 를 달지 않게 그림 생성보다 **먼저**), `tools/check_dist.sh`,
  `python3 tools/generate_placeholder_assets.py`, `SDL_VIDEODRIVER=dummy SDL_AUDIODRIVER=dummy python3 tests/run_engine_tests.py dist/Initial2D-<트리플>`
  (3.1 절의 범위), macOS 잡만 `python3 tools/pack_templates.py`(검수에 쓴 바로 그 그림을 묶는다), 산출물.
- `web`: emsdk 6.0.10 고정, `tools/build_web.sh`, `Initial2D-web.zip`(js, wasm, 로더, `engine-web.json` 에 커밋과 기능), `tools/web_smoke.mjs`
  (Playwright 는 임시 폴더에 설치).
- `release` (태그): 자산 `Initial2D-aarch64-apple-darwin`, `Initial2D-x86_64-unknown-linux-gnu`, `Initial2D-web.zip`, `Initial2D-templates.zip`,
  `engine-dist.json`, `SHA256SUMS.txt`, `THIRD-PARTY.md`. **엔진 릴리스는 초안이 아니라 곧바로 공개한다** (판에 `-` 가 있으면 프리릴리스).
  에디터의 CI 와 `yarn engine:fetch` 가 다른 저장소의 자산을 받아야 하는데, 초안의 자산은 그것을 볼 수 있는 토큰 없이는 받을 수 없기 때문이다.
  엔진 릴리스는 개발 산출물이고 사용자가 받는 것은 에디터 릴리스다.
- 기존 `tests.yml`(Homebrew 빌드의 전체 검수)은 그대로 둔다.

**에디터가 엔진 릴리스를 받는 법**: `engine-pin.json`(에디터 저장소 루트, 새)이 한 엔진 릴리스를 가리킨다.

```json
{
  "comment": "yarn engine:pin <엔진 태그> 가 쓴다. ciEngineRef 말고는 손으로 고치지 않는다",
  "engineTag": "v2.0.0-alpha.1",
  "engineCommit": "<40자>",
  "native": {
    "aarch64-apple-darwin": { "asset": "Initial2D-aarch64-apple-darwin", "sha256": "...", "features": ["lua", "mruby"] },
    "x86_64-unknown-linux-gnu": { "asset": "Initial2D-x86_64-unknown-linux-gnu", "sha256": "...", "features": ["lua", "mruby"] }
  },
  "web": { "asset": "Initial2D-web.zip", "sha256": "..." },
  "templates": { "asset": "Initial2D-templates.zip", "sha256": "..." },
  "thirdParty": { "asset": "THIRD-PARTY.md", "sha256": "..." }
}
```

- 받는 주소는 공개 자산 주소(`https://github.com/biud436/Initial2D/releases/download/<태그>/<자산>`)다. 토큰이 필요 없고, CI 에서
  `gh release download` 를 `GITHUB_TOKEN` 으로 써도 된다 (공개 저장소).
- `yarn engine:pin <태그>` 는 릴리스의 `engine-dist.json` 과 `SHA256SUMS.txt` 를 읽어 핀을 쓰고, 한 명령으로 같은 릴리스의 나머지를 옮긴다:
  `Initial2D-web.zip` 을 풀어 `packages/app/public/engine/` 과 그 MANIFEST(지금의 `sync:engine-web` 과 같은 모양)를, `THIRD-PARTY.md` 를
  `public/engine/` 에, `Initial2D-templates.zip` 을 `sync-engine-templates.mjs --from-zip` 으로 `packages/app/templates/` 와 그 MANIFEST
  (엔진 커밋 40자, `generated` 표시)를. 그다음 저장소 안의 엔진에서 온 MANIFEST 가운데 릴리스 자산이 아니라 체크아웃에서 오는 것
  (MANIFEST 의 `source: "checkout"`, 지금은 E5 의 ext-rpg 픽스처)은 `INITIAL2D_DIR` 이 핀의 커밋에 있는지 확인하고 그 동기화 명령을
  다시 돌린다. 커밋이 다르면 `git -C <엔진> checkout <커밋>` 안내와 함께 실패한다. 엔진에서 온 MANIFEST 는 모두 `source`
  (`release` 또는 `checkout`)와 `syncCommand` 칸을 가진다. 모르는 모양이면 `engine:pin` 과 `check-engine-pin.mjs` 가 실패한다.
  템플릿 MANIFEST(`packages/app/templates/MANIFEST.json`)는 `yarn sync:templates` 가 엔진 체크아웃에서 쓰면 `source: "checkout"`,
  `syncCommand: "yarn sync:templates"` 이고, `--from-zip` 으로 템플릿 묶음(공개 릴리스가 없는 동안에는 `dist.yml` 산출물이나 로컬
  `tools/pack_templates.py` 의 `Initial2D-templates.zip`. dist 폴더를 줘도 된다)에서 쓰면 `source: "release"`,
  `syncCommand: "yarn sync:templates --from-zip <Initial2D-templates.zip>"`(알림용)다. 파일 목록과 내용은 두 길이 같다. 커밋은 40자이고,
  `generated` 는 체크아웃이면 `git ls-files` 에 없는 파일, 묶음이면 묶음 MANIFEST 의 표시다. 체크아웃의 추적 파일이 커밋과 다르면 멈추고
  `--allow-dirty` 면 `dirty: true` 를 적는다 (`templates.test.ts` 는 `dirty` 가 적힌 사본을 실패로 친다).
- 로컬 빌드에서 복사하는 `yarn sync:engine-web` 과 `yarn sync:templates` 는 개발용으로 남는다.

**공개 릴리스가 없는 동안의 핀** (결정 기록의 "엔진을 받는 길"). 지금 `engine-pin.json` 은 엔진 커밋만 가리킨다. 자산 칸(`native`, `web`,
`templates`, `thirdParty`)은 공개 릴리스가 생기면 `engine:pin` 이 채운다 (`engine:pin` 은 태그가 생긴 뒤의 일로 남긴다).

```json
{ "comment": "...", "engineTag": null, "engineCommit": "cac4b94e2dab79e13e5fd2ebdb6686fd23cfd33f", "ciEngineRef": null }
```

- `yarn engine:fetch --from <엔진 dist 폴더>` 가 기본 길이다. 폴더는 로컬의 `<엔진>/dist`(tools/build_dist.sh) 또는 `dist.yml` 의
  산출물 `initial2d-dist-<커밋>` 이다. 그 폴더의 `engine-dist.json` 모양과, 받는 실행 파일의 sha256 과 크기(`engine-dist.json`, 있으면
  `SHA256SUMS.txt` 도)를 확인한다. **dist 의 엔진 커밋이 핀과 다르면 멈춘다** (다른 엔진을 시험하려면 `--any-commit`, 그러면 `engine.json`
  의 `pinned` 가 거짓이다). 기능에 `lua` 가 없으면 멈춘다. 같은 커밋이라도 다른 컴퓨터에서 만든 실행 파일은 바이트가 다를 수 있으므로
  핀의 sha256 은 릴리스 길에서만 대조한다. `THIRD-PARTY.md` 가 dist 폴더에 없으면(로컬 `<엔진>/dist`) 한 단계 위(엔진 저장소 루트)의
  것을 쓴다. `--target x86_64-pc-windows-msvc` 는 고지만 받는다. 지원하지 않는 타깃(Intel 맥 등)과 인자 오류는 종료 코드 2.
- `yarn engine:fetch`(`--from` 없이)는 핀의 `engineTag` 가 있어야 한다. 없으면 "공개 릴리스가 생기기 전에는 --from" 이라고 멈춘다.
  태그가 있으면 공개 자산 주소에서 받아 핀의 sha256 으로 확인한다 (단위 시험만 있고 아직 쓰이지 않는다).
- `yarn engine:fetch --templates <빈 폴더> [--from <dist 폴더>]` 는 엔진 대신 `Initial2D-templates.zip` 을 그 폴더에 푼다 (묶음 MANIFEST 의
  sha256 과 엔진 커밋이 핀과 같은지 확인. zip 읽기는 `sync-engine-templates.mjs` 의 `readZip`). 릴리스 `check` 잡의 템플릿 대조
  (`INITIAL2D_TEMPLATES_SRC`)가 쓴다.
- `yarn engine:check`(`scripts/check-engine-pin.mjs`)는 핀의 모양, `ciEngineRef` 가 비었는지, 저장소 안의 엔진에서 온 MANIFEST 전부
  (`node_modules`, `dist`, `target`, `src-tauri/binaries` 는 빼고 찾는다)의 커밋과 `source` 와 `syncCommand`, 받아 둔
  `src-tauri/binaries/engine.json` 의 커밋을 본다. 핀에 `web` 자산이 있으면 `public/engine/` 의 파일을 릴리스 zip 과 대조하고, 없으면
  건너뛴다고 한 줄 남긴다. 2026-09-27: 처음에는 웹 엔진 MANIFEST(엔진 `179cecc`, `source` 와 `syncCommand` 없음)가 실패했다.
  `sync-engine-web.mjs` 가 `source: "checkout"` 과 `syncCommand: "yarn sync:engine-web"` 을 쓰게 하고, 웹 엔진을 핀의 커밋 `cac4b94` 에서
  `tools/build_web.sh` 로 다시 빌드해 가져온 뒤 전부 통과한다. 같은 커밋을 다른 폴더에서 빌드해도 세 파일의 바이트가 같았다.
  `engineManifest.test.ts` 가 두 칸과 `engineDirty` 가 참이 아닌지도 본다.

### 4.3 CI 가 헤드리스로 확인하는 것과 못 하는 것

| 무엇 | macOS | Linux | Windows | 방법 |
|---|---|---|---|---|
| 번들이 만들어진다 | 필수 | 필수 | 필수 | `tauri build` |
| 사이드카가 자립 실행 파일이다 | 필수 | 필수 | (R5 뒤) | `check-sidecar.mjs` 를 번들 안 파일에 |
| 설치본이 뜨고 템플릿으로 새 프로젝트를 만든다 | 필수 | 필수 (xvfb) | 필수 | 자가 검사 |
| 번들 엔진으로 플래피(Lua 와 Ruby)가 돈다 | 필수 | 필수 | (R5 뒤) | 자가 검사, 프로세스 방식, `SDL_VIDEODRIVER=dummy`, `SDL_AUDIODRIVER=dummy` |
| 맵 문서로 칠한 칸이 번들 엔진 화면에 나온다 | 필수 | 필수 | (R5 뒤) | 자가 검사, 타일맵 템플릿, `INITIAL2D_SCREENSHOT` |
| 맵 뷰가 그린 알데바란 숲이 게임 화면과 같다 (E3 완료 기준 1) | 필수 | 필수 | (R5 뒤) | 자가 검사의 숲 프로젝트(엔진 저장소 체크아웃의 사본), 맵 뷰의 타일 뽑기와 같은 카메라의 게임 스크린샷 |
| 항구 마을의 이벤트 17개가 게임의 자리에 보이고, 이벤트 앞에서 실행과 자동 재생이 앱에 든 엔진으로 돈다 (E5 완료 기준 첫째와 셋째) | 필수 | 필수 | (R5 뒤) | 자가 검사의 항구 마을 프로젝트(같은 사본), RPG 확장의 탐침과 확장의 실행 요청, 게임의 `rpg:` 줄 |
| 엔진을 못 찾아 에디터 안(웹 엔진)으로 넘어가 플래피가 돈다 | (해당 없음) | (해당 없음) | 필수 | 자가 검사, 프로세스 방식으로 시작, `expectFallback`. WebView2 는 WARP 나 SwiftShader 로 WebGL 을 준다 |
| 웹 엔진(에디터 안)으로 플래피가 돈다 | 시도 | 시도 | (위 줄) | 자가 검사, 에디터 안 방식. 러너의 WebGL(소프트웨어 렌더링)에 달렸다 |
| 웹뷰 보안 정책 위반이 없다 | 필수 | 필수 | 필수 | 자가 검사의 `cspViolations` |
| 서명 안 된 앱의 첫 열기 (Gatekeeper, SmartScreen) | 못 함 | 해당 없음 | 못 함 | 저자 실기 |
| 소리, 실제 창, 입력 | 못 함 | 못 함 | 못 함 | 저자 실기 |
| 안드로이드 기기 설치 | 못 함 | | | 저자 실기 (스테이징 결과는 6절의 교차 검사가 헤드리스로 본다) |

## 5. 자가 검사 계약

CI 가 빌드 폴더가 아니라 **실제 배포물**(dmg 안의 앱, AppImage, 설치한 exe)을 검사하려면 앱 스스로 "새 프로젝트, 열기, 고치기, 실행, 기록" 을
돌 수 있어야 한다. 그래서 릴리스 빌드에도 들어가는 자가 검사 모드를 둔다. 환경 변수가 없으면 아무것도 하지 않는다. 판정은 앱이 아니라
바깥의 스크립트가 한다.

**켜는 법**: `INITIAL_EDITOR_SELFTEST=<계획 JSON 경로>`

**격리.** 자가 검사는 사용자의 상태를 읽지도 쓰지도 않는다. 저자가 자기 맥에서 `yarn selftest:app` 을 돌려도 저자의 `enginePath` 가
`bundled` 를 이기지 않고, 최근 프로젝트와 레이아웃과 창 위치가 바뀌지 않는다.

- 설정은 코어의 `MemorySettingsStorage`(기본값, 저장하지 않는다). 최근 프로젝트도 설정 안이므로 함께 꺼진다. 신뢰 기록(2.3)도 비어 있다.
- 레이아웃은 `LayoutPersistence` 에 메모리 `local` 을 주고 프로젝트 레이아웃 파일 쓰기를 끈다.
- 셸은 `window-state` 플러그인을 붙이지 않는다.
- 실행 방식은 설정이 아니라 실행마다 고른다: `StartOptions.mode`(새, `RunMode`)가 있으면 `RunnerStore` 는 그 방식으로 한 번 돈다.
  설정의 `runMode` 는 바뀌지 않는다. 자가 검사는 계획의 `runs[].mode` 를 이 칸으로 넘긴다.
- 창: 계획의 `showWindow` 가 거짓이면 셸이 창 `main` 을 보이지 않게 만든다 (2.2 의 `lib.rs`). 에디터 안 방식은 보이는 창이 필요하므로
  (숨은 웹뷰는 프레임을 멈춘다) `selftest-plan.mjs` 는 에디터 안 실행이나 `expectFallback` 이 있는 계획에만 `showWindow: true` 를 준다.
  저자가 로컬에서 기본으로 돌리는 계획은 프로세스 방식뿐이라 창도 게임 창도 뜨지 않는다 (엔진은 `SDL_VIDEODRIVER=dummy`).
- 모달이 뜨면(신뢰 확인, 저장 여부 등) 그 자체가 실패다 (`unexpected_dialog`, 모달의 제목을 보고서에).

**계획 (`scripts/selftest-plan.mjs` 가 OS 별로 만든다)**

```json
{
  "version": 1,
  "workDir": "/tmp/i2d-selftest",
  "report": "/tmp/i2d-selftest/report.json",
  "totalTimeoutMs": 600000,
  "showWindow": true,
  "projects": [
    {
      "id": "flappy-lua",
      "template": "flappy",
      "language": "lua",
      "runs": [
        {
          "mode": "process",
          "expectEngineSource": "bundled",
          "check": "flappy",
          "env": { "SDL_VIDEODRIVER": "dummy", "SDL_AUDIODRIVER": "dummy", "INITIAL2D_AUTOPLAY": "1", "INITIAL2D_EXIT_AFTER": "60000" },
          "timeoutMs": 90000
        },
        {
          "mode": "embedded",
          "optional": true,
          "check": "flappy",
          "env": { "INITIAL2D_AUTOPLAY": "1" },
          "timeoutMs": 120000
        }
      ]
    },
    {
      "id": "flappy-ruby",
      "template": "flappy",
      "language": "mruby",
      "runs": [
        {
          "mode": "process",
          "expectEngineSource": "bundled",
          "check": "flappy",
          "env": { "SDL_VIDEODRIVER": "dummy", "SDL_AUDIODRIVER": "dummy", "INITIAL2D_AUTOPLAY": "1", "INITIAL2D_EXIT_AFTER": "60000" },
          "timeoutMs": 90000
        }
      ]
    },
    {
      "id": "tilemap",
      "template": "tilemap",
      "language": "lua",
      "edit": { "kind": "paintTile", "map": "resources/maps/start.json", "layer": 0, "x": 24, "y": 28, "gid": 45 },
      "runs": [
        {
          "mode": "process",
          "expectEngineSource": "bundled",
          "check": "tilemapPixel",
          "env": {
            "SDL_VIDEODRIVER": "dummy", "SDL_AUDIODRIVER": "dummy",
            "INITIAL2D_SCREENSHOT": "/tmp/i2d-selftest/logs/tilemap-1.bmp", "INITIAL2D_SCREENSHOT_FRAME": "30", "INITIAL2D_EXIT_AFTER": "40"
          },
          "timeoutMs": 60000
        }
      ]
    }
  ]
}
```

- 플래피의 자동 시연은 900틱에 스스로 끝난다. `INITIAL2D_EXIT_AFTER` 는 안전판이다 (`e2e-engine-scene.mjs` 와 같은 값).
- `SDL_AUDIODRIVER=dummy`: 엔진의 `SDL_Init` 은 소리까지 켜고 실패하면 끝난다. 오디오 장치가 없는 러너에서 포장과 무관한 이유로 떨어지지 않게 한다.
- **Windows 계획** (R5 전): 프로젝트 `flappy-lua` 하나, 실행 하나:
  `{ "mode": "process", "expectEngineSource": "none", "expectFallback": "embedded", "check": "flappy", "env": { "INITIAL2D_AUTOPLAY": "1" }, "timeoutMs": 150000 }`
  이고 **필수**다. 프로세스 방식으로 시작하므로 엔진 탐색과 넘어감이 둘 다 검사 대상이 된다. Ruby 와 타일맵 프로젝트는 R5 뒤에 더한다
  (웹 엔진은 mruby 가 없고, 스크린샷 환경 변수는 MEMFS 에 쓴다).
- 로컬 계획(`yarn selftest:app`)은 프로세스 실행만 넣고 `showWindow: false`. `--embedded` 를 주면 에디터 안 실행을 더하고 창이 뜬다.
  `workDir` 은 매번 새 임시 경로(`os.tmpdir()` 아래 `i2d-selftest-<시각>`)이고, 끝나면 경로를 찍고 지우지 않는다.

**흐름**

1. 셸의 `setup` 이 환경 변수의 경로에서만 계획을 읽고 검사한다 (명령 인자로 경로를 받지 않는다). `workDir` 이 이미 있으면 계획 오류(종료 코드 2,
   지우지 않는다). 셸이 `workDir`, `workDir/logs`, 프로젝트마다 `workDir/<id>` 를 **만든다** (앱에는 fs 플러그인이 없고 `project_open` 과
   `fs_mkdir` 는 이미 열린 루트 안에서만 일하므로 셸의 몫이다). 그리고 감시 스레드를 띄운다: `totalTimeoutMs` 가 지나면 마지막 진행 상태
   (`selftest_progress` 가 알린 것)를 담은 `{ "version": 1, "ok": false, "error": "total_timeout", ... }` 를 계획의 `report` 에 쓰고 종료 코드 1 로
   앱을 끝낸다. 프런트가 멈추거나 죽어도 앱은 끝난다.
2. 프런트가 명령 `selftest_plan` 으로 계획을 받는다 (없으면 null, 평소 실행). 위의 격리대로 `Editor` 를 만든다.
3. 프로젝트마다: `backend.open(<workDir>/<id>)`, 새 프로젝트 대화상자와 같은 함수(`scene/projectTemplates.ts` 의 `writeProjectTemplate`)로
   템플릿을 쓰고, `editor.openProject` 로 연다. 대화상자는 띄우지 않는다. 진입 스크립트를 편집기로 연다 (Monaco 와 워커가 정책 아래에서 뜨는지).
   `edit` 이 있으면 맵 문서를 열고(맵 뷰, PIXI), 펜 명령 한 번을 문서의 되돌리기 스택으로 적용하고, 문서 저장으로 쓴다. 사용자가 칠하고
   Ctrl+S 하는 길과 같다.
4. `runs` 를 차례로 돈다. `runner.start({ mode, env })` 이고 프로세스 방식은 엔진 후보 탐색부터 다시 하므로 "동봉 엔진을 찾는가" 와
   "못 찾으면 넘어가는가" 까지가 검사 대상이다. 출력 줄을 전부 모아 실행이 끝나면 `selftest_write_log(name, text)` 로 `workDir/logs/<id>-<n>.log`
   에 쓴다 (셸은 `logs/` 안의 단순 이름만 받는다). 시간 제한을 넘으면 정지하고 실패로 적는다. 단계마다 `selftest_progress` 를 부른다.
5. `selftest_finish(reportJson, code)` 가 보고서를 **계획의 `report` 경로에** 쓰고(프런트는 경로를 주지 않는다) 앱을 끝낸다.
   종료 코드: 전부 통과 0, 필수 실패 1, 계획 오류 2.

**보고서**

```json
{
  "version": 1,
  "ok": true,
  "app": { "version": "2.0.0-alpha.1", "commit": "abc1234", "platform": "mac", "backend": "tauri" },
  "cspViolations": [],
  "projects": [
    {
      "id": "flappy-lua",
      "root": "/tmp/i2d-selftest/flappy-lua",
      "template": "flappy",
      "language": "lua",
      "files": 27,
      "edit": null,
      "runs": [
        {
          "mode": "process",
          "optional": false,
          "ok": true,
          "engine": {
            "source": "bundled",
            "path": ".../InitialEditor.app/Contents/MacOS/Initial2D",
            "features": ["lua", "mruby"],
            "meta": { "engineTag": "v2.0.0-alpha.1", "engineCommit": "..." }
          },
          "fallback": null,
          "exitCode": 0,
          "durationMs": 16500,
          "lineCount": 58,
          "log": "/tmp/i2d-selftest/logs/flappy-lua-1.log",
          "screenshot": null,
          "errorLines": [],
          "tail": ["사람이 CI 출력에서 읽는 마지막 40줄"]
        }
      ]
    }
  ]
}
```

`log` 가 계약의 일부다. 판정은 이 **전체 로그**를 읽는다. `tail` 은 CI 출력에서 사람이 읽는 용도뿐이고 판정에 쓰지 않는다
(`flappy:state:ready` 와 `flappy:state:play` 는 실행 초반에 찍혀 마지막 40줄에서 이미 빠진다).

**판정**: `scripts/selftest-check.mjs --plan <계획> --report <보고서>` 가 한다. 앱의 `ok` 는 믿지 않고 다시 본다.

- 보고서가 없거나 `error` 가 있으면 실패. `cspViolations` 가 비어 있지 않으면 실패.
- 계획의 필수 실행이 보고서에 빠짐없이 있고, 각 실행의 `engine.source` 가 `expectEngineSource` 와, `fallback` 이 `expectFallback` 과 같다.
- `check: "flappy"`: 그 실행의 `log` 파일 전체에서 종료 코드 0, 오류 줄 없음, `flappy:state:ready`, `flappy:state:play`, `flappy:state:dead`,
  `flappyFinal state=... ticks=900` 과 `best >= 1`. 지금 `scripts/e2e-engine-scene.mjs` 에 있는 플래피 검사를 `scripts/lib/flappyChecks.mjs` 로
  떼어 둘이 같이 쓴다. 에디터 안 방식도 같은 줄을 본다 (웹 엔진의 `print` 가 러너의 출력으로 온다).
- `check: "tilemapPixel"`: 종료 코드 0, 오류 줄 없음, `screenshot`(BMP)의 칠한 칸 (24, 28) 의 픽셀 256 개 가운데 240 개 이상이 표식 색
  `#d8c880`(채널마다 ±8. 타일 44 는 251 개가 그 색이다)이고 이웃 칸 (25, 28) 은 그 색이 아니고 잔디(`#40b080`)다. 엔진의
  `templates_test.py` 와 `e2e-engine-scene.mjs` 가 같은 셈을 한다. BMP 읽기는 이미 있는 `tests/e2e/support/bmp.ts`(단위 시험 있음)이고
  `e2e-engine-scene.mjs` 는 그것을 Vite 의 SSR 로 읽는다 (초안의 `scripts/lib/bmp.mjs` 는 만들지 않았다).
- 필수 실패가 하나라도 있으면 종료 코드 1. 선택 실행의 실패는 경고 줄만.

**Windows 규칙**: 위의 Windows 계획이 필수다. WebView2 는 `windows-latest` 에서 보통 WARP 나 SwiftShader 로 WebGL 을 준다. **첫 CI 실행이
WebGL 이 없음을 로그로 보일 때만** "새 프로젝트를 만들고, 엔진을 못 찾아 에디터 안으로 넘어갔다" 까지로 필수를 줄이고, 그 로그와 판단을
이 문서에 적는다. 그 전에는 줄이지 않는다.

**CI 의 GUI 환경**: macOS 러너에는 창 서버가 있다. Linux 는 `xvfb-run -a` 이고 WebKitGTK 가 합성 모드에서 멈추면
`WEBKIT_DISABLE_DMABUF_RENDERER=1`, `WEBKIT_DISABLE_COMPOSITING_MODE=1` 을 준다. 엔진 프로세스는 `SDL_VIDEODRIVER=dummy` 라 창을 띄우지
않는다 (헤드리스 원칙).

**구현 (2026-09-27)**. 본문과 달라진 것과 더한 것:

- 셸 `src-tauri/src/selftest.rs`: 계획 읽기와 검사(`version` 1, 절대 경로 `workDir` 과 `report`, `totalTimeoutMs` 1초에서 1시간,
  `showWindow`, 프로젝트 `id` 는 영문자와 숫자와 `._-` 이고 `logs` 가 아니고 겹치지 않는다), `workDir` 이 있으면 2 로 끝내고 지우지 않는다,
  `root` 를 주지 않은 프로젝트만 폴더를 만든다. 명령 `selftest_write_log(name, text, encoding?)` 는 `encoding: "base64"` 면 풀어서 쓴다
  (맵 뷰에서 뽑은 BMP). 자가 검사가 아니면 셋 다 `unsupported` 다. 감시가 시간을 넘기면 마지막 `selftest_progress` 를 담은
  `total_timeout` 보고서를 쓰고, 끝낼 때는 엔진 프로세스를 멈춘 뒤 `std::process::exit(code)` 로 끝낸다 (`AppHandle::exit` 는 macOS 에서 종료
  코드를 0 으로 바꿨다). `cargo test` 8건.
- 셸이 만드는 웹뷰: `incognito`(웹뷰 저장소를 남기지 않는다)와 `background_throttling(Disabled)`. 숨은 WKWebView 는 몇 초 뒤 타이머를 멈춰
  첫 로컬 실행이 맵 뷰를 기다리다 전체 시간을 넘겼다. 숨은 창이면 macOS 에서 `ActivationPolicy::Accessory`.
- 계획에 더한 칸: 프로젝트의 `root`(템플릿 대신 이미 있는 폴더), `entry`(진입 스크립트, 없으면 언어의 main), `openMap`(맵 뷰로 열어 둘 맵),
  실행의 `scene`, `check: "mapFrame"` 과 `mapCapture: { map, width, height, placement }`. `placement` 는 로그에서 게임이 선 자리를 잡는
  정규식이고, 카메라는 그 x 를 가운데에 두고 맵 안으로 자른 자리(내림), y 는 0 이다 (알데바란의 `camX`).
- **숲 (E3 완료 기준 1)**: `selftest-plan.mjs --forest <엔진 저장소>` 가 엔진 체크아웃에서 게임에 필요한 폴더(`scripts`, `resources/maps`,
  `aldebaran`, `fonts`, `schema`, `data`, `tiles`, `audio`, `ui`, `icons`. RTP 와 점 파일은 뺀다)를 `<workDir>-forest` 로 복사하고
  `game.json`(768x896, lua)을 쓴다. 엔진 저장소를 그대로 열지 않는 것은 저장소 루트의 `game.json` 이 추적되지 않아 여는 순간 "프로젝트 등록"
  확인이 뜨고(자가 검사 실패), 실행이 저장소에 `config.setting` 을 쓰기 때문이다. 앱은 `aldebaran_forest.json` 을 맵 뷰로 열고,
  `INITIAL2D_SCENE=aldebaran`, `INITIAL2D_SKIP_INTRO=1`, `INITIAL2D_ALDEBARAN_STAGE=aldebaran_forest`, `INITIAL2D_ALDEBARAN_AT=1200`,
  `INITIAL2D_ALDEBARAN_TRACE=1`, `INITIAL2D_NO_RTP=1` 로 앱에 든 엔진을 돌려 프레임 30 을 찍고, 배치 줄의 x 로 셈한 카메라의 384x448
  (논리 화면) 사각형을 맵 뷰에서 뽑는다 (`MapRenderer.captureTiles`: 타일 레이어만, 격자와 통행과 오브젝트 표식 없이, 줌과 상관없이 1배).
  판정은 뽑은 타일의 불투명한 픽셀만 게임 화면(2배)의 같은 자리와 채널마다 ±8 로 견주어 97% 이상 같고, 불투명한 타일이 사각형의
  20% 이상이고, 맵 뷰가 맵 파일의 크기와 오브젝트 수(몬스터, 흔적, 구간)를 가졌는지 본다. 주인공과 거미가 타일 위에 서 있어 100% 는
  아니다. 2026-09-27 이 맥 (숨은 창): 불투명 48071 픽셀 가운데 48001 (99.85%). 같은 셈을 Python 으로 타일셋에서 직접 그려 해도 같은
  수가 나왔다. 브라우저 e2e `tests/e2e/map-capture.spec.ts` 가 뽑기를 캔버스 2D 로 그린 기준과 견준다 (격자와 표식과 줌은 들지 않고,
  한 칸을 칠하면 그 칸만 바뀐다. 뽑는 대상을 월드 전체로 바꾸면 실패한다).
- **숲은 두 레이어와 칠한 칸까지 증명한다** (2026-09-27 검증에서 고쳤다). 위의 비율만으로는 게임이 deco 레이어를 통째로 빼고 그려도
  통과했다: 사각형 안의 deco 는 타일 열다섯 개(약 1500 픽셀)라 97% 문턱 안에 들어갔다 (검증의 감싸개 엔진으로 97.04%). 그래서
  - 계획(`FOREST_EDIT`)이 숲 맵을 맵 문서로 열어 deco 레이어의 빈 하늘 칸 (80, 8) 을 통나무 타일(gid 36, 256 픽셀 불투명)로 칠해 저장한다.
    카메라(x 1008 부터) 안이고 주인공, 몬스터, HUD 와 겹치지 않는다. deco 는 통행에 쓰이지 않아 게임은 전과 같이 움직인다.
    보고서의 `edit` 에 칠하기 전 칸(`cellBefore`)이 더해졌다.
  - 판정(`frameChecks.mjs` 의 `referenceChecks`)이 **저장한 맵 파일과 타일셋 그림으로 기준을 직접 그린다** (`renderMapRect`, 앞 레이어부터
    알파 합성, PNG 는 `scripts/lib/png.mjs`). 그리고 맵 뷰 뽑기가 기준과 99.9% 이상 같은지(맵 뷰가 저장한 맵을 그렸다), 게임 화면이 기준과
    97% 이상 같은지, **레이어마다** 그 레이어를 빼고 그리면 달라지는 픽셀이 64 개 이상이고 게임 화면에서 90% 이상 기준과 같은지, **칠한 칸**이
    디스크의 파일에 gid 36 으로 있고 칠하기 전 gid 로 그리면 달라지는 픽셀이 게임 화면에서 90% 이상 기준과 같은지 본다. 레이어 하나를 빼고
    그린 게임, 칠하기 전 맵을 돌린 게임은 여기서 떨어진다.
  - **칸마다** 도 본다 (두 번째 검증에서 더했다). 전체 97% 는 바닥 타일 다섯 칸이 빠지거나 gid 두 가지를 그리지 않아도 넘었다
    (검증의 감싸개 엔진으로 97.26%, 97.85%). 그래서 카메라 안에서 기준이 불투명한 칸마다 75% 이상 같은지 보고, 어긋난 칸이 두 개를 넘으면
    실패한다. 좋은 실행은 197 칸 가운데 한 칸(주인공이 덮은 칸)만 어긋나고, 빠진 다섯 칸은 여섯 칸, gid 두 가지를 뺀 판은 다섯 칸,
    deco 를 뺀 판은 열다섯 칸이 어긋나 떨어진다 (같은 스크린샷으로 판정만 다시 돌렸다)
  - 2026-09-27 이 맥, 사이드카를 실은 릴리스 `.app` (숨은 창, `--forest /Users/u/Initial2D`): 55 PASS / 0 FAIL. 맵 뷰와 기준 48327/48327,
    게임과 기준 99.86%, ground 46536/46536, deco 1721/1791 (96.09%, 오른쪽 끝의 거미와 왼쪽 전갈이 deco 를 가린다. 앞의 빌드는 96.65%),
    칠한 칸 256/256. 같은 앱의 사이드카를 감싸개로 바꿔 게임 실행 때만 프로젝트의 사본 맵을 바꾸게 한 음성 대조(에디터가 저장한 파일은
    그대로): deco 를 비우면 deco 6.42%, 칠한 칸 0/256 으로 실패 (51 PASS / 4 FAIL). deco 를 비우되 칠한 칸만 남기면 옛 비율 검사는 97.04% 로
    통과하고 deco 20.10% 로 실패 (54 / 1). 칠한 칸만 되돌리면 옛 비율 검사는 99.39% 로 통과하고 칠한 칸 0/256, deco 83.47% 로 실패 (53 / 2).
    단위 시험 `tests/scripts/selftest.unit.ts` 가 같은 넷(통과, deco 없음, 저장한 파일의 deco 없음, 칠하기 전 맵)과 저장 실패, 기준 그리기의
    알파 합성을 가짜 타일셋으로 본다.
- 숨은 창에서는 PIXI 의 프레임이 돌지 않아 맵 뷰의 `ready` 가 서지 않는다. 그래서 창이 보이는 계획(`showWindow`)에서만 맵 뷰 준비를
  필수로 보고, 숨은 창은 5초 기다린 뒤 상태만 적는다. 뽑기는 프레임 없이 덩어리를 직접 그려 뽑으므로 숨은 창에서도 된다.
- 앱 쪽 `packages/app/src/editor/selftest/`: `plan.ts`(계획 검사), `runSelftest.ts`(흐름. 에디터를 `SelftestHost` 로 감싸 가짜로 시험한다),
  `csp.ts`, `bmp.ts`(32비트 BMP, 엔진 스크린샷과 같은 꼴), `index.ts`(`chooseStorage`: 계획이 있으면 평소 설정 저장소를 만들지도 않는다).
  실행마다 `logs/<id>-<n>.log`(엔진 출력 전체), `<id>-<n>.editor.log`(그동안의 콘솔 전체, 출처와 수준), 뽑기가 있으면 `<id>-<n>.map.bmp`.
  보고서에 더한 칸: `showWindow`, `startedAt`, `durationMs`, `dialogs`(뜬 모달의 제목), 프로젝트의 `problems`, `entryScript`, `edit`
  (칠한 뒤와 저장 뒤의 바뀜 표시, 디스크에서 다시 읽은 칸), `mapView`, 실행의 `check`, `problems`, `activeMode`, `editorLog`, `mapCapture`.
- 판정 `scripts/selftest-check.mjs`: 계획을 기준으로 `workDir/logs/` 의 파일을 다시 읽는다 (보고서의 경로와 `ok` 는 믿지 않는다).
  공용 검사는 `scripts/lib/flappyChecks.mjs`(오류 줄, 종료 코드, 플래피)와 `scripts/lib/frameChecks.mjs`(표식 칸, 자리 줄, 카메라, 맵과 화면
  견주기)이고 `e2e-engine-scene.mjs` 도 같은 것을 쓴다. BMP 는 `tests/e2e/support/bmp.ts` 를 Vite SSR 로 읽는다. 단위 시험
  `tests/scripts/selftest.unit.ts` (초반 줄이 전체 로그에만 있는 통과, 로그 없음, 보고서 없음, 시간 초과, 넘어감 어긋남, CSP, 모달, 선택 실행,
  표식 칸, 숲의 사각형과 픽셀).
- `yarn selftest:app <앱>` (`scripts/selftest-app.mjs`): 계획을 새 임시 폴더에 쓰고(기본 `local`, `--embedded`, `--forest`, `--os`,
  `--work`, `--total-timeout`), 앱을 `INITIAL_EDITOR_SELFTEST` 로 띄워 전체 시간과 60초가 지나면 끊고, 판정한다. `--plan <계획> --no-check`
  는 CI 가 쓴다 (판정은 다음 단계).
- Windows 계획의 전제 "웹 엔진은 mruby 가 없다" 는 지금 웹 엔진 사본(`lua mruby wasm`)과 맞지 않는다. 그래도 Windows 필수는 본문대로
  플래피 Lua 하나다 (Ruby 와 타일맵은 R5 뒤에 더한다).
- 2026-09-27 이 맥, 사이드카 덮어쓰기로 만든 릴리스 `.app` (엔진 `cac4b94`, 숨은 창): `yarn selftest:app` 33 PASS / 0 FAIL,
  `--forest /Users/u/Initial2D` 46 PASS / 0 FAIL. 첫 두 실행이 CSP 위반(`connect-src data`)과 숨은 웹뷰의 타이머 멈춤을 잡아 고쳤다.
  한 번은 앱이 보고서 없이 시그널로 끝났고 다시 나오지 않았다 (판정은 "보고서가 없다" 로 실패했다). 사용자 설정 폴더(`com.biud436.initialeditor`
  의 설정과 웹뷰 저장소)에는 자가 검사의 임시 경로가 하나도 남지 않았다 (같은 시각에 본 체크아웃의 개발 앱이 떠 있어 그 앱이 쓴 것만 바뀌었다).
- 2026-09-27 첫 CI 실행 (PR #52, 엔진 핀 `419a829`). macOS 는 `licenseFile` 이 dmg 에 사용권 동의를 붙여 `hdiutil attach` 가 멈췄다.
  뺀 뒤 보이는 창의 자가 검사가 66 PASS / 0 FAIL 이다 (에디터 안 실행과 숲까지). Windows 는 설치본의 넘어감이 통과했고, `cargo test` 의
  실패 둘을 고쳤다: 바꿔 치우는 순간의 파일을 canonicalize 하면 지워진 옛 파일의 자리(`$Extend\$Deleted`)가 나와 읽기가 루트 밖으로
  거부됐다(`paths.rs` 가 잠깐 다시 본다. rename 과 읽기는 잠깐의 잠금을 정해진 시간 안에서 다시 한다), 그리고 python 후보의 중복
  거르기가 구분자만 다른 같은 경로를 둘로 셌다. Linux 는 감시가 inotify 의 열기 알림을 변경으로 쳐서, 에디터가 다시 읽는 것이 또
  변경이 되어 "밖에서 바뀌어 다시 읽었다" 가 끝없이 돌았다 (맵 뷰가 준비되지 못했고 자가 검사가 전체 시간을 넘겼다). 열기와 읽기를
  거른 뒤 57 PASS / 4 FAIL / 1 WARN 이다. 네 실패는 모두 "프로세스 정상 종료" 다: 게임이 스스로 끝낸 뒤(플래피의 `flappyFinal`,
  타일맵의 30 프레임 스크린샷)에도 엔진 프로세스가 끝나지 않아 실행 시간 제한에서 정지됐다. 엔진의 `HotReloadServer::Stop` 은 리슨
  소켓을 닫고 `accept` 에 막힌 스레드를 기다리는데, Linux 의 `close` 는 그 `accept` 를 깨우지 않는다 (macOS 는 깨운다. 엔진 시험은
  macOS 에서만 돈다). 엔진이 닫기 전에 `shutdown` 을 불러야 한다 (엔진 고침과 핀 올리기가 남았다). WARN 은 선택 실행인 에디터 안
  실행이 WebKitGTK 에 소리 장치가 없어 끝난 것이다.

## 6. 안드로이드 에셋 스테이징

### 6.1 범위

| 한다 | 안 한다 |
|---|---|
| 열린 프로젝트를 엔진 저장소의 `android/app/src/main/assets/` 로 스테이징한다. 엔진의 스크립트로 | SDL 소스 받기(`download_sdl.sh`), Gradle 빌드, 서명, `adb install`, 기기 목록 |
| 미리 세기(파일 수, 크기, RTP 포함 여부)와 확인 | 게임마다 다른 `applicationId`, 여러 프로젝트를 한 APK 에 |
| 결과와 다음 명령을 콘솔에 | 웹판과 브리지 모드 (프로세스를 못 띄운다) |

안드로이드 프로젝트(`android/`)는 엔진 저장소 안에 있으므로 이 명령은 **엔진 저장소 체크아웃이 있을 때만** 된다. 동봉 엔진은
저장소가 아니다.

### 6.2 엔진 스크립트 계약 (엔진 저장소)

```
android/prepare_assets.sh                                                   # 인자 없음: 지금과 같다
android/prepare_assets.sh --project <폴더> [--with-rtp] [--dry-run] [--dest <폴더>]
```

- **인자 없는 실행은 지금과 같다** (결정 기록). 옛 스크립트 본문을 그대로 두어 저장소 자신의 `scripts/`, `resources/`(`RTP.zip` 과 점 파일만
  빼고), `game.json`, `config.setting`, `db.sqlite` 를 올리고 출력 세 줄도 같다. 스탬프와 `STAGED` 줄은 붙지 않는다.
- 새 규칙은 `--project` 가 있을 때만이다 (초안의 "기본값은 저장소 루트" 는 결정 기록과 어긋나 버렸다). `--project` 없이 다른 인자만 주면
  종료 코드 2. 저장소 자신을 새 규칙으로 올리려면 `--project .` 이다. 폴더가 없거나 `game.json` 이 없으면 종료 코드 2.
- `--dest` 기본값은 `android/app/src/main/assets`. 시험용이며 에디터는 넘기지 않는다. 대상은 통째로 지우므로 프로젝트 자신이나 그 위 폴더,
  프로젝트의 `scripts/` 나 `resources/` 안이면 종료 코드 2 (지우기 전에 멈춘다).
- 파일 목록은 `tools/stage_list.py --project <폴더>` 가 낸다. 규칙은 `tools/stage_rules.json` 한 장이고 **안드로이드 전용**이다.
  `tools/web_stage.py` 는 고치지 않는다 (웹 데모의 파일 목록과 골든이 그대로다. 둘을 합치면 웹 데모에 `scripts/ruby/` 와 다른 zip 이 들고
  나는 결정이 따라오는데, 안드로이드 스테이징에는 필요 없는 일이다). 복사와 스탬프도 `stage_list.py --stage <대상>` 이 한다 (Git Bash
  에서 파일마다 `cp` 를 띄우면 느리다). 셸은 인자, 대상 비우기, `assets_manifest.txt`(인자 없는 실행과 같은 `find | sort`), 경고와 마지막
  줄을 맡는다. `--dry-run` 은 `stage_list.py --count` 다.
- `python3` 이 필요하다. 없거나 Python 3 이 아니면 이유를 찍고 종료 코드 2. `INITIAL2D_PYTHON` 이 있으면 그 실행 파일을 쓴다 (에디터가
  찾은 python 을 넘긴다). 인자 없는 실행은 python 을 부르지 않는다.
- **스탬프**: 모든 파일의 (경로, sha256)을 정렬해 해시한 앞 12자로 `assets_stamp/<해시>.txt` 를 하나 만들고 목록에 넣는다. 내용만 바뀌어도
  `assets_manifest.txt` 의 바이트가 바뀌므로 `AndroidBootstrap` 이 다시 푼다. **C++ 무수정.**
- `resources/rtp/` 는 `--with-rtp` 일 때만 들어가고 그때 경고 줄: `WARN rtp: RTP 변환물이 들어간다. 이 APK 는 배포하지 않는다`.
- 마지막 줄은 기계가 읽는다: `STAGED files=<n> bytes=<b> stamp=<12자> rtp=<yes|no> dest=<경로>`. `--dry-run` 은 복사 없이
  `DRYRUN files=... bytes=... rtp=...`.
- 종료 코드: 0 성공, 1 입출력 오류, 2 인자나 프로젝트 오류.

**규칙 표** (`tools/stage_rules.json` 의 내용. `shared` 표시가 있는 줄은 에디터의 게임 탭 규칙(`gameView/staging.ts`)에도 있어야 한다.
규칙마다 `examples` 가 있고 `keepExamples` 는 올라가야 하는 경로다. 엔진 시험과 에디터 시험이 둘 다 이 예시로 규칙을 본다)

| 규칙 | 안드로이드 | `shared` |
|---|---|---|
| `game.json`, `scripts/`(Lua 와 Ruby), `resources/` | 올린다 | |
| 점으로 시작하는 이름, `.initial-editor/`, `.git/` | 뺀다 | 예 |
| `*.zip` (`RTP.zip` 포함), `*.psd` | 뺀다 (`*.psd` 와 다른 zip 은 새로) | 예 |
| `resources/rtp/` | 뺀다. `--with-rtp` 면 넣고 경고한다 (개인 기기 시험) | 예 (게임 탭은 늘 뺀다) |
| `resources/aldebaran/src/` | 뺀다 (새로. 게임이 읽지 않는 원본 그림) | 예 |
| `config.setting` | **올리지 않는다** (새로. 엔진은 이 파일을 쓰기만 하고 읽지 않는다. 옮기면 만든 사람의 절대 경로만 APK 에 들어간다) | |
| `db.sqlite` | 있으면 올린다 (옛 규칙 유지) | |
| 32 MB 넘는 파일 | 넣는다 | 아니다 (게임 탭은 경고하고 뺀다) |
| AAPT 가 버리는 이름 (`ignoreAssetsPattern` 기본값: `_` 로 시작하는 폴더, `~` 로 끝나는 파일, `thumbs.db`, `CVS` 등) | 빼고 `WARN aapt-ignored: <경로> ...` 줄 (stderr). 새로. 목록에 남으면 점 파일처럼 기기에서 풀기가 실패한다 | 아니다 |

인자 없는 실행(엔진 저장소 자신)은 이 표를 쓰지 않는다 (결정 기록). 초안은 이 표로 바꾸려 했지만 저자의 알데바란 기기 시험이 그대로
돌아야 해서 `config.setting` 과 RTP 변환물까지 예전처럼 올린다. RPG 레이어는 RTP 가 없으면 플레이스홀더로 돈다. 새 규칙으로 알데바란을
RTP 그림과 함께 보려면 `--project . --with-rtp` 다 (엔진 `android/README.md` 에 적었다).

`resources/aldebaran/src/` 는 알데바란 한 게임의 규칙이다. 프로젝트별 제외 목록(`game.json` 의 `stage.exclude` 같은)으로 옮기는 것은
후보로 남긴다.

### 6.3 에디터

- **명령** `android.stage` "안드로이드로 스테이징": 실행 메뉴의 구분선 아래와 명령 목록. Tauri 백엔드에서만 켜지고, 다른 백엔드는 꺼 두고
  이유를 툴팁에 ("데스크톱 앱에서만 된다").
- **엔진 저장소 찾기** (`packages/app/src/editor/android/engineRepo.ts`, 순수 함수): `android/prepare_assets.sh` 가 있는 폴더를
  설정 `engineRepoPath`(새) > 열린 프로젝트 자신 > 찾은 엔진이 `<저장소>/build/Initial2D` 꼴이면 그 저장소 > 형제 `../Initial2D` 순서로.
  못 찾으면 명령은 켜 두되 누르면 찾아본 곳과 "설정 열기". 있는지는 셸의 `android_repo_probe(paths)` 가 실행하지 않고 본다
  (스크립트, `android/app/jni/SDL2`, `android/gradlew`). 스크립트를 실행하는 일이므로 설정 말고의 후보는 2.3 의 신뢰를 따른다:
  신뢰가 필요 없는 것은 설정의 저장소와, 설정의 엔진 경로에서 끌어낸 저장소뿐이다. 나머지는 확인 대화상자가 스크립트의 절대 경로와 출처를
  보이고 "스크립트 실행 허용" 을 받기 전에는 미리 세기(`--dry-run`)도 돌리지 않는다. 허용은 앱 설정 `androidTrust`(프로젝트 경로별,
  엔진 신뢰와 같은 `{ allow, exes }` 모양이고 `exes` 가 스크립트 경로)에 남고, 같은 프로젝트가 다른 스크립트를 가리키면 다시 묻는다.
  설정 대화상자의 "엔진 저장소" 줄에 경로 칸과, 열린 프로젝트에서 허용한 스크립트의 "신뢰 취소" 가 있다 (Tauri 에서만).
- **확인 대화상자**: 원본(프로젝트 경로), 대상(`<저장소>/android/app/src/main/assets/`, **통째로 바뀐다**), `--dry-run` 으로 미리 센
  파일 수와 크기, "RTP 변환물 넣기 (개인 기기 시험용)" 체크(기본 꺼짐, 켜면 `--with-rtp` 와 경고 한 줄). 저장 안 된 문서가 있으면 먼저 묻는다
  (저장하고 스테이징, 그대로 스테이징, 취소).
- **셸** (`src-tauri/src/android.rs`): 초안의 `process.rs` 떼기는 하지 않았다. 같은 단계에서 `engine.rs` 를 다른 작업(시간 제한,
  `engine_exists`)이 고치고 있어서, 새 명령은 엔진과 같은 프로세스 표 `EngineState`(줄 펌프, 정지)를 그대로 쓴다. 그래서 정지는
  `engine_stop(id)` 이고 엔진 시험은 무변경이다. 명령 `android_stage(repo, project, withRtp, dryRun) -> RunInfo` 는
  `bash <repo>/android/prepare_assets.sh --project <project> [--with-rtp] [--dry-run]` 을 작업 폴더 `<repo>` 로 띄운다. 스크립트 경로는
  `<repo>/android/prepare_assets.sh` 로 고정하고 인자는 정해진 목록만 만든다 (임의 명령 실행 창구가 되지 않게). 저장소는 절대 경로여야
  하고, 정규화한 스크립트가 저장소 밖(심볼릭 링크)이면 거부한다. `tools/stage_list.py` 가 없는 저장소(엔진 master `cac4b94` 까지의 옛
  스크립트)도 거부한다: 옛 스크립트는 인자를 읽지 않아 `--project` 와 `--dry-run` 을 무시하고 저장소 자신을 스테이징하기 때문이다 (통합에서
  찾았다. 미리 세기가 "이 엔진 저장소의 스테이징 스크립트는 --project 를 모른다" 로 멈추고 스크립트는 돌지 않는다. `cargo test` 가 본다).
  찾은 python 은 `INITIAL2D_PYTHON` 으로 넘긴다. 출력은 `tool:output`,
  `tool:exit` 이벤트로 (모양은 `engine:*` 와 같고, 프런트는 `TauriRunHandle.launch` 에 이벤트 이름만 바꿔 준다).
- **콘솔과 토스트**: 출력은 콘솔 source `android` (`WARN` 과 stderr 는 경고, 스크립트의 오류 줄은 오류). 끝나면 `STAGED` 줄로 토스트
  ("안드로이드 에셋 N개, M MB"), 콘솔에 다음 명령을 한 줄씩 (`android/app/jni/SDL2` 가 없으면 `./android/download_sdl.sh` 부터, `cd android`,
  래퍼가 커밋되지 않아 `android/gradlew` 가 없으면 `gradle wrapper --gradle-version 8.6`, `./gradlew :app:assembleDebug`,
  `adb install -r app/build/outputs/apk/debug/app-debug.apk`). RTP 경고는 경고 토스트로. 종료 코드가 0 이 아니거나 `STAGED` 줄이
  없으면 실패이고 마지막 오류 줄을 이유로 보인다.
- **Windows**: `bash` 를 `ProgramW6432`, `ProgramFiles`, `ProgramFiles(x86)` 의 `Git\bin\bash.exe`, `%LOCALAPPDATA%\Programs\Git`,
  `C:\Program Files\Git\bin\bash.exe`, 그리고 PATH 순서로 찾는다 (PATH 의 `System32` 와 `WindowsApps` 는 WSL 의 bash 라 뺀다).
  `python3` 도 찾는다 (PATH 의 `python3.exe`, `python.exe`). Git for Windows 의 bash 는 Python 을 싣지 않고, `python3` 이 Microsoft Store 로
  넘기는 가짜 실행 파일일 수 있으므로 `-c "import sys; print(sys.version_info[0])"` 가 5초 안에 `3` 을 내는지로 판단한다. 둘 중 하나라도
  없으면 이유("Git for Windows 의 bash 가 필요하다", "Python 3 이 필요하다"). 경로는 `/` 로 바꿔 넘기고 `canonicalize` 의 `\\?\` 머리를
  뗀다. macOS 에서 Finder 로 띄운 앱은 셸의 PATH 를 물려받지 않으므로 `/opt/homebrew/bin`, `/usr/local/bin` 의 python3 도 본다. 실기는 저자.

### 6.4 검증

- 엔진: `tests/tools/prepare_assets_test.sh` (임시 프로젝트 둘. 목록이 규칙 표와 같다, 점 파일과 zip 과 psd 와 `config.setting` 이 빠진다,
  AAPT 가 버리는 이름은 빠지고 경고한다, `--with-rtp` 일 때만 RTP 가 들고 경고 줄이 나온다, `--dry-run` 이 복사하지 않고 같은 수를 낸다,
  스탬프가 내용 변경에 바뀌고 무변경이면 같다, 인자와 프로젝트 오류와 python 없음은 2 이고 대상이 프로젝트면 지우지 않는다, 규칙 파일의
  예시대로 빠지고 남는다, 인자 없는 실행이 가짜 저장소에서 예전 목록과 출력 그대로이고 python 을 부르지 않는다, `web_stage.py` 의 출력
  목록이 이 작업 전과 같다). `tests/run_all.sh` 의 3단계에서 돈다. 인자 없는 실행은 옛 스크립트(master `cac4b94`)와 같은 가짜 저장소에서
  출력, 목록, 폴더 트리가 같은 것을 손으로도 대조했다.
- 에디터 단위: 저장소 찾기와 신뢰(`engineRepo.test.ts`), `STAGED` 와 `DRYRUN` 줄 해석과 다음 명령(`stageOutput.test.ts`), 스토어
  (`AndroidStageStore.test.ts`: 허용 전에는 스크립트를 돌리지 않는다, 줄과 토스트, 실패), 대화상자 문구와 흐름(`AndroidStageDialog.test.tsx`),
  설정(`settings.android.test.ts`, `SettingsDialog.android.test.tsx`). 엔진 저장소가 있으면 `stage_rules.json` 의 `shared` 줄의 예시를
  `staging.ts` 도 빼는지 (`sharedRules.test.ts`, 규칙 파일이 없으면 건너뛴다). Rust (`android.rs`): 가짜 스크립트로 인자와 작업 폴더와
  python 변수, 저장소 밖을 가리키는 스크립트 거부, 상대 경로와 없는 프로젝트 거부, `python3` 판단(가짜 실행 파일 넷), Windows 의 bash 후보.
  e2e (`tests/e2e/android-stage.spec.ts`): 메모리 모드에서 명령이 구분선 아래에 꺼져 있고 이유가 보인다.
- **교차 검사** `yarn test:android-stage` (`scripts/e2e-android-stage.mjs`): 템플릿으로 플래피 프로젝트를 만들고, 엔진 저장소의
  스크립트를 에디터 명령과 같은 인자에 `--dest <임시 폴더>` 를 더해 돌리고, `assets_manifest.txt` 대로 다른 임시 폴더에 푼 뒤
  (AndroidBootstrap 과 같은 규칙) 그 폴더를 작업 폴더로 데스크톱 엔진을 헤드리스로 돌려 플래피 검사를 통과한다. "스테이징한 것만으로
  게임이 돈다" 를 테스트가 본다. 미리 센 수가 스테이징의 수와 같고, `config.setting` 과 RTP 변환물과 `.initial-editor/` 가 들어가지 않고,
  한 파일의 내용만 바꿔 다시 돌리면 스탬프가 다르고 되돌리면 처음 스탬프다. `--with-rtp` 를 더하면 RTP 가 들고 경고 줄이 나온다.
  `--project` 를 모르는 엔진 체크아웃이나 빌드한 엔진이 없으면 건너뛴다 (종료 코드 0).
- 실기 (선택): 저자가 APK 를 빌드해 기기에서 플래피가 돈다.

## 7. 웹판 (Cloudflare Pages)

### 7.1 Tauri 앱과의 관계

같은 커밋의 같은 `dist/` 다. 코드는 `ProjectBackend` 구현과 실행 방식만 다르다 (index.md 2절의 결정). 웹판은 설치 없이 써 보기와
가벼운 편집, Tauri 앱은 완전판이다.

| 기능 | 웹판 | 데스크톱 앱 |
|---|---|---|
| 폴더 열기와 저장 | 크로미움 계열만 (File System Access). 나머지는 메모리 샘플 | 전부 |
| 새 프로젝트 | 폴더를 열 수 있는 브라우저에서 된다 (고른 로컬 폴더에 템플릿을 쓴다). 메모리와 브리지 모드는 안 된다 | 된다 |
| 실행 | 에디터 안 (웹 엔진. Lua, 웹 빌드에 mruby 가 있으면 Ruby 도. 지금 사본은 `lua mruby wasm`) | 프로세스(동봉 엔진, Lua 와 Ruby) 또는 에디터 안 |
| 안드로이드 스테이징 | 안 된다 | 된다 (엔진 저장소가 있을 때) |
| 판 | 프로덕션 브랜치의 마지막 배포 | 마지막 릴리스 |

새 프로젝트를 막는 것은 플랫폼 한계가 아니라 `appCommands.ts` 의 `enabled: () => !browser` 였다. 이 단계에서
`enabled: () => editor.backend.capabilities.pickFolder` 로 바꾼다 (Tauri 와 브라우저 폴더 백엔드는 참, 메모리와 브리지는 거짓). 웹판의 새 프로젝트
대화상자는 언어에서 Ruby 를 고르면 "웹판에서는 실행하지 못한다 (데스크톱 앱에서 돈다)" 를 보인다. 설치 없이 써 보는 사람의 첫걸음이
"로컬 폴더에 플래피나 타일맵 프로젝트 만들기" 이기 때문이다.

구현 (2026-09-27, `newProject.ts`):

- 켜는 조건은 `newProjectBlocker(editor)` 다. 브라우저 폴더 모드는 백엔드가 아니라 **폴더 열기가 있는 브라우저인지**(`browserFolders(editor).supported`)로
  본다. "샘플로 해 보기" 뒤에는 백엔드가 메모리라 `pickFolder` 가 거짓이지만 새 프로젝트는 되어야 하기 때문이다 (Ctrl+O 가 샘플 뒤에도
  폴더 고르기인 것과 같다). 데스크톱은 백엔드의 `pickFolder`, 메모리와 브리지는 꺼지고 툴팁에 이유를 적는다.
- 웹판의 흐름: 클릭 안에서 폴더를 먼저 고르고(`showDirectoryPicker` 는 사용자 제스처가 필요하다), 열린 프로젝트를 닫고, 고른 폴더의 항목을
  세어 비어 있지 않으면 묻고, 대화상자를 띄운다. **만들기를 누른 뒤에야** 폴더를 기억하고(IndexedDB, 최근 폴더) 브라우저 폴더 백엔드로
  바꿔 템플릿을 쓴다. 그래서 중간에 취소하면 기억한 기록(같은 이름의 기록이 가리키는 핸들 포함)과 백엔드가 그대로다.
- Ruby 안내는 웹 엔진 MANIFEST 의 기능에 mruby 가 **없을 때만** 뜬다. 초안을 쓸 때는 웹 엔진이 Lua 만이었지만 지금 사본(엔진 cac4b94)은
  `lua mruby wasm` 이라 웹판에서도 Ruby 게임이 돈다. 데스크톱 앱에는 뜨지 않는다.

E4 가 남긴 물음("배포에서 웹 데모를 함께 낼지")의 답: 에디터 웹판이 곧 웹 데모다. 엔진 저장소의 단독 데모 페이지(`build-web/site/`,
알데바란)를 따로 배포할지는 소재 공개와 함께 저자 결정으로 남긴다.

### 7.2 Pages 설정 (대시보드. 이 표를 README 에 박제한다)

| 칸 | 값 |
|---|---|
| 빌드 명령 | `yarn build` |
| 출력 폴더 | `dist` |
| 루트 | `/` |
| Node | `.node-version`(22) |
| Yarn | `.yarnrc.yml` 의 `yarnPath`(Berry 4.3.1)로 넘어간다 |
| 환경 변수 | 없음. 커밋은 Pages 가 주는 `CF_PAGES_COMMIT_SHA` 를 `vite.config.ts` 가 읽는다 |
| 프로덕션 브랜치 | **`main`** (제안). 릴리스 때 `main` 을 태그 커밋으로 빨리 감기 한다 (이력 재작성 아님). 웹판 = 마지막 릴리스 |
| 미리보기 | `next` 와 PR 브랜치. `next` 미리보기 주소가 매일판이다 |

**찾은 값 (2026-09-27, 대시보드는 바꾸지 않았다. 결정 기록)**: 저장소의 GitHub 체크(`cloudflare-workers-and-pages`)와 응답으로 알아냈다.
Pages 프로젝트는 `initial-editor`, 프로덕션 주소는 저장소 홈페이지인 https://initial-editor.biud436.com (같은 것이 https://initial-editor.pages.dev),
`next` 의 브랜치 미리보기는 https://next.initial-editor.pages.dev 다. 프로덕션 주소는 `main`(291daa5, 2025-12-01)의 옛 에디터를 내고 있어
프로덕션 브랜치는 `main` 으로 본다. 그래서 `main` 을 빨리 감기 하기 전까지 데스크톱 앱의 "웹판 열기"(프로덕션 주소)는 옛 에디터를 연다.
README 의 "웹판 배포" 절에 이 값으로 표를 적었다. 프로덕션 응답에는 이미 Pages 기본값으로 `x-content-type-options: nosniff` 와
`.wasm` 의 `application/wasm` 이 붙어 있다 (`_headers` 는 그것을 못 박고 엔진 캐시를 더한다).

Pages 빌드는 엔진을 만들지 않는다 (emsdk 가 없다). 커밋한 `public/engine/` 사본을 싣는다. `wrangler.toml` 은 두지 않는다. 대시보드
설정과 둘이 되면 어느 쪽이 진실인지 헷갈린다. 저장소에 두는 것은 `_headers` 와 위 표다. CI 가 `wrangler pages dev` 를 쓰는 것은 로컬
검사용이고 설정 파일이 필요 없다.

### 7.3 `packages/app/public/_headers` (새)

```
/engine/*
  Cache-Control: no-cache
/engine/Initial2D.wasm
  Content-Type: application/wasm
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
```

- `engine/` 의 파일은 이름에 해시가 없어 매번 재검증한다 (MANIFEST 는 이미 `no-cache` 로 읽는다). Vite 의 `assets/` 는 해시 이름이라 오래 둔다.
- `application/wasm` 이 아니면 Emscripten 이 스트리밍 컴파일에 실패하고 ArrayBuffer 로 되돌아가며 `wasm streaming compile failed` 를
  printErr 로 찍는다. 그 줄이 에디터 콘솔에 오류 줄로 뜬다. Pages 는 확장자로 맞는 타입을 주지만, 한 줄로 못 박고 검사(7.5)에 넣는다.
- **교차 출처 격리(COOP `same-origin`, COEP `require-corp`)는 두지 않는다.** 엔진이 스레드(SharedArrayBuffer)를 쓰지 않아 필요 없고,
  켜면 교차 출처 자원을 막아 뒤탈만 생긴다. 엔진이 `-pthread` 로 가면 그때 둘을 켜고 `crossOriginIsolated` 를 검사에 넣는다.
- CSP 헤더는 이 단계에서 두지 않는다. 데스크톱의 정책(2.5)이 자가 검사로 굳은 뒤 같은 정책을 옮기는 것을 후보로 남긴다.
- `_headers` 는 Tauri 번들에도 들어가지만 쓰이지 않는다.
- 구현한 파일은 위 규칙 넷에 `#` 주석을 붙인 것이다. `npx wrangler@3 pages dev dist`(3.114.17)가 "Parsed 4 valid header rules" 로 읽고
  응답에 그대로 붙는 것을 봤다 (엔진의 `Cache-Control` 은 Pages 기본값을 바꾸고, 해시 이름의 스크립트는 `public, max-age=31536000, immutable`).
- 소스맵은 웹판에는 둔다 (오픈 소스이고 오류 추적에 쓴다). 데스크톱 번들에서는 뺀다 (`yarn build:desktop`). Tauri 는 프런트를 실행
  파일에 넣으므로 19 MB 가 그대로 커진다.

### 7.4 첫 화면

- 지금 그대로 시작 화면(폴더 열기, 최근 폴더, 샘플로 해 보기)에서 시작한다. 폴더 열기가 없는 브라우저는 메모리 샘플과 안내.
- 더하는 것 (`components/documents/WelcomeView.tsx`): 아래쪽에 "데스크톱 앱 받기"(릴리스 페이지)와 "웹판에서 안 되는 것" 한 줄
  (Ruby 실행, 안드로이드 스테이징). "샘플로 해 보기" 는 샘플 맵 문서(`meadow.json`)를 연 채로 뜨고 "타일을 칠하고 F5" 토스트를 한 번 띄운다.
- **샘플이 그 맵을 그린다.** 지금 샘플의 `main.lua`(`sampleProject.ts`)는 사각형을 칠할 뿐 `meadow.json` 을 읽지 않으므로, 맵을 칠하고 F5 를
  눌러도 칠한 맵이 보이지 않는다. 진입 파일을 고친다: `init` 에서 `Tilemap.Load("./resources/maps/meadow.json")`, `render` 에서
  `Tilemap.Draw(맵, 1, 레이어 수, 0, 0)`, 첫 프레임에 `sample:frame` 과 `sample:map layers=<n>` 을 찍는다. Ruby 진입 파일도 같은 일을 한다.
  `game-view.spec.ts` 의 메모리 모드 픽셀 검사(사각형 기준)는 맵 기준으로 고친다.
  구현: 카메라를 `(0, 0)` 이 아니라 맵이 **창 가운데**에 오는 음수 오프셋으로 준다 (768x896 창의 왼쪽 위 구석에 320x192 맵이 붙지 않게.
  엔진의 컬링이 음수 카메라를 받는다). 창 크기는 Lua `WindowWidth()`, Ruby `Graphics.width` 에서, 맵 크기는 `Tilemap.GetSize` 와 `map.width` 등에서.
  Ruby 는 레이어가 0 부터라 `map.draw(0, layer_count - 1, ...)`. 불러오지 못하면 `sample:map error ...` 를 찍는다. 게임 뷰 e2e 의 기준은
  맵의 픽셀 수(20x12x16x16, 타일에 배경색 픽셀이 없다)와 `sample:map layers=2` 줄이다. 네이티브 엔진 교차 검사
  `tests/e2e/support/sampleProject.unit.ts` 가 두 진입 파일을 헤드리스로 돌려 맵의 모든 칸이 타일셋 픽셀 그대로인지, 맵 파일의 한 칸을 모래로
  바꾸면 그 칸만 바뀌는지 본다 (엔진이 없으면 건너뛴다).
- 구현한 시작 화면: 웹판(브라우저 폴더 모드)에 "새 프로젝트" 단추(폴더 열기가 없으면 꺼지고 이유). 아래 줄은 웹판(브라우저 폴더와 메모리 모드)에만 있고
  "데스크톱 앱 받기"(https://github.com/biud436/InitialEditor/releases, 공개 릴리스가 생기기 전에는 비어 있다)와 "웹판에서 안 되는 것:
  엔진 프로세스 실행, 안드로이드 스테이징" 이다. Ruby 게임 실행은 웹 엔진 MANIFEST 에 mruby 가 없을 때만 붙는다. "샘플로 해 보기" 는
  샘플을 연 뒤 `meadow.json` 을 맵 뷰로 열고(맵 탭이 팔레트와 레이어 패널을 불러온다) 토스트 "샘플 게임이 그리는 맵이다. 팔레트에서
  타일을 골라 칠하고 저장한 뒤 F5 로 돌려 본다" 를 **페이지마다 한 번** 띄운다. 폴더 열기가 없어 메모리로 시작한 배포 웹판의 "샘플 프로젝트
  열기" 도 같다 (로컬의 `?backend=memory` 는 전과 같이 맵을 열지 않는다. 테스트들이 그 상태에 기댄다).
- 정보 창(`components/AboutDialog.tsx`): 판, 커밋, 웹 엔진 커밋, 데스크톱 앱이면 찾은 엔진(앱에 든 엔진이면 그 판), 제3자 고지. 웹판이면 "데스크톱 앱 받기", 데스크톱이면 "웹판 열기".
  구현: 판, 커밋(`__APP_COMMIT__`), 웹 엔진(MANIFEST 의 커밋 일곱 자리와 기능, 커밋 안 된 변경이면 그렇다고), 모드와 플랫폼,
  "웹판 열기"(https://initial-editor.biud436.com/) 또는 "데스크톱 앱 받기", "제3자 고지", 계획 문서, 엔진 API 대응표. 제3자 고지는 앱이
  놓인 곳의 `engine/THIRD-PARTY.md` 를 읽어 대화상자에 보인다 (웹판과 데스크톱이 같은 파일. `yarn sync:engine-web` 이 엔진 저장소 루트의
  고지를 웹 엔진 옆에 복사하고 MANIFEST 의 `files` 에는 넣지 않는다). 에디터 쪽 고지는 저장소의 `src-tauri/licenses` 링크다.
  계획 문서 링크는 옛 `blob/master`(2021년 브랜치라 파일이 없다)에서 `blob/next` 로 고쳤다. 엔진 판(`engine.json`) 줄은 2.3 의 몫이다.
- **링크 열기**: 데스크톱의 모든 바깥 링크(정보 창, 시작 화면, 업데이트 토스트)는 `tauri-plugin-opener` 의 `openUrl` 을 거친다. 권한은
  `opener:allow-open-url` 을 `https://github.com/biud436/*` 와 웹판 주소로 좁힌다 (구현: `capabilities/default.json` 에
  `https://github.com/biud436/*` 와 `https://initial-editor.biud436.com/*`. `opener:default` 는 넣지 않는다. `src-tauri/tests/capabilities.rs`
  가 fs, shell 권한이 없고 opener 는 이 둘뿐인지 본다). 브라우저에서는 `window.open`. 지금의
  `<a target="_blank">` 는 Tauri 웹뷰에서 아무 일도 하지 않는다. 링크 하나를 여는 함수(`openExternal`)를 두고 단위 시험으로 두 모드를 본다.
  구현(`editor/openExternal.ts`, `components/ExternalLink.tsx`): npm 패키지 `@tauri-apps/plugin-opener` 를 더하지 않고 그 `openUrl` 이 부르는
  명령 `plugin:opener|open_url` 을 `@tauri-apps/api` 의 `invoke` 로 직접 부른다 (같은 호출이고 의존성과 잠금 파일이 늘지 않는다).
  http 와 https 만 연다. 열지 못하면(권한 밖 주소 등) 콘솔 한 줄과 토스트. 도움말의 링크 명령, 정보 창, 시작 화면의 링크가 모두 여기를 거친다.
  업데이트 토스트는 이 단계에서 없다 (결정 기록).

### 7.5 검사

- `scripts/check-web-dist.mjs` (CI `web` 잡, `yarn build` 뒤): `dist/index.html`, `dist/_headers`, `dist/engine/` 의 파일 셋의 sha256 이
  MANIFEST 와 같다, `dist/engine/THIRD-PARTY.md` 가 있다, 25 MiB 넘는 파일이 없다, 파일 수가 20,000 아래다 (Pages 한도).
- `tests/e2e/pages.spec.ts` (`PAGES_URL` 이 있을 때만): `engine/Initial2D.wasm` 응답의 content-type 이 `application/wasm`, "샘플로 해 보기" 뒤
  F5 로 게임 탭이 돌고 `sample:frame` 줄이 콘솔에 온다, 맵 문서에서 한 칸을 칠하고 저장한 뒤 F5 로 다시 돌리면 게임 탭 캡처
  (`gameView.capture()` 의 칸별 밝기)가 그 칸에서 칠하기 전과 다르다, 콘솔에 `wasm streaming compile failed` 가 없다.
- **CI 에서 헤더까지**: `web` 잡이 `yarn build` 뒤 `npx wrangler@3 pages dev dist --port 8788` 을 띄우고(이 명령은 `_headers` 를 적용한다)
  `PAGES_URL=http://127.0.0.1:8788` 로 `pages.spec.ts` 를 돌린다. 헤더 실수가 배포 전에 드러난다.
- 배포 주소와 `next` 미리보기 주소에 대한 같은 검사는 저자가 누르는 `workflow_dispatch` 워크플로우 `.github/workflows/pages-smoke.yml`
  (입력: 주소)로 덧붙인다. 완료 기준은 CI 의 로컬 Pages 검사다.

구현 (2026-09-27):

- `scripts/check-web-dist.mjs [--dist <폴더>] [--desktop]`: 위 목록에 더해 `index.html` 이 부르는 `/assets/` 파일이 있는지, `_headers` 의 문법
  (규칙 줄, 들여 쓴 `이름: 값`, 헤더 없는 규칙), 모든 `.wasm` 의 타입 규칙, 엔진 파일 넷(`MANIFEST.json` 과 로더 셋)이 `no-cache` 이고
  `immutable` 이 아닌지, 해시 이름의 `assets/` 가 `immutable` 인지, `nosniff` 와 교차 출처 격리 헤더가 없는지를 Pages 와 같은 규칙 맞추기
  (`*` 와 `:이름`, 맞는 규칙을 모두 모은다)로 본다. `--desktop` 은 소스맵이 있으면 실패한다 (`yarn build:desktop` 의 산출물용). 문제는
  `FAIL ...` 줄과 종료 코드 1. 검사 시험은 `tests/e2e/support/checkWebDist.unit.ts`(임시 dist 를 한 가지씩 망가뜨린다).
- `tests/e2e/pages.spec.ts`: 헤더 검사는 `PAGES_URL`(띄워 둔 Pages) 또는 `PAGES_WRANGLER=1`(스펙이 `npx wrangler@3 pages dev dist` 를
  `PAGES_PORT`, 기본 8788 로 띄우고 끝나면 프로세스 묶음째 끈다)이 있을 때 돈다. 없거나 wrangler 를 받지 못하면 까닭을 적고 건너뛴다.
  흐름 검사(샘플, F5, 한 칸 칠해 저장, F5, 캡처 격자의 그 칸만 다르다, 스트리밍 실패 줄 없음)와 정보 창 검사는 헤더와 무관해서
  Pages 서버가 없으면 Playwright 가 띄운 `vite preview` 로 돈다. 칠한 칸(4, 5)을 모래(gid 5)로 바꾸면 그 격자 칸의 밝기가 7 달라지고
  나머지 칸은 0 이다 (문턱 3 과 1).
- CI 의 `web` 잡에 `check-web-dist` 와 wrangler 단계를 넣는 것은 CI 작업의 몫이다.

## 8. 서명

| 플랫폼 | 첫 판 | 사용자가 보는 것 | 서명하려면 |
|---|---|---|---|
| macOS | ad-hoc (`signingIdentity: "-"`), 공증 없음 | 첫 열기에서 "확인되지 않은 개발자" 로 막힌다. 시스템 설정 > 개인정보 보호 및 보안 > "그래도 열기" (macOS 15 부터 Control 클릭 열기 우회가 없다). 또는 `xattr -dr com.apple.quarantine /Applications/InitialEditor.app` | Apple Developer Program (연 99달러), Developer ID Application 인증서, CI 비밀 `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`(앱 암호), `APPLE_TEAM_ID`. Tauri 가 사이드카까지 서명하고 공증한다. 엔진은 JIT 가 없어 추가 권한이 필요 없다 |
| Windows | 서명 없음 | SmartScreen "Windows 의 PC 보호" > 추가 정보 > 실행. 설치 파일과 앱 둘 다 | OV 또는 EV 인증서, 또는 Azure Trusted Signing (`bundle.windows.signCommand`) |
| Linux | 없음 | AppImage 는 실행 권한(`chmod +x`)과 FUSE 2(`libfuse2`). deb 는 `sudo apt install ./InitialEditor_*.deb` | 필요 없다. 릴리스의 `SHA256SUMS.txt` 로 확인 |

- ad-hoc 서명은 Apple Silicon 에서 실행하는 데 필요한 최소 서명이다. 격리 속성이 붙은 채(다운로드한 dmg)로는 Gatekeeper 가 막는다.
- 앱을 `/Applications` 로 옮기지 않고 dmg 에서 바로 열면 App Translocation 으로 임시 경로에서 돈다. 사이드카가 같은 폴더에 있으므로
  찾는 규칙(2.2 의 `current_exe` 의 부모)은 그대로 맞다.
- README 의 "설치" 절과 릴리스 본문 맨 위에 세 OS 의 첫 열기 방법을 적는다.
- 안드로이드 서명은 엔진 저장소의 기존 방식(`keystore.properties`) 그대로이고 이 단계와 무관하다.

## 9. 판과 업데이트

- **판 번호**: SemVer. 에디터의 첫 공개는 `v2.0.0-alpha.1`(옛 1.x 다음). 알파 동안 E5 가 들어가고, E5 뒤의 첫 릴리스가 베타 후보다.
- **판의 원천은 루트 `package.json` 하나.** `tauri.conf.json` 의 `version` 은 `"../package.json"` 이다 (Tauri 2 는 판 대신 package.json 경로를
  받는다). 그래서 `tauri.conf.json` 은 판이 바뀔 때 고칠 곳이 아니다. `scripts/version.mjs` 가 `set <판>` 으로 루트와 `packages/*/package.json`,
  `src-tauri/Cargo.toml`(과 `Cargo.lock` 의 자기 항목)을 한꺼번에 고치고, `check [--tag v<판>]` 이 하나라도 어긋나거나 `tauri.conf.json` 의
  `version` 이 그 경로가 아니면 실패한다. 릴리스의 `bundle` 잡은 만든 번들 이름에 든 판도 태그와 대조한다. 명령은 `yarn version:set`, `yarn version:check`.
  구현 (2026-09-27): `set` 은 워크스페이스끼리의 의존(`@initial-editor/*` 에 판을 그대로 적은 것. `workspace:` 는 그대로 둔다)도 고치고
  끝에 `yarn install` 로 잠금 파일을 맞춘다 (`--no-install` 로 건너뛴다). `check --bundles <폴더>` 는 폴더 아래의 dmg, AppImage, deb, exe, msi
  이름에 `_<판>_` 이 있는지 본다 (`.app` 폴더 안은 보지 않는다). 지금 판은 `2.0.0-dev` 이고 `Cargo.toml` 이 `2.0.0` 이던 것을 이 명령으로 맞췄다.
  NSIS 가 프리릴리스 판 문자열을 받는지는 첫 CI 실행이 본다.
- **빌드 도장**: `__APP_COMMIT__`(Vite define). `GITHUB_SHA` > `CF_PAGES_COMMIT_SHA` > `git rev-parse --short HEAD` > "dev".
- **엔진 판과의 짝**: 한 에디터 판은 한 엔진 릴리스에 묶인다 (`engine-pin.json`). 릴리스의 `check` 잡이 동봉 엔진, 웹 엔진, 템플릿, 그리고
  저장소 안의 엔진에서 온 다른 사본(E5 의 ext-rpg 픽스처)이 같은 엔진 커밋에서 왔는지 대조한다 (4.1 절). 동봉 엔진의 `--version` 커밋은
  `check-sidecar.mjs` 가 번들 안 파일에서 본다.
- **프로젝트 쪽 짝**: 프로젝트는 만들 때의 씬 로더 사본을 가진다. 엔진 C++ API 가 그대로면 새 엔진에서도 돈다. 앱의 템플릿과 프로젝트의
  `common` 그룹 파일이 다르면 알리고 갱신하는 명령은 후보로 남긴다 (이 문서 끝).
- **업데이트 확인** (결정 기록: 이 단계에서 만들지 않는다. 아래는 나중을 위한 설계로 남긴다): 첫 판은 자동 업데이트가 없다. 도움말 > "업데이트 확인" 이 GitHub API(`repos/biud436/InitialEditor/releases`)에서 최신 태그를
  읽어, 지금 판보다 새로우면 릴리스 페이지 링크를 토스트로 준다 (링크는 7.4 의 `openExternal`). 시작할 때의 자동 확인은 설정 `checkUpdates`
  (기본 꺼짐), 프리릴리스를 볼지는 설정 `updateChannel`(`stable`, `prerelease`). 코드는 `packages/app/src/editor/update/`: 판 비교는 순수 함수
  (`2.0.0-alpha.2 > 2.0.0-alpha.1`, `2.0.0 > 2.0.0-rc.1`, 채널 거르기, 초안 무시)이고 API 응답은 주입한 `fetch` 로 받는다. 단위 시험이
  둘을 다 본다 (가짜 응답: 새 판 있음, 없음, 프리릴리스만 있음, 네트워크 실패).
- **자동 업데이트**(`tauri-plugin-updater`, `latest.json`)는 서명 결정 뒤다. 업데이트 서명 키(minisign)는 OS 서명과 별개라 지금도 되지만,
  서명 안 된 macOS 앱이 스스로를 바꾸는 흐름은 Gatekeeper 와 얽혀 실기 확인이 먼저다.
- **`identifier` 는 고정한다.** 바꾸면 설정 폴더와 웹뷰 저장소(localStorage, IndexedDB 의 기억한 폴더)가 새로 시작된다.

## 작업 항목

### 마일스톤 1: 번들 설정과 세 OS 빌드 (에디터)

- [x] `src-tauri/tauri.conf.json` 번들 칸 (게시자, 저작권, 설명, 홈페이지, macOS 최소 11.0 과 ad-hoc 서명, NSIS 사용자 설치와 언어, WebView2 설치 방식), `version` 을 `"../package.json"` 으로. 라이선스 칸은 `MIT` 하나 (2026-09-27 저자 위임 뒤, 결정 기록. `licenseFile` 은 dmg 에 SLA 를 붙여 CI 의 `hdiutil attach` 를 막아 뺐다)
- [x] `src-tauri/licenses/` (`THIRD-PARTY-editor.md` 커밋, `engine/` 은 gitignore), `scripts/gen-licenses.mjs` 와 `--check` (`yarn licenses`. npm 은 앱의 런타임 의존, Cargo 는 `cargo metadata` 의 일반 의존으로 모든 OS 의 합, 고를 수 있으면 MIT 원문, 같은 원문은 한 번. 시험 `tests/scripts/licenses.unit.ts`). 루트 `LICENSE`(MIT)를 더했다 (2026-09-27 저자 위임 뒤, 결정 기록)
- [x] `yarn build:desktop` (`VITE_SOURCEMAP=0`, `vite.config.ts` 가 읽는다. `emptyOutDir` 는 이미 한 번뿐이다), `src-tauri/tauri.dist.conf.json` (`beforeBuildCommand` 와 `licenses/` 리소스)
- [x] `scripts/version.mjs` (`yarn version:set`, `yarn version:check`: package.json 일곱과 워크스페이스끼리의 의존, `Cargo.toml`, `Cargo.lock`, `tauri.conf.json` 의 경로 칸, `--tag`, `--bundles`) 와 `ci.yml` 의 대조. 시험 `tests/scripts/version.unit.ts` (이 저장소 자신이 맞는지도)
- [x] `ci.yml` 의 `rust` 잡을 세 OS 로 (워크플로는 됐다. Windows 에서 크레이트가 빌드되고 안드로이드의 Windows 시험이 도는지는 첫 CI 실행이 본다). Windows 전용 시험 (엔진 후보의 역슬래시 경로는 Vitest, 동봉 실행 파일 이름). 2026-09-28 확인: PR #52 부터 매 PR 에서 `cargo test` 가 macOS, Ubuntu, Windows 셋 다 통과한다. 역슬래시 경로와 `.exe` 는 `RunnerStore.test.ts` 의 "Windows 는 역슬래시와 .exe", 동봉 실행 파일 이름은 `bundled.rs` 의 `Initial2D.exe`
- [x] `release.yml` 의 `bundle` 잡을 `dry_run` 으로 세 OS 에서 돌려 dmg, AppImage, deb, NSIS 가 나온다 (2026-09-28, PR #57 의 `release.yml` 실행 36371725594: 산출물 `bundle-aarch64-apple-darwin`(dmg), `bundle-x86_64-unknown-linux-gnu`(AppImage 와 deb), `bundle-x86_64-pc-windows-msvc`(NSIS), 모은 `InitialEditor-<커밋>` 과 `SHA256SUMS.txt`. 프리릴리스 판 문자열은 첫 태그의 실행이 본다). NSIS 가 프리릴리스 판 문자열을 받는지 여기서 확인한다 (워크플로는 됐다. 사이드카는 핀의 커밋에서 빌드해 싣는다. 이 맥에서는 사이드카를 실은 `.app` 과 dmg 가 나왔다. 세 OS 는 첫 CI 실행)
- [x] Linux 와 Windows 에서 앱이 뜨는 것까지 확인 (자가 검사 전체를 구현했고 CI 에서 돈다. 첫 CI 실행). 2026-09-28, PR #57 의 `release.yml` 실행 36371725594: Linux 의 AppImage(xvfb, 보이는 창) 88 PASS / 0 FAIL(경고 하나는 선택 실행인 에디터 안 플래피), Windows 의 무인 설치본 12 PASS / 0 FAIL (엔진을 못 찾아 에디터 안으로 넘어가 플래피가 돈다)

### 마일스톤 2: 엔진 R4, 배포용 엔진 빌드와 템플릿 묶음 (엔진 저장소)

정본은 엔진의 `docs/plans/r4-dist-build.md` 이고 엔진 master 에 들어갔다 (엔진 PR #52, 핀 `cac4b94`). 아래는 그 문서의 체크리스트를 옮긴 것이다.

- [x] `tools/sdl_versions.sh`, `tools/fetch_sdl_src.sh`, `android/download_sdl.sh` 가 같은 판 번호를 읽는다
- [x] `CMakeLists.txt` 의 `INITIAL2D_VENDORED_SDL` 과 3.1 표의 캐시 값 전부 (정적, ImageIO 끔, 의존 공유 끔, 포맷 스위치, Linux 의 dlopen 기본값 유지), `MRUBY_ROOT` 힌트, 배포 대상 11.0, 판 생성 헤더
- [x] `tools/build_mruby.sh` (`MACOSX_DEPLOYMENT_TARGET=11.0`, `mruby-config --cflags` 의 정의를 엔진이 그대로)
- [x] `sdl2Main.cpp` 의 `--version` 과 모르는 `--` 인자의 종료 코드 2
- [x] `tools/build_dist.sh`, `tools/check_dist.sh` (시간 제한과 임시 작업 폴더, `minos` 11.0, `--bogus` 가 2)
- [x] `THIRD-PARTY.md`
- [x] 타일맵 템플릿 `resources/templates/tilemap/` (결정 기록대로 새로 그리지 않고 커밋된 `resources/tiles/tileset16-8x13.png` 를 쓴다. 표식 칸은 타일 44, gid 45, `#d8c880`. `mapfile.py` 형식의 맵, 씬, 스키마)와 `tests/tools/templates_test.py`
- [x] `tools/templates_list.txt`, `tools/pack_templates.py` (`generated` 표시, 빠진 파일이면 실패)
- [x] macOS: 배포용 실행 파일로 전체 씬 검수 통과 (`python3 tests/run_engine_tests.py dist/Initial2D-aarch64-apple-darwin`, 575 PASS)
- [x] Linux: 배포용 실행 파일로 플래피 씬 셋 (`dist.yml` 의 첫 CI 실행. 엔진 PR #53, #55 의 실행에서 통과, 엔진 R4 문서)
- [x] `.github/workflows/dist.yml` (native 둘, templates, collect. 결정 기록대로 산출물만 올리고 릴리스는 없다)
- [x] `dist.yml` 의 첫 CI 실행 (macOS 와 Linux. 엔진 저장소에서 `workflow_dispatch`). 엔진 PR #53(36281586493)과 #55(36297974450)에서 네 잡이 모두 통과했다
- [ ] 첫 태그 `v2.0.0-alpha.1` (결정 기록: 저자)
- [x] 기존 `tests.yml` 과 전체 검수가 무변경으로 통과한다 (Homebrew 빌드 경로는 그대로)
- [x] 엔진 문서 `docs/plans/r4-dist-build.md`, index 의 R4 행, README 의 "배포용 빌드"

### 마일스톤 3: 사이드카 동봉, 찾기와 신뢰, 템플릿 (에디터)

- [x] `engine-pin.json` (엔진 `cac4b94`, `ciEngineRef` 칸 포함, 릴리스 전이라 자산 칸 없음), `scripts/fetch-engine.mjs` (`yarn engine:fetch [--target <트리플>] [--from <엔진 dist 폴더>] [--templates <폴더>] [--any-commit]`, 공개 자산 주소, sha256 확인, `src-tauri/licenses/engine/THIRD-PARTY.md`). 시험 `runner/engineScripts.test.ts`
- [x] `yarn engine:pin <태그>` (네이티브 핀, 웹 엔진과 고지, 템플릿을 같은 릴리스로. 체크아웃에서 오는 MANIFEST 는 커밋 확인 뒤 다시 동기화). 태그가 생긴 뒤. 2026-09-28: `scripts/pin-engine.mjs` 가 릴리스(또는 `--from` 폴더)의 `engine-dist.json` 과 `SHA256SUMS.txt` 로 `engineTag`, `native`, `templates`, `thirdParty` 를 적는다. 릴리스의 커밋이 핀과 다르면 쓰지 않는다 (MANIFEST 는 핀의 커밋에서 온 것이라 먼저 다시 동기화한다). 엔진 릴리스에 웹 엔진 zip 은 없어 `web` 칸은 비운다 (웹 엔진은 핀의 커밋에서 빌드해 동기화한 사본). 핀은 엔진 `v2.0.0-alpha.1`(`f04eba2`)이고 `yarn engine:fetch` 가 릴리스에서 받아 sha256 을 확인했다. 시험 `engineScripts.test.ts` 의 "yarn engine:pin" 넷
- [x] `scripts/check-engine-pin.mjs` (`yarn engine:check`): 핀, `ciEngineRef`, 엔진에서 온 MANIFEST 전부의 커밋 40자와 `source` 와 `syncCommand`, 받아 둔 `engine.json`, 핀에 `web` 이 있으면 릴리스 zip 대조. `next` 를 합친 뒤 ext-rpg 픽스처를 핀의 커밋에서 다시 동기화했다 (1절 끝)
- [x] 엔진에서 온 MANIFEST 모두에 `source` 와 `syncCommand`, 커밋은 40자. 웹 엔진은 `sync-engine-web.mjs` 가 두 칸을 쓰고, 핀의 커밋 `cac4b94` 에서 다시 빌드해 가져왔다 (4.2 절 끝). `yarn engine:check` 가 전부 통과한다
- [x] `sync-engine-templates.mjs --from-zip`(zip 이나 dist 폴더), 템플릿 MANIFEST 의 `source`, `syncCommand`, 커밋 40자, `generated` 표시 (로컬 체크아웃에서 복사할 때는 `git ls-files` 로 정한다), `--allow-dirty`. 시험 `scene/syncTemplates.test.ts` (가짜 체크아웃과 가짜 묶음, 엔진이 있으면 `pack_templates.py` 의 진짜 묶음이 체크아웃과 같다)
- [x] `templates.test.ts`: 체크아웃 대조에서 `generated` 만 건너뛰고, `INITIAL2D_TEMPLATES_SRC` 가 있으면 빠짐없이 대조 (생성물 표시도). 엔진의 `tools/templates_list.txt` 와 복사 목록이 같은지도 본다
- [x] 타일맵 템플릿: `sync-engine-templates.mjs` 의 목록(그룹 `tilemap`, 진입 파일 둘은 `empty`, `flappy`, `tilemap`), `ProjectTemplateId` 와 `TEMPLATE_LABELS`("타일맵"), `TEMPLATE_START_SCENE`(`main`), 새 프로젝트 대화상자 (템플릿 설명 `TEMPLATE_HELP`, `NewProjectDialog.test.tsx`)
- [x] `scripts/e2e-engine-scene.mjs`: `INITIAL2D_EXE` 를 받고(주었는데 없으면 실패), 새 프로젝트를 앱의 `writeProjectTemplate` 으로 쓰고(Vite SSR), 타일맵 템플릿(Lua, Ruby)은 맵 문서(`MapDocument`)에서 칸 (24, 28) 을 gid 45 로 칠해 저장한 뒤 시작 씬으로 돌려 스크린샷의 그 칸이 표식 색이고 옆 칸이 잔디인지 본다 (`tests/e2e/support/bmp.ts`). 2026-09-27 이 맥: Homebrew 빌드와 배포용 빌드(`tools/build_dist.sh`, 엔진 `cac4b94`) 모두 42 PASS / 0 FAIL
- [x] `src-tauri/tauri.sidecar.conf.json`, `.gitignore` 에 `src-tauri/binaries/` 와 `src-tauri/licenses/engine/`
- [x] `src-tauri/src/bundled.rs` 와 명령 `engine_bundled`, `cargo test` (파일이 있을 때와 없을 때, `engine.json` 이 깨졌을 때와 모양이 틀렸을 때)
- [x] `engine.rs`: `features(exe, timeout)` 와 임시 작업 폴더와 dummy 드라이버, `engine_features(exe, timeout_ms)`, `engine_exists(paths)`. `cargo test` (늦게 답하는 스크립트가 기본 시간에는 실패하고 15초에는 통과, 작업 폴더에 파일을 쓰는 스크립트가 프로젝트에 쓰지 못한다, `exists` 는 실행하지 않는다)
- [x] 백엔드 `engineFeatures(exe, { timeoutMs })`, `engineExists(paths)`, `engineBundled()`, `RunnerOptions.probe(exe, opts)`. 시험 `backend-tauri/src/engine.test.ts`
- [x] `engineCandidates.ts` 에 `bundled` (2.3 의 순서)와 후보마다 `needsTrust`, `ENGINE_SOURCE_LABELS`, 단위 시험 (세 OS 경로, AppImage)
- [x] 신뢰 규칙: 설정 `engineTrust`(`{ allow, exes }`), 확인 대화상자 `runner/EngineTrustDialog.tsx`(실행 파일 경로와 출처를 보인다), 설정 대화상자의 "찾은 엔진" 줄과 "신뢰 취소", "다시 묻기". 단위 시험 `RunnerStore.trust.test.ts`, `engineTrust.test.ts`, `EngineTrustDialog.test.tsx`, `SettingsDialog.test.tsx`: 신뢰하지 않은 프로젝트를 열면 프로젝트 안과 형제 경로를 `probe` 하지 않는다, 허용 뒤 순서대로, 거절 기억, 경로가 바뀌면 다시 묻기, 답 없이 닫으면 기억하지 않기, 겹친 탐색에 질문 한 번. 검증 뒤 더한 것 (2.3): 무리마다 묻기(앱에 든 엔진이 답하면 형제는 묻지 않는다), 겹친 탐색이 결정을 나눠 쓰고 기록은 파일을 본 뒤 읽기, 탐색 중의 실행은 그 탐색을 기다리기, 번들 안 경로를 가리키는 `.initial-editor/engine` 은 앱에 든 엔진
- [x] `RunnerStore`: `StartOptions.mode`, 동봉 후보의 시간 제한 15초와 재시도, 다 못 찾으면 에디터 안으로 넘어가기와 한 줄 알림 (mruby 프로젝트는 이유), 넘어간 사실을 실행 정보에(`fallback`). 단위 시험
- [x] 상태 바 툴팁, 설정 대화상자의 "찾은 엔진" 줄 (`engine.json` 에서, `RunnerStore.engineDescription`)
- [x] 정보 창의 엔진 판: 데스크톱 앱이면 "엔진" 줄에 찾은 엔진 (`RunnerStore.engineDescription`, 앱에 든 엔진이면 `bundledEngineLabel` 의 판). 설정의 "찾은 엔진" 과 같은 글 (`about.ts` 의 `foundEngineText`). 시험 `AboutDialog.test.tsx`, `about.test.ts`
- [x] 새 프로젝트의 `.gitignore` 에 `config.setting` (`scene/projectTemplates.ts` 의 `GITIGNORE_TEXT`)
- [x] `scripts/check-sidecar.mjs` (번들 안 사이드카의 동적 의존 허용 목록, `--features`, `--version` 커밋이 핀과 같다, `--bogus` 가 2, 작업 폴더에 쓰지 않는다. 실행은 시간 제한과 버리는 작업 폴더에서. `.app` 이나 폴더도 받는다). 2026-09-27 이 맥: 받은 사이드카와 빌드한 `.app` 모두 통과. 검증 뒤: 받은 사이드카 옆의 `engine.json` 도 찾고, 없으면 찾아본 곳과 함께 실패한다 (`--no-engine-json` 으로 뺀다고 밝힌다, 2.4)
- [x] 숨은 창 검수: 사이드카 덮어쓰기로 빌드한 앱이 동봉 엔진을 찾고 `--features` 로 찌른다 (2.4 절의 기록)
- [x] `ci.yml` 의 엔진 체크아웃을 핀의 커밋으로 (`ciEngineRef` 우선, 핀이 없으면 기본 브랜치). `release.yml` 도 같다

### 마일스톤 4: 자가 검사, 보안 정책, 릴리스 (에디터)

- [x] 셸: `setup` 의 계획 읽기(환경 변수 경로만), `workDir` 과 프로젝트 폴더 만들기(있으면 계획 오류), 전체 시간 감시 스레드, 명령 `selftest_plan`, `selftest_progress`, `selftest_write_log`(`logs/` 안 단순 이름만, base64), `selftest_finish(reportJson, code)`(계획의 `report` 에 쓴다). `cargo test` 8건 (폴더가 있으면 오류이고 지우지 않는다, 감시가 마지막 단계를 담은 보고서를 쓴다, 끝낸 뒤에는 감시가 덮어쓰지 않는다, 로그 이름의 경로 탈출 거부)
- [x] `lib.rs`: 창 `main` 을 `create: false` 뒤 셸이 만들기, 자가 검사면 `showWindow` 대로 보임과 `window-state` 빼기, 저장소를 남기지 않는 웹뷰, 숨은 웹뷰의 타이머 멈춤 끄기
- [x] 앱 격리: 자가 검사면 `MemorySettingsStorage`, 메모리 레이아웃, 모달이 뜨면 실패. 단위 시험 (`selftest/csp.test.ts`: 평소 설정 저장소를 만들지도 읽지도 쓰지도 않는다, 최근 프로젝트는 메모리에만. `runSelftest.test.ts`: 모달은 적고 닫고 실패)
- [x] 앱: `packages/app/src/editor/selftest/` (대화상자 없는 새 프로젝트, 열기, 진입 스크립트 열기, `edit` 을 맵 문서의 명령과 저장으로, 실행 목록과 `mode` 넘기기, 시간 제한, 실행별 전체 로그, 보고서, `securitypolicyviolation` 수집, 맵 뷰의 타일 뽑기). 단위 시험은 가짜 백엔드와 가짜 러너로 (`runSelftest.test.ts` 15건, `plan.test.ts`), 뽑기는 브라우저 e2e `map-capture.spec.ts`
- [x] CSP (2.5): `tauri.conf.json` 의 `csp` 와 `devCsp`, `dangerousDisableAssetCspModification: ["style-src"]`, `pixi.js/unsafe-eval` 들여오기. 로컬 숨은 창 자가 검사의 위반(`connect-src data`)을 고쳤다
- [x] 첫 CI 실행(보이는 창, 에디터 안 실행, WebKitGTK, WebView2)의 위반 목록으로 정책을 고치고 2.5 절에 적는다. 2026-09-28, PR #57 의 `release.yml` 실행 36371725594: 세 OS(WKWebView, WebKitGTK, WebView2) 모두 "웹뷰 보안 정책 위반 없음" 이라 고칠 것이 없었다
- [x] `scripts/selftest-plan.mjs` (macOS, Linux, Windows, 로컬, `--embedded`, `--forest`), `scripts/selftest-check.mjs` (`--plan`, `--report`, 전체 로그와 BMP 를 읽는다, 보고서가 없으면 1), `scripts/lib/flappyChecks.mjs` 와 `scripts/lib/frameChecks.mjs` (`e2e-engine-scene.mjs` 와 공용. BMP 는 `scripts/lib/bmp.mjs` 대신 `tests/e2e/support/bmp.ts` 를 Vite SSR 로). 판정 스크립트의 단위 시험 `tests/scripts/selftest.unit.ts` (초반 줄이 로그에만 있는 경우 통과, 로그가 없으면 실패, 넘어감 기대가 어긋나면 실패, 숲의 픽셀 견주기)
- [x] `release.yml` 의 자가 검사 단계 (macOS 는 dmg 안의 앱, Linux 는 xvfb 와 AppImage, Windows 는 무인 설치본), `timeout-minutes`, `if: always()` 판정, 자가 검사 폴더를 산출물로 (actionlint 통과, 첫 CI 실행 전)
- [x] `release.yml` 의 `check` 잡 (판, 고지, `check-engine-pin.mjs`, 템플릿 묶음에 대한 `templates.test.ts`. 생성물 PNG 는 픽셀로 견준다, 4.1)과 `collect` 잡(`SHA256SUMS.txt`)과 `release` 잡 (태그를 민 실행만, 초안, 프리릴리스 판정), `docs/releases/first-open.md` (본문 머리의 처음 열기)
- [x] 로컬에서 같은 검사: `yarn selftest:app <빌드한 앱 경로> [--embedded] [--forest <엔진 저장소>]` (저자가 CI 없이 돌린다. 기본은 창이 뜨지 않는다). 2026-09-27 이 맥: 33 PASS, `--forest` 46 PASS. 숲이 칠한 칸과 레이어마다의 기준 대조를 더한 뒤 `--forest` 55 PASS (5절)
- [x] 항구 마을 (E5 완료 기준 첫째와 셋째, 2026-09-28): `--rpg <엔진 저장소>`, 계획의 `probe`(확장의 탐침, `ext-tilemap` 의 `MapSelftestProbe`)와 실행의 `play`(확장의 실행 요청을 앱의 맵 실행 길로), 판정의 `eventFront` 와 `eventProbe`. 이 맥의 릴리스 `.app` 59 PASS, 음성 대조(선 자리를 한 칸 옮긴 감싸개 엔진) 3 FAIL. 설계와 결과는 e5 문서의 구현 노트 "설치본 자가 검사의 항구 마을"
- [x] E3 완료 기준 1 (Tauri 창의 숲이 게임과 같다): 자가 검사의 숲 단계가 CI 의 보이는 창에서 통과하면 E3 문서에 체크한다. 2026-09-28, PR #57 의 `release.yml` 실행 36371725594: 맵 뷰의 타일 픽셀이 게임 화면과 macOS 99.88%, Linux 99.95% 같고 레이어마다와 칠한 칸의 검사도 통과했다 (E3 문서는 이미 체크되어 있다) (이 맥의 숨은 창에서는 통과. 2026-09-27 부터 숲 단계는 deco 의 한 칸을 칠해 저장하고, 판정이 저장한 맵으로 그린 기준과 레이어마다, 칠한 칸까지 견준다. 5절)
- [ ] 첫 초안 릴리스 `v2.0.0-alpha.1` (결정 기록: 태그는 저자가 민다. 워크플로는 태그를 받으면 초안을 만들게 되어 있다)

### 마일스톤 5: 안드로이드 스테이징 (엔진 짝과 에디터)

- [x] 엔진: `tools/stage_rules.json`(안드로이드 전용, `shared` 표시, 규칙마다 예시), `tools/stage_list.py`. `tools/web_stage.py` 는 무수정
- [x] 엔진: `prepare_assets.sh` 의 `--project`, `--with-rtp`, `--dry-run`, `--dest`, `python3` 확인, 스탬프, 경고 줄, `STAGED` 줄, `config.setting` 빼기. 인자 없는 실행은 지금과 같다 (결정 기록)
- [x] 엔진: `tests/tools/prepare_assets_test.sh` 를 `tests/run_all.sh` 에, `android/README.md` 와 루트 README 사용법 (`--with-rtp` 포함). 엔진 브랜치 `feat/android-stage-project`
- [x] 에디터: `stage_rules.json` 의 `shared` 줄이 `gameView/staging.ts` 에 있는지 보는 시험 (엔진 저장소가 있을 때, 없으면 건너뛴다)
- [x] 에디터: `android_stage` 와 `android_repo_probe` 명령과 시험. `process.rs` 떼기 대신 엔진의 `EngineState` 를 그대로 쓴다 (6.3, 엔진 시험 무변경)
- [x] 에디터: `packages/app/src/editor/android/` (저장소 찾기와 신뢰, `AndroidStageStore`, 명령 `android.stage`, 확인 대화상자, 콘솔 source `android`, 토스트), Windows 의 bash 와 `python3` 찾기(셸), 설정 `engineRepoPath` 와 `androidTrust`
- [x] 교차 검사 `yarn test:android-stage` (`scripts/e2e-android-stage.mjs`)
- [ ] 실기 (선택): 저자가 APK 로 플래피

### 마일스톤 6: 웹판과 링크 (에디터)

- [x] `packages/app/public/_headers`, `scripts/check-web-dist.mjs` (CI 단계로 넣는 것은 아래 CI 항목)
- [x] CI `web` 잡의 `check-web-dist` 와 `wrangler pages dev dist`, 그 주소에 대한 `tests/e2e/pages.spec.ts` (`PAGES_WRANGLER=1`. 러너에서 wrangler 를 받는지는 첫 CI 실행이 본다)
- [x] 샘플 진입 파일(Lua, Ruby)이 `meadow.json` 을 그린다. `game-view.spec.ts` 메모리 모드 검사를 맵 기준으로. `pages.spec.ts` 의 칠하기, 저장, F5, 그 칸의 캡처 차이. 네이티브 교차 검사 `sampleProject.unit.ts`
- [x] 새 프로젝트를 켜는 조건(`newProjectBlocker`: 웹판은 폴더 열기가 있는 브라우저면 샘플 뒤에도), 웹판 대화상자의 Ruby 안내(웹 엔진에 mruby 가 없을 때). `web-folder.spec.ts` 에 새 플래피 프로젝트를 만들어 F5 로 도는 경우와 취소, 비어 있지 않은 폴더
- [x] `tauri-plugin-opener` 와 좁은 권한 (셸 쪽은 됨: 플러그인, `opener:allow-open-url` 에 GitHub 와 웹판 주소, `tests/capabilities.rs`), `openExternal` 과 그 단위 시험, 정보 창과 시작 화면과 도움말의 모든 바깥 링크를 그리로
- [x] `__APP_COMMIT__` 과 정보 창 (판, 커밋, 웹 엔진 커밋, 제3자 고지, 데스크톱 앱 받기 또는 웹판 열기)
- [x] 시작 화면: 새 프로젝트, 데스크톱 앱 받기, 웹판에서 안 되는 것, 샘플이 맵을 연 채로 뜨고 "칠하고 F5" 안내
- [x] `.github/workflows/pages-smoke.yml` (저자가 배포 주소로 누른다. 입력 `url`, `PAGES_URL` 로 `pages.spec.ts`)
- [x] Pages 설정 표를 README 에 (대시보드에서 찾은 값). 프로덕션 브랜치 정리는 저자 결정

### 마일스톤 7: 업데이트 확인과 문서

- [ ] 도움말 > 업데이트 확인, 설정 `checkUpdates`, `updateChannel`, `packages/app/src/editor/update/` 와 단위 시험 (판 비교, 가짜 API 응답 넷). 결정 기록으로 이 단계에서 뺐다 (나중 후보)
- [x] 에디터 README (사용법만, 저자 문체): 설치(세 OS, 서명 안 된 앱 열기), 개발 중 동봉 엔진 시험(`yarn engine:fetch [--from]` 과 `yarn tauri dev --config src-tauri/tauri.sidecar.conf.json`), 릴리스 방법(`yarn version:set`, `yarn version:check`, `yarn engine:pin`, `yarn engine:check`, `ciEngineRef`, 태그, 초안 공개, `main` 빨리 감기), 로컬 자가 검사(`yarn selftest:app`), 신뢰 확인, 웹판(Pages 표, `check-web-dist`, 로컬 `wrangler pages dev`, `pages-smoke.yml`), 새 프로젝트 템플릿 셋, 안드로이드 스테이징(`yarn test:android-stage` 포함), 제3자 고지(`gen-licenses.mjs`). `yarn engine:pin` 은 태그가 생긴 뒤에 만들므로 README 에 없다
- [x] 엔진 README: 배포용 빌드(`build_dist.sh`, `check_dist.sh`, `pack_templates.py`), 모르는 인자의 종료 코드, `prepare_assets.sh --project` 와 `--with-rtp`, 에디터가 받는 엔진 릴리스(곧바로 공개). 배포용 빌드와 종료 코드는 엔진 master 에 있다. `prepare_assets.sh` 의 새 인자는 엔진 PR #54 로 master(`0010ea5`)에 들어갔다. 엔진 릴리스는 결정 기록으로 없다
- [x] `docs/plans/index.md`: 4절 표의 E6 행을 이 문서로, 5절 후보에서 E6 빼기, 진행 상황에 E6 과 R4 (와 R5) 행, mermaid 그래프에 `R4[R4. 엔진: 배포용 빌드] --> E6` 와 `E3 --> E6`(타일맵 템플릿이 맵 편집에 기댄다)를 더하고 `E5 -.-> E6` 는 지운다 (E5 는 병행). 03 문서 4절의 탐색 순서와 신뢰 규칙, 01 문서 6절의 "shell 플러그인" 줄을 이 문서에 맞춘다

### 마일스톤 8 (저자 결정 뒤, 완료 기준 밖): 서명, 자동 업데이트, Windows 엔진

- [ ] macOS 서명과 공증 (CI 비밀)
- [ ] Windows 서명
- [ ] `tauri-plugin-updater` 와 `latest.json`
- [ ] R5 뒤 Windows 사이드카 (`x86_64-pc-windows-msvc` 를 핀과 행렬에), Windows 자가 검사를 macOS 와 같은 계획으로

## 완료 기준

- [x] `v*` 태그 하나로 `release.yml` 이 macOS(dmg), Linux(AppImage, deb), Windows(NSIS) 번들과 `SHA256SUMS.txt` 를 초안 릴리스에 올린다 (결정 기록대로 dry run 의 산출물로 읽는다. 워크플로는 됐고 첫 실행 전) (2026-09-27 PR #52 의 release.yml 실행 36305206727, 커밋 988499d: `모으기` 가 산출물 `InitialEditor-8c81095` 에 dmg, AppImage, deb, NSIS 와 `SHA256SUMS.txt` 를 올렸다. 태그로 여는 초안 릴리스는 저자가 태그를 밀 때)
- [x] **CI 의 macOS 와 Linux 설치본이 자가 검사를 통과한다.** 메모리 설정으로 격리된 채, 번들에 든 템플릿으로 새 프로젝트 셋을 만든다. 플래피 Lua 와 플래피 Ruby 는 엔진 후보 탐색이 `bundled` 를 고르고, 그 엔진이 자동 시연 900틱을 돌아 종료 코드 0, 전체 로그에 상태 전이 셋과 `flappyFinal ... ticks=900` 과 `best >= 1`, 오류 줄 없음. 타일맵은 맵 문서에서 칠하고 저장한 칸이 번들 엔진의 스크린샷에서 표식 색이다. 보안 정책 위반이 없다. **에디터가 만들고 칠한 프로젝트를 번들 엔진이 실제로 돈다** (2026-09-27 이 맥, 사이드카를 실은 릴리스 `.app` 의 숨은 창: 33 PASS / 0 FAIL, 숲까지 46 PASS. 통합한 트리로 다시 빌드해도 같다. CI 는 첫 실행 전) (release.yml 실행 36305206727, 커밋 988499d: macOS 는 보이는 창에서 66 PASS / 0 FAIL(에디터 안 실행과 숲 단계 포함), Linux 는 xvfb 의 AppImage 로 61 PASS / 0 FAIL / 1 WARN. WARN 은 선택 실행인 에디터 안 실행이 러너의 WebKitGTK 에 소리 장치가 없어 멈춘 것이다. 첫 실행이 엔진의 Linux 종료 멈춤(엔진 PR #56)과 감시의 다시 읽기 되풀이를 찾아 고쳤다)
- [x] CI 의 Windows 설치본이 무인 설치 뒤 새 플래피 프로젝트를 만들고, 프로세스 방식으로 시작해 엔진을 못 찾고 에디터 안(웹 엔진)으로 넘어가 같은 플래피 검사를 통과한다. 첫 CI 실행이 WebGL 이 없음을 로그로 보일 때만 넘어감까지로 줄이고 그 로그를 이 문서에 적는다 (release.yml 실행 36305206727, 커밋 988499d: 12 PASS / 0 FAIL, 엔진 출처 none 에서 에디터 안으로 넘어가 플래피 검사 통과. 기준을 줄이지 않았다)
- [x] 판 대조: 동봉 엔진의 `--version` 커밋, `engine-pin.json`, 웹 엔진 MANIFEST, 템플릿 MANIFEST, 저장소 안의 다른 엔진 사본 MANIFEST 의 커밋이 같고, 앱의 템플릿이 핀의 템플릿 묶음과 생성물까지 같고(추적 파일은 sha, 생성물 PNG 는 픽셀), `ciEngineRef` 가 비어 있다 (릴리스 `check` 잡). 검증 뒤: `next` 를 합친 트리에서 ext-rpg 픽스처까지 `engine:check` 통과, Pillow 12.3.0 으로 핀의 커밋에서 다시 만든 묶음과의 대조 통과 (4.1). 2026-09-27 이 맥에서 `check` 잡의 단계를 그대로 돌려 통과: `yarn engine:check` 전부 통과(웹 엔진을 핀의 커밋에서 다시 빌드한 뒤), 핀의 커밋에서 `pack_templates.py` 로 만든 묶음에 대한 `templates.test.ts` 7건, 번들 안 엔진의 `--version` 커밋이 핀과 같다(`check-sidecar.mjs`). CI 의 `check` 잡은 첫 실행 전
- [x] 동봉 엔진이 자립 실행 파일이다 (번들 안 파일에 대한 `check-sidecar.mjs`: Homebrew 경로 없음, 허용 목록 밖 의존 없음). macOS 는 이 맥에서 통과 (릴리스 `.app` 안의 파일, 의존은 `/usr/lib` 와 `/System/Library` 뿐, minos 11.0). Linux(`ldd` 허용 목록)는 첫 CI 실행 (release.yml 실행 36305206727, 커밋 988499d: Linux deb 의 사이드카가 `ldd` 허용 목록과 `--version` 검사를 통과)
- [x] 신뢰: 신뢰하지 않은 프로젝트를 열면 프로젝트 안과 형제 경로의 실행 파일을 한 번도 부르지 않고(단위 시험), 확인 대화상자는 실행 파일의 절대 경로를 보이고, 답은 앱 설정에만 남는다 (`RunnerStore.trust.test.ts`, `engineTrust.test.ts`, `EngineTrustDialog.test.tsx`, `SettingsDialog.test.tsx`. 안드로이드 스테이징의 스크립트도 같은 규칙: `AndroidStageStore.test.ts`)
- [x] 안드로이드: `yarn test:android-stage` 가 통과한다 (엔진 브랜치 `feat/android-stage-project` 로. 그 브랜치가 엔진 master 에 들어가기 전의 CI 는 건너뛴다. 2026-09-27 통합에서 다시 돌려 33 PASS. master 에 들어가기 전의 엔진 저장소에서는 앱의 명령이 스크립트를 돌리지 않고 멈춘다, 6.3. 엔진 PR #54 가 master `0010ea5` 로 들어간 뒤 그 master 로 다시 33 PASS. CI 는 핀을 올린 뒤에 돈다, 4.1). 에디터 명령과 같은 인자로 스테이징한 폴더만으로 데스크톱 엔진이 플래피 검사를 통과하고, 내용만 바꾼 두 번째 스테이징의 스탬프가 다르고, `config.setting` 과 (기본) RTP 변환물이 들어가지 않는다
- [x] 웹판: `check-web-dist` 와 `wrangler pages dev dist` 에 대한 `pages.spec.ts` 가 CI 에서 통과한다 (wasm 의 content-type, 샘플 실행, 칠한 칸이 게임 탭에 보인다, 스트리밍 실패 줄 없음). 폴더를 열 수 있는 브라우저에서 새 플래피 프로젝트가 만들어지고 F5 로 돈다 (`web-folder.spec.ts`). 2026-09-27 이 맥: `check-web-dist` OK, 전체 Playwright 93 통과 (`PAGES_WRANGLER=1` 로 헤더 검사까지). CI 의 `ci.yml` 은 PR 의 첫 실행 전 (ci.yml 실행 36305206716: "웹판 dist 검사" 통과, Playwright 91 통과 1 건너뜀(엔진이 없어 건너뛰는 검사), `PAGES_WRANGLER=1` 로 `wrangler pages dev` 주소 `127.0.0.1:8788` 에 대한 `pages.spec.ts` 가 돌았다)
- [x] 바깥 링크가 opener 를 거친다 (`openExternal.test.ts`, `AboutDialog.test.tsx`, `tests/capabilities.rs`). 업데이트 확인의 판 비교와 가짜 API 응답은 결정 기록으로 이 기준에서 뺐다
- [x] 저자 실기: macOS 에서 초안 릴리스의 dmg 를 받아 README 대로 열고, "타일맵" 템플릿으로 새 프로젝트를 만들어 한 칸을 칠하고 F5 로 칠한 맵이 뜬다 (상태 바에 "앱에 든 엔진"). 엔진 저장소를 열면 신뢰 확인 한 번 뒤 그 저장소의 `build/` 가 쓰이고 알데바란이 돈다 (2026-09-27, 저자가 판단을 맡긴 뒤 리드의 판단: CI 의 macOS 자가 검사가 같은 흐름(번들 템플릿으로 새 타일맵 프로젝트, 맵 문서에서 칠하고 저장, 앱에 든 엔진으로 실행, 엔진 저장소의 숲)을 보이는 Tauri 창에서 돌려 통과했으므로 기준을 닫는다. 저자가 산출물의 dmg 를 손으로 열어 보는 것은 권장으로 남긴다)
- [x] 두 저장소의 README 에 마일스톤 7 의 목록이 모두 있다 (새 yarn 명령과 워크플로우 전부: `engine:fetch`, `engine:pin`, `engine:check`, `version:set`, `version:check`, `selftest:app`, `test:android-stage`, `check-web-dist`, 로컬 `wrangler pages dev`, `gen-licenses`, 엔진의 `build_dist.sh`, `check_dist.sh`, `pack_templates.py`, `prepare_assets.sh` 의 새 인자). 에디터 README 는 됐다 (`engine:pin` 은 태그 뒤에 만든다). 엔진 README 는 엔진 PR #54 로 `prepare_assets.sh` 새 인자까지 master 에 있다. 남은 것은 태그 뒤의 `engine:pin` 하나다 (2026-09-27 확인: `engine:pin` 을 뺀 전부가 두 README 에 있다. `engine:pin` 은 첫 태그 뒤에 만드는 명령이라 결정 기록대로 이 단계에서 뺐다)

### 남은 기준을 닫는 CI 실행 (2026-09-27 통합과 검증 수정 뒤)

로컬에서 돌릴 수 있는 검사는 모두 통과했다 (`next` 를 합친 트리에서 다시). 남은 기준은 러너에서만 볼 수 있다. PR 은 `next` 와의 합친 트리로
돌므로, 검증이 찾은 합친 트리의 `engine:check` 실패(ext-rpg 픽스처)와 CI 의 Pillow 로 만든 템플릿 묶음의 바이트 대조 실패는 이 표의 실행
전에 고쳤다 (1절 끝, 4.1). `release.yml` 은 기본 브랜치(`next`)에 있어야
`workflow_dispatch` 로 돌릴 수 있으므로, 합치기 전에는 이 브랜치의 PR 이 부르는 `release.yml`(경로 조건에 `src-tauri/**` 가 있다)과
`ci.yml` 이 같은 일을 하고, 합친 뒤에는 `gh workflow run release.yml --ref next -f dry_run=true` 로 돌린다.

| 기준 | 잡과 단계 | 통과의 모습 |
|---|---|---|
| 첫째 (세 OS 번들과 `SHA256SUMS.txt`) | `release.yml` 의 `engine` (macOS, Linux), `bundle` 셋의 "번들", `collect` | 산출물 `InitialEditor-<커밋>` 에 dmg, AppImage, deb, NSIS, `SHA256SUMS.txt`. NSIS 가 `2.0.0-dev` 를 받는지 |
| 둘째 (macOS 와 Linux 자가 검사) | `bundle` 의 "자가 검사 (macOS, dmg 안의 앱)", "자가 검사 (Linux, AppImage)", "자가 검사 판정" | 판정이 0 이고 보고서에 `cspViolations` 가 없다. macOS 의 숲 단계(칠한 칸, 레이어마다의 기준 대조)가 통과하면 E3 완료 기준 1 도 닫는다 |
| 셋째 (Windows 넘어감) | `bundle` 의 "자가 검사 (Windows, 무인 설치본)", "자가 검사 판정" | 엔진 출처 `none`, 에디터 안(`embedded`)으로 넘어갔다, 플래피 검사 통과. WebGL 이 없다는 로그가 나올 때만 기준을 줄인다 |
| 다섯째 (Linux 사이드카 자립) | `bundle` 의 "번들 안 사이드카 (Linux deb)", "deb 설치와 엔진 --version" | `check-sidecar.mjs` 의 `ldd` 허용 목록 통과 |
| 넷째를 CI 에서 다시 | `release.yml` 의 `check` | 로컬과 같은 통과 (`version:check`, `gen-licenses --check`, `engine:check`, 템플릿 묶음 대조. 묶음의 플래피 그림은 CI 의 Pillow 가 만들어 바이트가 다르고 픽셀로 견준다) |
| 여덟째 (웹판) | `ci.yml` 의 `web` 잡 ("웹판 dist 검사", `PAGES_WRANGLER=1` 의 Playwright) | 러너가 wrangler 를 받아 헤더 검사가 건너뛰지 않고 통과 |
| 마일스톤 1 의 Rust 세 OS | `ci.yml` 의 `rust` 행렬 | Windows 에서 크레이트가 빌드되고 `cargo test` 통과 |

엔진 쪽 `dist.yml` 의 첫 실행(엔진 저장소에서 `workflow_dispatch`)은 R4 의 남은 항목이고 이 표와 따로 돌린다. 안드로이드는 엔진 브랜치
`feat/android-stage-project` 가 엔진 master(PR #54, `0010ea5`)에 들어갔으므로, 핀을 그 뒤로 올리는 PR 에서 `ci.yml` 에 `yarn test:android-stage` 를 더한다.
(2026-09-28) 핀이 `ef00946` 으로 올라 `--project` 를 아는 엔진이 CI 에 온다. 교차 검사는 빌드한 엔진이 필요한데 `ci.yml` 의 웹 잡은 엔진을
빌드하지 않으므로, `release.yml` 의 Linux 번들 잡에서 설치한 deb 의 엔진(`INITIAL2D_EXE=/usr/bin/Initial2D`)과 핀의 엔진 체크아웃으로 돌린다.
`SKIP:` 줄이 나오면 실패로 친다. 이 맥에서 같은 명령을 `ef00946` 의 배포용 엔진으로 돌려 33 PASS.

## 의존 관계

- 선행: E1 (실행기와 엔진 후보), E2 (템플릿과 새 프로젝트), E3 개정판의 맵 문서와 맵 뷰와 칠하기 도구와 저장 (타일맵 템플릿과 자가 검사의 `edit`
  이 기댄다. E3 의 "새 맵 만들기" 는 필요 없다: 템플릿이 맵 한 장을 준다), E4 (웹 엔진 사본, 에디터 안 실행, 브라우저 폴더 백엔드).
  엔진 **R4** (3.1 절, 마일스톤 2).
- 선택 선행: 엔진 **R5** (Windows 사이드카만 기다린다).
- 병행: E5 (RPG 확장). 서로 기다리지 않는다. E5 가 더하는 `yarn sync:rpg` 픽스처 MANIFEST 는 `source: "checkout"` 과 `syncCommand` 를 가지고
  E6 의 핀 대조와 `engine:pin` 이 함께 다룬다 (E5 가 먼저 들어가면 E6 마일스톤 3 이 그 칸을 더한다).
- 후행: 게임 내보내기(플레이어용 배포판), 자동 업데이트, 서명.

## 위험

- **받은 프로젝트의 실행 파일.** 엔진 탐색이 후보를 실행하므로, 규칙이 없으면 남이 준 폴더를 여는 것만으로 그 안의 실행 파일이 돈다. 대응: 2.3 의 신뢰 규칙(설정과 앱에 든 엔진만 기본, 나머지는 경로를 보인 한 번의 확인, 답은 앱 설정에), 단위 시험, 안드로이드 스테이징도 같은 규칙. 남는 틈: 사용자가 확인을 누르면 그 실행 파일은 돈다. 확인 문구가 실행 파일 경로와 출처를 분명히 보이는 것으로 줄인다.
- **서명 없음.** 첫 열기가 막혀 "안 열린다" 로 끝날 수 있다. 대응: README 와 릴리스 본문 맨 위의 안내, 서명은 저자 결정 (마일스톤 8).
- **사이드카 경로.** `externalBin` 은 파일이 없으면 빌드가 깨진다: 덮어쓰기 설정에서만 켠다. AppImage 의 `current_exe` 는 마운트 경로(`/tmp/.mount_*`)이지만 사이드카도 그 안에 있어 맞다. deb 는 `/usr/bin/Initial2D` 라는 전역 이름을 쓴다 (충돌하면 사이드카 이름만 바꾸면 된다. 엔진은 실행 파일 이름을 보지 않는다). App Translocation, 첫 실행의 격리 검사로 `--features` 시간 초과 (2.3 의 15초와 재시도, 셸의 시간 인자).
- **정적 링크.** 안드로이드는 약한 선례다: 같은 소스 판을 `add_subdirectory` 로 빌드하지만 SDL 을 **공유** 라이브러리로 만들고, Apple 이 아니라 ImageIO 문제를 겪지 않는다. 데스크톱 정적 빌드는 새 땅이다. macOS 는 SDL2 정적 빌드가 프레임워크 목록을, SDL2_image 는 ImageIO 를 끄지 않으면 PNG 를 다른 디코더로 푼다. Linux 는 X11 과 Wayland 헤더를, mruby 는 빌드 정의(`mruby-config --cflags` 의 `-D`)의 일치와 배포 대상(rake 는 CMake 값을 물려받지 않는다)을 요구한다. 대응: 3.1 의 캐시 값을 명시하고 `check_dist.sh` 가 `minos` 와 의존을 본다. mruby 는 CI 의 대체 경로와 같은 설정. 막히면 macOS 는 dylib 를 `Contents/Frameworks/` 로 싣는 후퇴안. stb 디코더와 libpng 의 픽셀 차이는 macOS 전체 씬 검수(골든)가 잡는다.
- **템플릿의 생성물.** 플래피 그림 넷은 엔진이 추적하지 않고 Pillow 판에 따라 바이트가 다르다 (2026-09-27 확인: 10.4.0 과 12.3.0 은 바이트가 다르고 픽셀은 같다). 대응: 원천을 릴리스의 템플릿 묶음 하나로 정하고(검수에 쓴 그 그림), 매일의 CI 는 생성물만 표시된 대로 건너뛰고, 묶음과의 대조는 생성물을 픽셀로 견준다 (4.1). 커밋으로 추적하는 안은 기각했다: dist.yml 이 그림을 다시 만들면 추적 파일이 바뀌어 판 헤더가 `--dirty` 가 되고, `.gitignore` 의 `resources/*.*` 에 예외가 쌓인다.
- **CI 의 소리.** 오디오 장치가 없는 러너에서 `SDL_Init` 이 소리 때문에 실패할 수 있다. 대응: 모든 프로세스 실행과 엔진 검수에 `SDL_AUDIODRIVER=dummy`.
- **Windows 경로.** 설치 폴더(`%LOCALAPPDATA%\InitialEditor`), 공백과 한글 사용자 이름, 역슬래시, 260자 한도. 대응: `engineCandidates.ts` 는 이미 역슬래시를 다루고 Rust 는 `PathBuf` 만 쓴다. 안드로이드 스테이징의 Git Bash 는 `C:\` 인자를 바꾸려 들므로 `/` 로 바꿔 넘긴다. Python 은 Store 가짜 실행 파일을 가려낸다. Windows 실기는 저자.
- **Windows 엔진 부재.** R5 가 저자 결정에 막히면 Windows 는 계속 Lua 만, 에디터 안에서만 돈다. 대응: 이 문서의 완료 기준은 그것을 전제로 하고, 그 길(넘어감과 플래피)을 CI 가 필수로 본다.
- **CI 의 GUI.** Linux xvfb 의 WebKitGTK, AppImage 의 FUSE(`APPIMAGE_EXTRACT_AND_RUN=1`), 러너의 WebGL, 숨은 창의 프레임 멈춤. 대응: 프로세스 방식을 필수로, 에디터 안은 macOS 와 Linux 에서 시도로 둔다. 에디터 안 실행이 있는 계획만 창을 보인다. Windows 는 넘어감 뒤의 에디터 안 실행이 필수이고, 줄이는 것은 첫 실행의 로그가 보일 때만이다.
- **보안 정책이 기능을 막음.** CSP 가 Monaco 워커, PIXI, 웹 엔진을 막을 수 있다. 대응: 자가 검사가 셋을 모두 열고 위반을 실패로 친다. 개발 중에도 `devCsp` 로 같은 정책을 본다.
- **자가 검사의 멈춤.** 프런트가 멈추거나 죽으면 앱이 끝나지 않는다. 대응: 셸의 전체 시간 감시가 보고서를 쓰고 끝내고, CI 단계의 `timeout-minutes` 와 "보고서가 없으면 실패" 가 겹으로 막는다.
- **판 어긋남.** 동봉 엔진, 웹 엔진, 템플릿, ext-rpg 픽스처, 프로젝트의 런타임 스크립트가 서로 다른 엔진 커밋에서 올 수 있다. 대응: `engine-pin.json` 한 장, `engine:pin` 한 명령, `check` 잡. 핀이 개발을 막는 것은 `ciEngineRef` 로 풀고 릴리스에서는 막는다. 프로젝트 쪽은 후보(런타임 갱신 명령).
- **Pages 빌드 환경.** Yarn Berry, Node 판, `_headers` 문법 실수. 대응: `.node-version`, `yarnPath`, `check-web-dist`, CI 의 `wrangler pages dev` 로 헤더까지 배포 전에 본다.
- **라이선스.** 엔진 저장소에 LICENSE 가 없어 엔진 바이너리를 배포할 근거가 없다. 나눔고딕(OFL)은 고지가 필요하다. 대응: 저자 결정, `THIRD-PARTY.md`, `licenses/`. RTP 변환물은 `--project` 스테이징에서 `--with-rtp` 로만 APK 에 들어가고 경고 줄이 붙는다 (인자 없는 실행은 저자의 기기 시험이라 예전처럼 넣는다).
- **엔진의 실행 부작용.** 엔진이 프로젝트 루트에 `config.setting` 을 쓴다 (실행 파일 경로가 들어가 사람마다 다르다). 대응: 새 프로젝트의 `.gitignore`, 안드로이드 스테이징(`--project`)에서 빼기, 탐색의 임시 작업 폴더. 엔진 쪽에서 없애는 것은 C++ 변경이라 이 단계에서는 하지 않는다.
- **`identifier` 변경.** 설정과 기억한 폴더를 잃는다. 대응: 고정 (9절).

## 결정 기록 (2026-09-27)

초안이 저자에게 물은 열한 가지를 저자가 자리에 없는 동안 리드가 정했다. 바깥으로 나가는 일(공개 릴리스, 태그, 라이선스, 서명, Pages 설정)은
정하지 않고 저자에게 남긴다. **이 표가 본문과 어긋나면 이 표가 이기고, 구현하는 쪽이 본문을 이 표에 맞춰 고친다.**

| 물음 | 결정 |
|---|---|
| 서명과 공증 | 이 단계는 서명 없이(macOS ad-hoc) 만든다. 서명과 공증은 마일스톤 8, 저자 결정 |
| 라이선스 | **바뀌었다 (2026-09-27, 저자가 "알아서 판단하세요" 로 맡겼다).** 에디터는 MIT: 루트 `LICENSE` 를 더하고 `tauri.conf.json` 에 `license` 를 둔다 (`licenseFile` 은 dmg 에 사용권 동의를 붙여 무인 `hdiutil attach` 를 막으므로 두지 않는다. 원문은 번들의 `licenses/LICENSE`). 옛 에디터의 `package.json` 이 이미 MIT 였다. 엔진에는 라이선스를 더하지 않는다: 오픈 소스 라이선스를 고르는 것은 되돌릴 수 없고, 엔진은 저자의 에디터에 실려 나가므로 따로 필요하지 않다. 제3자 고지(`THIRD-PARTY-editor.md`, 엔진 `THIRD-PARTY.md`)는 그대로 만든다 |
| R5 (Windows SDL2 엔진) | 이 단계에서 하지 않는다. `RS_WINDOWS` 와 `RSLIB` 판정 줄을 포함해 GDI 쪽은 손대지 않는다. Windows 번들은 사이드카 없이 내고 F5 는 에디터 안(웹 엔진)으로 넘어간다 |
| Intel 맥 | 지원하지 않는다 (arm64 만). 나중 후보 |
| Pages 설정 | 대시보드 설정(프로젝트 이름, 주소, 프로덕션 브랜치)은 바꾸지 않는다. 저장소에는 `_headers`, 빌드 명령과 출력 폴더의 기록, `check-web-dist` 만 둔다. `main` 빨리 감기와 프로덕션 브랜치 정리는 저자 결정 |
| 판 번호와 릴리스 | **태그와 공개 릴리스를 만들지 않는다.** 판은 루트 `package.json` 하나에서 오고, 첫 판 후보는 `v2.0.0-alpha.1` 로 문서에만 적는다. 엔진 R4 의 `dist.yml` 과 에디터의 `release.yml` 은 `workflow_dispatch`(dry run)로 돌아 **워크플로 산출물**을 올린다. 태그를 밀면 초안 릴리스가 되도록 만들어 두되 태그는 저자가 민다 |
| 엔진을 받는 길 | 공개 릴리스가 없으므로 에디터 CI 는 `engine-pin.json` 의 엔진 커밋을 체크아웃해 `tools/build_dist.sh` 로 직접 만든다 (`yarn engine:fetch --from <dist 폴더>` 가 기본 길). 릴리스 자산에서 받는 길은 태그가 생긴 뒤에 쓴다 |
| 안드로이드 RTP | 엔진 스크립트의 **인자 없는 실행은 지금과 같다** (저자의 알데바란 기기 시험이 그대로 돈다). 에디터 명령은 늘 `--project` 를 주고, RTP 변환물은 대화상자의 체크(기본 꺼짐)일 때만 `--with-rtp` 로 넣는다 |
| 업데이트 확인 | 이 단계에서 만들지 않는다 (마일스톤 7 의 업데이트 확인과 그 완료 기준을 뺀다). 나중 후보 |
| Linux 형식 | AppImage 와 deb |
| 알데바란 단독 웹 데모 | 배포하지 않는다 (소재 공개는 저자 결정) |
| 타일맵 템플릿의 그림 | **새로 그리지 않는다.** 코드로 그린 새 도트는 저자가 받아들이지 않은 방식이다. 엔진 저장소에 이미 커밋되어 데모에 쓰이는 RTP 가 아닌 타일셋을 쓰고, 알맞은 것이 없으면 타일맵 템플릿을 나중 후보로 미룬다 |

완료 기준도 이에 맞춘다: 첫째 기준의 "`v*` 태그 하나로 초안 릴리스" 는 "`release.yml` 의 dry run 이 세 OS 번들과 `SHA256SUMS.txt` 를 산출물로 올린다" 로 읽고,
업데이트 확인 기준은 뺀다. 저자 실기 기준은 "CI 산출물의 dmg" 로 읽는다.

## 하지 않는 것

- 앱 스토어 (Mac App Store, Microsoft Store, Flathub, Snap).
- 에디터가 APK 를 빌드하고 설치하는 것 (Gradle, adb). 스테이징까지만 한다.
- 웹판의 서버 기능과 메모리 모드의 새 프로젝트.
- 웹판의 CSP 헤더 (7.3).
- iOS.

## 이 뒤 (후보)

| 후보 | 언제 | 크기 |
|---|---|---|
| 게임 내보내기 (플레이어가 받는 실행 파일: R4 의 엔진 + 프로젝트 폴더를 묶은 zip 이나 .app) | 누군가 에디터로 만든 게임을 남에게 줄 때. R4 가 재료다 | 중 |
| 프로젝트 런타임 갱신 (앱의 템플릿과 프로젝트의 `common` 그룹이 다르면 알리고, 차이 목록을 보인 뒤 덮는다) | 엔진 씬 로더가 바뀐 첫 릴리스 | 소 |
| 타일맵 템플릿의 "여기서 실행" (스키마의 `play.env` 와 그것을 읽는 시작 위치) | 타일맵 템플릿에 움직이는 무언가가 생길 때 | 소 |
| 웹판 CSP 헤더 (데스크톱 정책을 `_headers` 로) | 데스크톱 정책이 자가 검사로 굳은 뒤 | 소 |
| 안드로이드 빌드와 설치 (Gradle, adb, 기기 목록) | 스테이징 뒤 손으로 치는 명령이 번거로울 때 | 중 |
| 프로젝트별 스테이징 제외 (`game.json` 의 `stage.exclude`) | 알데바란 말고 원본 소재를 둔 게임이 생길 때 | 소 |
| 게임마다 다른 `applicationId` | 에디터로 만든 게임을 스토어에 낼 때 | 중 |
