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
| 엔진 바이너리와 사본의 출처 | 엔진 저장소가 태그마다 **공개** 릴리스로 낸다 (새 단계 **R4**). 네이티브 실행 파일, 웹 엔진, **템플릿 묶음**(`Initial2D-templates.zip`, 생성한 그림 포함), 제3자 고지가 한 릴리스에서 온다. 에디터는 `engine-pin.json` 이 가리키는 판을 받아 sha256 을 확인한다 | 3, 4 |
| 새 프로젝트 템플릿 | 빈 프로젝트, 플래피에 **타일맵**(작은 타일셋, 맵 한 장, 타일맵 오브젝트 씬, 오브젝트 스키마)을 더한다. 원본은 엔진 `resources/templates/tilemap/` | 3.1 |
| CI | 세 OS 행렬. macOS arm64(dmg), Linux x86_64(AppImage, deb), Windows x86_64(NSIS). 태그에서 초안 릴리스. 설치본의 자가 검사가 게이트다 | 4, 5 |
| 자가 검사 | 설치본이 격리된 상태(메모리 설정)로 새 프로젝트 셋을 만들고 돈다. 판정은 앱이 아니라 `selftest-check.mjs` 가 실행마다 남긴 **전체 로그**와 스크린샷으로 한다 | 5 |
| Windows 의 엔진 | Windows SDL2 엔진(**R5**, 저자 결정)이 생길 때까지 사이드카 없이 내고, F5 는 엔진을 못 찾아 웹 엔진으로 넘어간다 (Lua 만). 자가 검사가 그 넘어감과 플래피 실행을 필수로 본다 | 3.2, 5 |
| 웹뷰 보안 정책 | 릴리스에서 CSP 를 켠다 (`wasm-unsafe-eval`, 업데이트 확인의 `api.github.com`). 자가 검사가 위반 보고를 모아 실패로 친다 | 2.5 |
| 안드로이드 | 에디터의 "안드로이드로 스테이징" 명령이 엔진 저장소의 `android/prepare_assets.sh --project <열린 프로젝트>` 를 돌린다. RTP 변환물은 `--with-rtp` 로만 들어간다. APK 빌드와 설치는 범위 밖 | 6 |
| 웹판 | 같은 `dist/` 를 Cloudflare Pages 가 낸다. `_headers` 를 저장소에 두고 CI 가 `wrangler pages dev` 로 그 헤더까지 검사한다. 교차 출처 격리 헤더는 두지 않는다 (엔진이 스레드를 안 쓴다). 폴더를 열 수 있는 브라우저는 새 프로젝트도 만든다 | 7 |
| 서명 | 첫 판은 서명 없음 (macOS 는 ad-hoc). 공증과 Windows 서명은 저자 결정 | 8 |
| 판과 업데이트 | 판은 루트 `package.json` 하나에서 오고 `tauri.conf.json` 은 그 파일을 가리킨다. 태그 `v<semver>`, 첫 공개는 `v2.0.0-alpha.1`. 자동 업데이트 없이 "업데이트 확인"(GitHub Releases)부터 | 9 |

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
| 제3자 라이선스 고지 | 번들 리소스 `licenses/` | 에디터 쪽 `src-tauri/licenses/THIRD-PARTY-editor.md` 와 `LICENSE`(커밋, `scripts/gen-licenses.mjs` 가 만들고 `--check` 로 최신인지 본다). 엔진 쪽 `licenses/engine/THIRD-PARTY.md`(gitignore, `yarn engine:fetch` 가 엔진 릴리스에서 받는다) | 엔진 고지: SDL2, SDL2_image, SDL2_mixer(zlib), stb, Lua(MIT), mruby(MIT), jsoncpp, SQLite, TinyXML, 나눔고딕(OFL, `hangul.fnt` 가 구운 글꼴). 웹판은 `dist/engine/THIRD-PARTY.md` 로 같은 고지를 낸다 |
| 게임 (`game.json`, `scripts/`, `resources/`) | 사용자 프로젝트 | 사용자 | 엔진은 작업 폴더에서 읽는다 |
| 맵 오브젝트 스키마 (`resources/schema/map-objects.json`) | 사용자 프로젝트 | 게임마다 (타일맵 템플릿이 장르 중립 한 장을 준다) | 에디터는 프로젝트의 것을 읽는다 |
| **싣지 않는 것** | | | `resources/RTP.zip` 과 `resources/rtp/`, 알데바란 소재, 엔진 저장소의 게임과 테스트, 데스크톱 번들의 소스맵 |

E5 는 템플릿 그룹을 더하지 않는다. `yarn sync:rpg`(`scripts/sync-engine-rpg.mjs`)가 엔진 커밋과 sha256 을 적은 자기 MANIFEST 로
`packages/ext-rpg/test/fixtures/` 에 픽스처를 복사하고, RPG 프로젝트 템플릿은 그 뒤 후보로 남긴다. 그 픽스처는 배포물에 실리지 않지만
엔진 커밋에 묶인 셋째 사본이라, 9절의 대조와 `engine:pin` 은 저장소 안의 **엔진에서 온 MANIFEST 전부**(템플릿, 웹 엔진, ext-rpg 픽스처)를 본다.

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
| `src-tauri/licenses/` | 커밋: `LICENSE`, `THIRD-PARTY-editor.md`(npm 과 cargo 의존성, `node scripts/gen-licenses.mjs` 가 쓴다). gitignore: `engine/THIRD-PARTY.md`(`yarn engine:fetch` 가 모든 타깃에서 받는다. 사이드카가 없는 Windows 도 웹 엔진을 싣기 때문이다). 폴더가 늘 있으므로 번들 리소스 경로가 비어 빌드가 깨지는 일이 없다 |
| `src-tauri/tauri.dist.conf.json` (새) | 모든 릴리스 빌드의 덮어쓰기. `build.beforeBuildCommand` 를 `yarn build:desktop`(소스맵 없는 빌드)으로, `bundle.resources` 에 `{"licenses/": "licenses/"}` |
| `src-tauri/tauri.sidecar.conf.json` (새) | 사이드카가 있는 타깃의 덮어쓰기. `bundle.externalBin: ["binaries/Initial2D"]`, `bundle.resources` 에 `{"binaries/engine.json": "engine/engine.json"}` |
| `src-tauri/tauri.conf.json` (고침) | `"version": "../package.json"` (9절). 창 `main` 에 `"create": false` (셸이 만든다, 아래 `lib.rs`). `app.security.csp` 와 `devCsp` (2.5 절). 모든 빌드에 두는 칸: `publisher`, `copyright`, `shortDescription`, `longDescription`, `homepage`, `license: "MIT"`, `licenseFile`, `macOS.minimumSystemVersion: "11.0"`, `macOS.signingIdentity: "-"`, `windows.nsis.installMode: "currentUser"`, `windows.nsis.languages: ["Korean", "English"]`, `windows.webviewInstallMode: { "type": "downloadBootstrapper" }`. `targets` 는 "all" 로 두고 CI 가 `--bundles` 로 고른다 |
| `src-tauri/src/lib.rs` (고침) | `setup` 에서 창 `main` 을 설정 그대로 만든다 (`WebviewWindowBuilder::from_config`). 자가 검사 모드(5절)면 계획의 `showWindow` 로 보임을 정하고 `window-state` 플러그인을 붙이지 않는다. 평소에는 전과 같다 |
| `src-tauri/src/bundled.rs` (새) | `bundled_engine() -> Option<BundledEngine>`: `std::env::current_exe()` 의 부모 폴더에서 `Initial2D`(Windows 는 `Initial2D.exe`)를 찾고, `resource_dir()/engine/engine.json` 을 읽어 붙인다. 명령 `engine_bundled`. 실행하지 않고 파일만 본다 |
| `src-tauri/src/engine.rs` (고침) | `features(exe, timeout)`: 시간 제한을 인자로 받고, 작업 폴더를 임시 폴더로 둔다 (`--features` 를 모르는 옛 엔진이 게임을 띄워도 프로젝트에 `config.setting` 을 쓰지 않게). 명령 `engine_features(exe, timeout_ms: Option<u64>)`, 없으면 5초. 새 명령 `engine_exists(paths) -> Vec<bool>` 은 실행하지 않고 파일인지만 본다 (신뢰 확인용, 2.3) |

릴리스 빌드 한 줄은 이렇다 (Tauri 2 의 `--config` 는 여러 개를 준 순서대로 병합한다).

```sh
yarn tauri build --target aarch64-apple-darwin --bundles app,dmg \
  --config src-tauri/tauri.dist.conf.json --config src-tauri/tauri.sidecar.conf.json
```

`externalBin` 을 기본 `tauri.conf.json` 에 넣지 않는 이유: `cargo test` 와 `yarn tauri dev` 와 지금의 CI 디버그 빌드가 사이드카 파일
없이도 되어야 한다. 플랫폼별 자동 병합 파일(`tauri.macos.conf.json` 등)도 개발 빌드에 섞이므로 쓰지 않는다. 병합은 JSON merge patch 라
객체는 키끼리 합쳐지고 배열은 뒤 것이 통째로 덮는다. 그래서 두 덮어쓰기 파일의 `bundle.resources` 는 둘 다 맵 꼴(`{"원본": "대상"}`)로 쓴다.

`engine.json` 의 모양:

```json
{
  "engineTag": "v2.0.0-alpha.1",
  "engineCommit": "<40자 커밋>",
  "target": "aarch64-apple-darwin",
  "sha256": "<실행 파일의 sha256>",
  "features": ["lua", "mruby"]
}
```

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
  한 번 묻는다: "이 프로젝트가 가리키는 엔진을 실행할까? `<실행 파일의 절대 경로>` (출처: 프로젝트의 build/)". 단추는
  "이 엔진 실행 허용" 과 "앱에 든 엔진만 쓰기". 어느 쪽이든 기억한다.
- 답은 **앱 설정**의 `engineTrust: { [프로젝트 정규 경로]: { allow: boolean, exe: <허용한 실행 파일 정규 경로> } }` 에 남는다. 프로젝트
  폴더에는 쓰지 않는다 (프로젝트가 스스로 신뢰를 적을 수 없게). 허용한 뒤 후보 경로가 바뀌면(`.initial-editor/engine` 이 다른 파일을
  가리키면) 다시 묻는다. 설정 대화상자의 "찾은 엔진" 줄 옆에 "신뢰 취소".
- 자가 검사 모드에서는 이 확인이 뜨는 것 자체가 실패다 (5절). 자가 검사의 임시 프로젝트에는 그런 후보가 없다.
- 단위 시험: 가짜 `probe` 가 부른 경로를 기록하고, 신뢰하지 않은 프로젝트를 열면 프로젝트 안과 형제 경로가 한 번도 불리지 않는다.
  허용한 뒤에는 순서대로 불린다. 거절을 기억한다. 경로가 바뀌면 다시 묻는다.

**그 밖의 규칙**

- **다 못 찾으면** 에디터 안(웹 엔진)으로 돌리고 콘솔에 한 줄 남긴다: "엔진 실행 파일을 찾지 못해 에디터 안에서 돈다 (찾아본 곳: ...)".
  설정의 `runMode` 는 바꾸지 않는다. `game.json` 이 mruby 면 지금처럼 이유(`WASM_NO_MRUBY`)를 띄우고 멈춘다. Windows 번들은 R5 전까지
  늘 이 길이다.
- **첫 실행의 느림.** 다운로드한 앱의 사이드카는 macOS 가 처음 실행할 때 격리 속성 검사로 몇 초 걸릴 수 있다. `bundled` 후보만
  `--features` 시간 제한을 15초로 두고, 시간 초과면 한 번 더 찌른다. 시간 제한은 셸의 상수라 프런트가 늘릴 수 없었으므로 셸부터 고친다:
  `engine_features(exe, timeout_ms)`(2.2), 백엔드 `engineFeatures(exe, { timeoutMs })`, `RunnerOptions.probe(exe, { timeoutMs })`.
  `cargo test`: 7초 뒤에 답하는 가짜 스크립트가 기본 시간에는 실패하고 15초에는 통과한다.
- **`--version` 은 부르지 않는다.** 에디터는 어떤 후보에도 `--features` 말고는 부르지 않는다. R4 이전 엔진은 모르는 인자를 무시하고
  게임을 띄우기 때문이다. 앱에 든 엔진의 판은 `engine.json` 에서 읽는다. `--version` 은 CI 의 검사 도구(`check_dist.sh`,
  `check-sidecar.mjs`)만 부르고, 그때도 시간 제한과 버리는 작업 폴더를 쓴다.
- **보이는 곳.** 상태 바 툴팁과 설정 대화상자의 "찾은 엔진" 줄, 정보 창: "앱에 든 엔진 v2.0.0-alpha.1 (abc1234, lua mruby)".
  라벨은 `ENGINE_SOURCE_LABELS` 에 "앱에 든 엔진" 으로 더한다.

### 2.4 개발 중에

- 평소: 지금처럼 형제 폴더의 개발 빌드 (처음 한 번 신뢰를 묻는다).
- 동봉 경로를 시험할 때: `yarn engine:fetch`(핀의 릴리스를 받는다) 또는 `yarn engine:fetch --from ../Initial2D/dist`(엔진에서
  `tools/build_dist.sh` 로 만든 것) 뒤 `yarn tauri dev --config src-tauri/tauri.sidecar.conf.json`. Tauri 가 개발 빌드에도
  `target/debug/` 옆에 사이드카를 놓는다.

### 2.5 웹뷰 보안 정책 (CSP)

지금은 `csp: null` 이고 결정의 기록이 없다. 릴리스는 남의 프로젝트를 여는 앱이므로 정책을 켠다.

```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self' data:;
worker-src 'self' blob:;
connect-src 'self' ipc: http://ipc.localhost https://api.github.com
```

- `wasm-unsafe-eval`: 웹 엔진(에디터 안 실행)의 WebAssembly 컴파일. `unsafe-eval` 은 넣지 않는다. PIXI 8 은 기본으로 `new Function` 을
  쓰므로 `pixi.js/unsafe-eval` 을 들여와 그 경로를 끈다.
- `style-src 'unsafe-inline'`: Monaco 와 dockview 가 인라인 스타일을 쓴다.
- `connect-src https://api.github.com`: 업데이트 확인(9절).
- `devCsp` 는 같은 정책에 Vite 개발 서버(`http://127.0.0.1:5173`, `ws://127.0.0.1:5173`)를 더한다. 개발 중에도 위반이 콘솔에 보인다.
- 검사: 자가 검사가 `securitypolicyviolation` 사건을 모아 보고서에 적고, 하나라도 있으면 실패다 (5절). 자가 검사는 맵 문서(PIXI)와
  스크립트 편집기(Monaco)와 에디터 안 실행(wasm)을 모두 연다. 정책 문자열은 첫 CI 실행의 위반 목록을 보고 고치고 이 절에 적는다.
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
| `resources/templates/tilemap/` (새) | 장르 중립 타일맵 템플릿. `tiles16.png`(16px 타일 8열 4행. 풀, 흙, 물, 돌, 길 몇 칸과 **마지막 칸 31 번은 단색 `#c83cc8` 표식 칸**. `tools/gen_template_tiles.py` 가 표준 라이브러리만으로 한 번 그리고 **결과를 커밋**한다. 바이트가 고정되어야 sha 대조가 된다), `map.json`(맵 포맷 v2, 화면 768x896 을 채우는 48x56 칸, 레이어 둘과 통행 레이어와 빈 `objects`, `tools/mapfile.py` 의 고정 형식. 타일셋 경로는 새 프로젝트 기준 `resources/tiles/tiles16.png`), `scene.json`(씬 포맷 v1, 오브젝트 `map` 하나: 타입 `tilemap`, `props.map` 은 `resources/maps/start.json`, `groundLayers` 1), `map-objects.json`(오브젝트 스키마. 타입 `marker` 하나: 점 모양, 칸 `label`(글). `play` 절은 없다). `resources/*.*` 규칙은 하위 폴더에 걸리지 않으므로 추적된다 |
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

**`ci.yml` 고칠 것**

- `web` 잡의 엔진 체크아웃을 **핀의 커밋**으로: 앞 단계가 `engine-pin.json` 을 읽어 `ciEngineRef`(있으면) 또는 `engineCommit` 을 `ref:` 로
  넘긴다. 핀이 없는 동안(R4 첫 릴리스 전)은 지금처럼 기본 브랜치. `ciEngineRef` 는 새 엔진 코드가 필요한 PR 이 잠시 쓰는 칸(브랜치나 커밋)이고,
  릴리스의 `check` 잡은 이 칸이 있으면 실패한다. 엔진 기본 브랜치가 핀보다 앞서 나가도 매일의 CI 가 흔들리지 않는다.
- `web` 잡의 `templates.test.ts` 는 그 체크아웃과 대조한다. 체크아웃에 없는 파일은 MANIFEST 가 `generated: true` 로 표시한 것만 건너뛰고,
  나머지가 없으면 실패한다 (지금은 없는 원본을 전부 조용히 건너뛴다). 생성물의 대조는 릴리스의 `check` 잡이 템플릿 묶음으로 한다.
- `web` 잡에 `yarn version:check`, `node scripts/gen-licenses.mjs --check`, `node scripts/check-web-dist.mjs` (7.5 절), 그리고
  `wrangler pages dev dist` 로 띄운 로컬 Pages 에 대한 `tests/e2e/pages.spec.ts` (7.5 절).
- `rust` 잡을 세 OS 행렬로 (`macos-latest`, `ubuntu-22.04`, `windows-latest`). Linux 는 `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`.
  `engine.rs` 의 시험은 unix 전용이라 Windows 에는 동봉 경로 이름과 안드로이드 스테이징 인자 시험을 따로 둔다.

**`release.yml` 새로**

- 트리거: `push: tags: ["v*"]`, `workflow_dispatch`(입력 `dry_run`, 기본 참: 산출물만 올리고 릴리스는 안 만든다). PR 에서
  `src-tauri/**`, `scripts/fetch-engine.mjs`, `scripts/selftest-*.mjs`, `engine-pin.json`, 이 워크플로우가 바뀌면 `dry_run` 으로 돈다.
- 잡 `check` (ubuntu): `yarn version:check --tag $GITHUB_REF_NAME`, `node scripts/gen-licenses.mjs --check`, `node scripts/check-engine-pin.mjs`
  (저장소 안의 엔진에서 온 MANIFEST 전부, 곧 `engineCommit` 을 가진 `MANIFEST.json` 을 찾아 그 커밋이 핀과 같은지. `ciEngineRef` 가 없는지.
  웹 엔진 파일이 릴리스의 `Initial2D-web.zip` 과 sha 가 같은지), 템플릿 대조(`yarn engine:fetch --templates` 로 핀의 템플릿 묶음을 풀고
  `INITIAL2D_TEMPLATES_SRC=<푼 폴더> yarn vitest run packages/app/src/editor/scene/templates.test.ts`. 이 모드에서는 생성물도 빠짐없이 대조한다).
  별도의 `sync-engine-templates.mjs --check` 는 만들지 않는다.
- 잡 `bundle` (행렬):

| 러너 | 타깃 | `--bundles` | 덮어쓰기 | 사이드카 | 자가 검사 (5절) |
|---|---|---|---|---|---|
| `macos-26` | `aarch64-apple-darwin` | `app,dmg` | dist + sidecar | 있음 | dmg 를 `hdiutil attach` 해 그 안의 `.app` 으로. 필수: 플래피 Lua, 플래피 Ruby, 타일맵 (프로세스 방식, `bundled`). 시도: 플래피 에디터 안 |
| `ubuntu-22.04` | `x86_64-unknown-linux-gnu` | `appimage,deb` | dist + sidecar | 있음 | `xvfb-run -a` 와 `APPIMAGE_EXTRACT_AND_RUN=1` 로 AppImage. macOS 와 같은 계획. deb 는 `dpkg -i` 뒤 `/usr/bin/Initial2D --version` (시간 제한, 임시 작업 폴더) |
| `windows-latest` | `x86_64-pc-windows-msvc` | `nsis` | dist | 없음 (R5 뒤 있음) | 설치 파일을 `/S` 로 무인 설치하고 설치본으로. 필수: 플래피 Lua 를 프로세스 방식으로 시작해 엔진을 못 찾고 에디터 안으로 넘어가 돈다 |

  단계: 체크아웃, Node 22 와 `yarn install --immutable`, Rust 와 타깃, (Linux) apt, `yarn engine:fetch --target <트리플>`(핀의 릴리스 자산을
  받아 sha256 확인. 사이드카와 `engine.json` 과 `src-tauri/licenses/engine/THIRD-PARTY.md`. Windows 는 고지만), `yarn tauri build ...`,
  번들 안 사이드카에 `scripts/check-sidecar.mjs`, 자가 검사 단계(`timeout-minutes: 15`), 판정 단계(`if: always()`,
  `node scripts/selftest-check.mjs --plan <계획> --report <보고서>`. **보고서가 없으면 실패**), 산출물 올리기(번들과 자가 검사 폴더 전체: 보고서, 실행별 로그, 스크린샷).
- 잡 `release` (태그이고 `dry_run` 이 아닐 때): 산출물을 모아 `SHA256SUMS.txt`, `gh release create <태그> --draft`(판에 `-` 가 있으면
  `--prerelease`). 본문은 `docs/releases/<판>.md` 가 있으면 그것, 없으면 지난 태그부터의 커밋 목록. 본문 맨 위에 서명 안 된 앱 여는 법 링크.
  **에디터의 초안을 공개하는 것은 저자다.** (엔진 릴리스는 다르다. 4.2 절)
- 산출물 이름은 Tauri 기본 그대로: `InitialEditor_<판>_aarch64.dmg`, `InitialEditor_<판>_amd64.AppImage`, `InitialEditor_<판>_amd64.deb`,
  `InitialEditor_<판>_x64-setup.exe`. `version:check` 는 이 이름들에 든 판이 태그와 같은지도 본다 (9절).

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
- 로컬 빌드에서 복사하는 `yarn sync:engine-web` 과 `yarn sync:templates` 는 개발용으로 남는다.

### 4.3 CI 가 헤드리스로 확인하는 것과 못 하는 것

| 무엇 | macOS | Linux | Windows | 방법 |
|---|---|---|---|---|
| 번들이 만들어진다 | 필수 | 필수 | 필수 | `tauri build` |
| 사이드카가 자립 실행 파일이다 | 필수 | 필수 | (R5 뒤) | `check-sidecar.mjs` 를 번들 안 파일에 |
| 설치본이 뜨고 템플릿으로 새 프로젝트를 만든다 | 필수 | 필수 (xvfb) | 필수 | 자가 검사 |
| 번들 엔진으로 플래피(Lua 와 Ruby)가 돈다 | 필수 | 필수 | (R5 뒤) | 자가 검사, 프로세스 방식, `SDL_VIDEODRIVER=dummy`, `SDL_AUDIODRIVER=dummy` |
| 맵 문서로 칠한 칸이 번들 엔진 화면에 나온다 | 필수 | 필수 | (R5 뒤) | 자가 검사, 타일맵 템플릿, `INITIAL2D_SCREENSHOT` |
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
      "edit": { "kind": "paintTile", "map": "resources/maps/start.json", "layer": 0, "x": 5, "y": 4, "tile": 31 },
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
- `check: "tilemapPixel"`: 종료 코드 0, 오류 줄 없음, `screenshot`(BMP)의 칠한 칸 (5, 4) 가운데 픽셀이 표식 색 `#c83cc8`(채널마다 ±2)이고
  이웃 칸 (6, 4) 은 그 색이 아니다. BMP 읽기는 `scripts/lib/bmp.mjs`(의존성 없음)이고 `e2e-engine-scene.mjs` 도 같이 쓴다.
- 필수 실패가 하나라도 있으면 종료 코드 1. 선택 실행의 실패는 경고 줄만.

**Windows 규칙**: 위의 Windows 계획이 필수다. WebView2 는 `windows-latest` 에서 보통 WARP 나 SwiftShader 로 WebGL 을 준다. **첫 CI 실행이
WebGL 이 없음을 로그로 보일 때만** "새 프로젝트를 만들고, 엔진을 못 찾아 에디터 안으로 넘어갔다" 까지로 필수를 줄이고, 그 로그와 판단을
이 문서에 적는다. 그 전에는 줄이지 않는다.

**CI 의 GUI 환경**: macOS 러너에는 창 서버가 있다. Linux 는 `xvfb-run -a` 이고 WebKitGTK 가 합성 모드에서 멈추면
`WEBKIT_DISABLE_DMABUF_RENDERER=1`, `WEBKIT_DISABLE_COMPOSITING_MODE=1` 을 준다. 엔진 프로세스는 `SDL_VIDEODRIVER=dummy` 라 창을 띄우지
않는다 (헤드리스 원칙).

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
android/prepare_assets.sh [--project <폴더>] [--with-rtp] [--dry-run] [--dest <폴더>]
```

- `--project` 기본값은 저장소 루트다. 폴더에 `game.json` 이 없으면 종료 코드 2.
- `--dest` 기본값은 `android/app/src/main/assets`. 시험용이며 에디터는 넘기지 않는다.
- 파일 목록은 `tools/stage_list.py --project <폴더>` 가 낸다. 규칙은 `tools/stage_rules.json` 한 장이고 **안드로이드 전용**이다.
  `tools/web_stage.py` 는 고치지 않는다 (웹 데모의 파일 목록과 골든이 그대로다. 둘을 합치면 웹 데모에 `scripts/ruby/` 와 다른 zip 이 들고
  나는 결정이 따라오는데, 안드로이드 스테이징에는 필요 없는 일이다). 셸은 그 목록대로 복사한다.
- `python3` 이 필요하다. 없으면 이유를 찍고 종료 코드 2.
- **스탬프**: 모든 파일의 (경로, sha256)을 정렬해 해시한 앞 12자로 `assets_stamp/<해시>.txt` 를 하나 만들고 목록에 넣는다. 내용만 바뀌어도
  `assets_manifest.txt` 의 바이트가 바뀌므로 `AndroidBootstrap` 이 다시 푼다. **C++ 무수정.**
- `resources/rtp/` 는 `--with-rtp` 일 때만 들어가고 그때 경고 줄: `WARN rtp: RTP 변환물이 들어간다. 이 APK 는 배포하지 않는다`.
- 마지막 줄은 기계가 읽는다: `STAGED files=<n> bytes=<b> stamp=<12자> rtp=<yes|no> dest=<경로>`. `--dry-run` 은 복사 없이
  `DRYRUN files=... bytes=... rtp=...`.
- 종료 코드: 0 성공, 1 입출력 오류, 2 인자나 프로젝트 오류.

**규칙 표** (`tools/stage_rules.json` 의 내용. `shared` 표시가 있는 줄은 에디터의 게임 탭 규칙(`gameView/staging.ts`)에도 있어야 한다)

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

인자 없는 실행(엔진 저장소 자신)도 같은 규칙이다. 그래서 두 가지가 전과 달라진다: `config.setting` 이 빠지고, RTP 변환물은 `--with-rtp` 를
줘야 들어간다. RPG 레이어는 RTP 가 없으면 플레이스홀더로 돈다. 저자가 자기 기기에서 알데바란을 RTP 그림으로 보려면 `--with-rtp` 를 준다
(엔진 `android/README.md` 에 적는다).

`resources/aldebaran/src/` 는 알데바란 한 게임의 규칙이다. 프로젝트별 제외 목록(`game.json` 의 `stage.exclude` 같은)으로 옮기는 것은
후보로 남긴다.

### 6.3 에디터

- **명령** `android.stage` "안드로이드로 스테이징": 실행 메뉴의 구분선 아래와 명령 목록. Tauri 백엔드에서만 켜지고, 다른 백엔드는 꺼 두고
  이유를 툴팁에 ("데스크톱 앱에서만 된다").
- **엔진 저장소 찾기** (`packages/app/src/editor/android/engineRepo.ts`, 순수 함수): `android/prepare_assets.sh` 가 있는 폴더를
  설정 `engineRepoPath`(새) > 열린 프로젝트 자신 > 찾은 엔진이 `<저장소>/build/Initial2D` 꼴이면 그 저장소 > 형제 `../Initial2D` 순서로.
  못 찾으면 명령은 켜 두되 누르면 이유와 "설정 열기". 스크립트를 실행하는 일이므로 설정 말고의 후보는 2.3 의 신뢰를 따른다 (신뢰하지 않은
  프로젝트면 확인 대화상자에 스크립트 경로를 보인다).
- **확인 대화상자**: 원본(프로젝트 경로), 대상(`<저장소>/android/app/src/main/assets/`, **통째로 바뀐다**), `--dry-run` 으로 미리 센
  파일 수와 크기, "RTP 변환물 넣기 (개인 기기 시험용)" 체크(기본 꺼짐, 켜면 `--with-rtp` 와 경고 한 줄). 저장 안 된 문서가 있으면 먼저 묻는다
  (저장하고 스테이징, 그대로 스테이징, 취소).
- **셸**: `engine.rs` 의 줄 펌프와 정지를 `src-tauri/src/process.rs` 로 떼어 엔진과 도구가 같이 쓴다. 새 명령
  `android_stage(repo, project, with_rtp, dry_run) -> RunInfo` 는 `bash <repo>/android/prepare_assets.sh --project <project> [...]` 를 작업
  폴더 `<repo>` 로 띄운다. 스크립트 경로는 `<repo>/android/prepare_assets.sh` 로 고정하고 인자는 정해진 목록만 만든다 (임의 명령 실행
  창구가 되지 않게). 출력은 `tool:output`, `tool:exit` 이벤트로.
- **콘솔과 토스트**: 출력은 콘솔 source `android`. 끝나면 `STAGED` 줄로 토스트("안드로이드 에셋 N개, M MB"), 콘솔에 다음 명령 셋
  (`android/app/jni/SDL2` 가 없으면 `./android/download_sdl.sh` 부터, `cd android && ./gradlew :app:assembleDebug`,
  `adb install -r app/build/outputs/apk/debug/app-debug.apk`). RTP 경고는 경고 토스트로.
- **Windows**: `bash` 를 PATH 와 `C:\Program Files\Git\bin\bash.exe` 에서 찾는다. `python3` 도 찾는다. Git for Windows 의 bash 는 Python 을
  싣지 않고, `python3` 이 Microsoft Store 로 넘기는 가짜 실행 파일일 수 있으므로 `python3 -c "import sys; print(sys.version_info[0])"` 가 `3` 을
  내는지로 판단한다. 둘 중 하나라도 없으면 이유("Git for Windows 의 bash 가 필요하다", "Python 3 이 필요하다"). 경로는 `/` 로 바꿔 넘긴다.
  실기는 저자.

### 6.4 검증

- 엔진: `tests/tools/prepare_assets_test.sh` (임시 프로젝트 둘. 목록이 규칙 표와 같다, 점 파일과 zip 과 psd 와 `config.setting` 이 빠진다,
  `--with-rtp` 일 때만 RTP 가 들고 경고 줄이 나온다, 스탬프가 내용 변경에 바뀌고 무변경이면 같다, 인자 없는 실행이 규칙 표와 같다,
  `web_stage.py` 의 출력 목록이 이 작업 전과 같다). `tests/run_all.sh` 에 넣는다.
- 에디터 단위: 저장소 찾기, `STAGED` 줄 해석, 대화상자 문구, `python3` 판단. 엔진 저장소가 있으면 `stage_rules.json` 의 `shared` 줄이
  `staging.ts` 에 모두 있는지 (없으면 건너뛴다). Rust: 가짜 스크립트로 인자와 작업 폴더, 스크립트 경로를 바꾸려는 시도 거부.
  e2e: 메모리 모드에서 명령이 꺼져 있고 이유가 보인다.
- **교차 검사** `yarn test:android-stage` (`scripts/e2e-android-stage.mjs`): 템플릿으로 플래피 프로젝트를 만들고, 엔진 저장소의
  스크립트를 에디터 명령과 같은 인자에 `--dest <임시 폴더>` 를 더해 돌리고, `assets_manifest.txt` 대로 다른 임시 폴더에 푼 뒤
  (AndroidBootstrap 과 같은 규칙) 그 폴더를 작업 폴더로 데스크톱 엔진을 헤드리스로 돌려 플래피 검사를 통과한다. "스테이징한 것만으로
  게임이 돈다" 를 테스트가 본다. 한 파일의 내용만 바꿔 다시 돌리면 스탬프가 다르다.
- 실기 (선택): 저자가 APK 를 빌드해 기기에서 플래피가 돈다.

## 7. 웹판 (Cloudflare Pages)

### 7.1 Tauri 앱과의 관계

같은 커밋의 같은 `dist/` 다. 코드는 `ProjectBackend` 구현과 실행 방식만 다르다 (index.md 2절의 결정). 웹판은 설치 없이 써 보기와
가벼운 편집, Tauri 앱은 완전판이다.

| 기능 | 웹판 | 데스크톱 앱 |
|---|---|---|
| 폴더 열기와 저장 | 크로미움 계열만 (File System Access). 나머지는 메모리 샘플 | 전부 |
| 새 프로젝트 | 폴더를 열 수 있는 브라우저에서 된다 (고른 로컬 폴더에 템플릿을 쓴다). 메모리와 브리지 모드는 안 된다 | 된다 |
| 실행 | 에디터 안 (웹 엔진, Lua 만) | 프로세스(동봉 엔진, Lua 와 Ruby) 또는 에디터 안 |
| 안드로이드 스테이징 | 안 된다 | 된다 (엔진 저장소가 있을 때) |
| 판 | 프로덕션 브랜치의 마지막 배포 | 마지막 릴리스 |

새 프로젝트를 막는 것은 플랫폼 한계가 아니라 `appCommands.ts` 의 `enabled: () => !browser` 였다. 이 단계에서
`enabled: () => editor.backend.capabilities.pickFolder` 로 바꾼다 (Tauri 와 브라우저 폴더 백엔드는 참, 메모리와 브리지는 거짓). 웹판의 새 프로젝트
대화상자는 언어에서 Ruby 를 고르면 "웹판에서는 실행하지 못한다 (데스크톱 앱에서 돈다)" 를 보인다. 설치 없이 써 보는 사람의 첫걸음이
"로컬 폴더에 플래피나 타일맵 프로젝트 만들기" 이기 때문이다.

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
- 정보 창(`components/AboutDialog.tsx`): 판, 커밋, 웹 엔진 커밋, 제3자 고지. 웹판이면 "데스크톱 앱 받기", 데스크톱이면 "웹판 열기".
- **링크 열기**: 데스크톱의 모든 바깥 링크(정보 창, 시작 화면, 업데이트 토스트)는 `tauri-plugin-opener` 의 `openUrl` 을 거친다. 권한은
  `opener:allow-open-url` 을 `https://github.com/biud436/*` 와 웹판 주소로 좁힌다. 브라우저에서는 `window.open`. 지금의
  `<a target="_blank">` 는 Tauri 웹뷰에서 아무 일도 하지 않는다. 링크 하나를 여는 함수(`openExternal`)를 두고 단위 시험으로 두 모드를 본다.

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
- **빌드 도장**: `__APP_COMMIT__`(Vite define). `GITHUB_SHA` > `CF_PAGES_COMMIT_SHA` > `git rev-parse --short HEAD` > "dev".
- **엔진 판과의 짝**: 한 에디터 판은 한 엔진 릴리스에 묶인다 (`engine-pin.json`). 릴리스의 `check` 잡이 동봉 엔진, 웹 엔진, 템플릿, 그리고
  저장소 안의 엔진에서 온 다른 사본(E5 의 ext-rpg 픽스처)이 같은 엔진 커밋에서 왔는지 대조한다 (4.1 절). 동봉 엔진의 `--version` 커밋은
  `check-sidecar.mjs` 가 번들 안 파일에서 본다.
- **프로젝트 쪽 짝**: 프로젝트는 만들 때의 씬 로더 사본을 가진다. 엔진 C++ API 가 그대로면 새 엔진에서도 돈다. 앱의 템플릿과 프로젝트의
  `common` 그룹 파일이 다르면 알리고 갱신하는 명령은 후보로 남긴다 (이 문서 끝).
- **업데이트 확인**: 첫 판은 자동 업데이트가 없다. 도움말 > "업데이트 확인" 이 GitHub API(`repos/biud436/InitialEditor/releases`)에서 최신 태그를
  읽어, 지금 판보다 새로우면 릴리스 페이지 링크를 토스트로 준다 (링크는 7.4 의 `openExternal`). 시작할 때의 자동 확인은 설정 `checkUpdates`
  (기본 꺼짐), 프리릴리스를 볼지는 설정 `updateChannel`(`stable`, `prerelease`). 코드는 `packages/app/src/editor/update/`: 판 비교는 순수 함수
  (`2.0.0-alpha.2 > 2.0.0-alpha.1`, `2.0.0 > 2.0.0-rc.1`, 채널 거르기, 초안 무시)이고 API 응답은 주입한 `fetch` 로 받는다. 단위 시험이
  둘을 다 본다 (가짜 응답: 새 판 있음, 없음, 프리릴리스만 있음, 네트워크 실패).
- **자동 업데이트**(`tauri-plugin-updater`, `latest.json`)는 서명 결정 뒤다. 업데이트 서명 키(minisign)는 OS 서명과 별개라 지금도 되지만,
  서명 안 된 macOS 앱이 스스로를 바꾸는 흐름은 Gatekeeper 와 얽혀 실기 확인이 먼저다.
- **`identifier` 는 고정한다.** 바꾸면 설정 폴더와 웹뷰 저장소(localStorage, IndexedDB 의 기억한 폴더)가 새로 시작된다.

## 작업 항목

### 마일스톤 1: 번들 설정과 세 OS 빌드 (에디터)

- [ ] `src-tauri/tauri.conf.json` 번들 칸 (게시자, 저작권, 설명, 홈페이지, 라이선스, macOS 최소 11.0 과 ad-hoc 서명, NSIS 사용자 설치와 언어, WebView2 설치 방식), `version` 을 `"../package.json"` 으로
- [ ] 루트 `LICENSE` (저자 확인 뒤), `src-tauri/licenses/` (`LICENSE`, `THIRD-PARTY-editor.md` 커밋, `engine/` 은 gitignore), `scripts/gen-licenses.mjs` 와 `--check`
- [ ] `yarn build:desktop` (`VITE_SOURCEMAP=0`, `vite.config.ts` 가 읽는다. 겹쳐 적힌 `emptyOutDir` 도 정리), `src-tauri/tauri.dist.conf.json`
- [ ] `scripts/version.mjs` (`yarn version:set`, `yarn version:check`: package.json 일곱, `Cargo.toml`, `Cargo.lock`, `tauri.conf.json` 의 경로 칸) 와 `ci.yml` 의 대조
- [ ] `ci.yml` 의 `rust` 잡을 세 OS 로. Windows 전용 시험 (엔진 후보의 역슬래시 경로, 동봉 실행 파일 이름)
- [ ] `release.yml` 의 `bundle` 잡을 `dry_run` 으로 세 OS 에서 돌려 dmg, AppImage, deb, NSIS 가 나온다 (사이드카 없이, `licenses/` 는 커밋한 것만으로). NSIS 가 프리릴리스 판 문자열을 받는지 여기서 확인한다
- [ ] Linux 와 Windows 에서 앱이 뜨는 것까지 확인 (자가 검사의 새 프로젝트 단계만 먼저 구현해 쓴다)

### 마일스톤 2: 엔진 R4, 배포용 엔진 빌드와 템플릿 묶음 (엔진 저장소)

- [ ] `tools/sdl_versions.sh`, `tools/fetch_sdl_src.sh`, `android/download_sdl.sh` 가 같은 판 번호를 읽는다
- [ ] `CMakeLists.txt` 의 `INITIAL2D_VENDORED_SDL` 과 3.1 표의 캐시 값 전부 (정적, ImageIO 끔, 의존 공유 끔, 포맷 스위치, Linux 의 dlopen 기본값 유지), `MRUBY_ROOT` 힌트, 배포 대상 11.0, 판 생성 헤더
- [ ] `tools/build_mruby.sh` (`MACOSX_DEPLOYMENT_TARGET=11.0`, `mruby-config --cflags` 의 정의를 엔진이 그대로)
- [ ] `sdl2Main.cpp` 의 `--version` 과 모르는 `--` 인자의 종료 코드 2
- [ ] `tools/build_dist.sh`, `tools/check_dist.sh` (시간 제한과 임시 작업 폴더, `minos` 11.0, `--bogus` 가 2)
- [ ] `THIRD-PARTY.md`
- [ ] 타일맵 템플릿 `resources/templates/tilemap/` (`tools/gen_template_tiles.py` 로 한 번 그려 커밋한 타일셋, `mapfile.py` 형식의 맵, 씬, 스키마)와 `tests/tools/templates_test.py`
- [ ] `tools/templates_list.txt`, `tools/pack_templates.py` (`generated` 표시, 빠진 파일이면 실패)
- [ ] macOS: 배포용 실행 파일로 전체 씬 검수 통과 (`python3 tests/run_engine_tests.py dist/Initial2D-aarch64-apple-darwin`). Linux: 플래피 씬 넷
- [ ] `.github/workflows/dist.yml` (native 둘, web, release 는 곧바로 공개하고 `-` 판은 프리릴리스)와 첫 태그 `v2.0.0-alpha.1`
- [ ] 기존 `tests.yml` 과 전체 검수가 무변경으로 통과한다 (Homebrew 빌드 경로는 그대로)
- [ ] 엔진 문서 `docs/plans/r4-dist-build.md`, index 8절의 R4 행, README 의 "배포용 빌드"

### 마일스톤 3: 사이드카 동봉, 찾기와 신뢰, 템플릿 (에디터)

- [ ] `engine-pin.json` (`ciEngineRef` 칸 포함), `scripts/fetch-engine.mjs` (`yarn engine:fetch [--target <트리플>] [--from <엔진 dist 폴더>] [--templates]`, 공개 자산 주소, sha256 확인, `src-tauri/licenses/engine/THIRD-PARTY.md`), `yarn engine:pin <태그>` (네이티브 핀, 웹 엔진과 고지, 템플릿을 같은 릴리스로. 체크아웃에서 오는 MANIFEST 는 커밋 확인 뒤 다시 동기화)
- [ ] 엔진에서 온 MANIFEST 모두에 `source` 와 `syncCommand`, 커밋은 40자. `scripts/check-engine-pin.mjs` (`yarn engine:check`)
- [ ] `sync-engine-templates.mjs --from-zip`, 템플릿 MANIFEST 의 `generated` 표시 (로컬 체크아웃에서 복사할 때는 `git ls-files` 로 정한다)
- [ ] `templates.test.ts`: 체크아웃 대조에서 `generated` 만 건너뛰고, `INITIAL2D_TEMPLATES_SRC` 가 있으면 빠짐없이 대조
- [ ] 타일맵 템플릿: `sync-engine-templates.mjs` 의 목록(그룹 `tilemap`, 진입 파일 둘은 `empty`, `flappy`, `tilemap`), `ProjectTemplateId` 와 `TEMPLATE_LABELS`("타일맵"), `TEMPLATE_START_SCENE`, 새 프로젝트 대화상자
- [ ] `scripts/e2e-engine-scene.mjs`: `INITIAL2D_EXE` 를 받고, 타일맵 템플릿(Lua, Ruby)을 쓰고 ext-tilemap 모델로 한 칸을 칠해 저장한 뒤 스크린샷의 그 칸이 표식 색인지 본다 (`scripts/lib/bmp.mjs`). `INITIAL2D_EXE=src-tauri/binaries/Initial2D-<트리플> yarn test:engine-scene` 통과
- [ ] `src-tauri/tauri.sidecar.conf.json`, `.gitignore` 에 `src-tauri/binaries/` 와 `src-tauri/licenses/engine/`
- [ ] `src-tauri/src/bundled.rs` 와 명령 `engine_bundled`, `cargo test` (파일이 있을 때와 없을 때, `engine.json` 이 깨졌을 때)
- [ ] `engine.rs`: `features(exe, timeout)` 와 임시 작업 폴더, `engine_features(exe, timeout_ms)`, `engine_exists(paths)`. `cargo test` (늦게 답하는 스크립트가 기본 시간에는 실패하고 15초에는 통과, 작업 폴더에 파일을 쓰는 스크립트가 프로젝트에 쓰지 못한다)
- [ ] 백엔드 `engineFeatures(exe, { timeoutMs })`, `engineExists(paths)`, `RunnerOptions.probe(exe, opts)`
- [ ] `engineCandidates.ts` 에 `bundled` (2.3 의 순서)와 후보마다 `needsTrust`, `ENGINE_SOURCE_LABELS`, 단위 시험 (세 OS 경로)
- [ ] 신뢰 규칙: 설정 `engineTrust`, 확인 대화상자(실행 파일 경로를 보인다), 설정 대화상자의 "신뢰 취소". 단위 시험: 신뢰하지 않은 프로젝트를 열면 프로젝트 안과 형제 경로를 `probe` 하지 않는다, 허용 뒤 순서대로, 거절 기억, 경로가 바뀌면 다시 묻기
- [ ] `RunnerStore`: `StartOptions.mode`, 동봉 후보의 시간 제한 15초와 재시도, 다 못 찾으면 에디터 안으로 넘어가기와 한 줄 알림 (mruby 프로젝트는 이유), 넘어간 사실을 실행 정보에. 단위 시험
- [ ] 상태 바 툴팁, 설정 대화상자의 "찾은 엔진" 줄, 정보 창의 엔진 판 (`engine.json` 에서)
- [ ] 새 프로젝트의 `.gitignore` 에 `config.setting` (`scene/projectTemplates.ts` 의 `GITIGNORE_TEXT`)
- [ ] `scripts/check-sidecar.mjs` (번들 안 사이드카의 동적 의존 허용 목록, `--features`, `--version` 커밋이 핀과 같다. 실행은 시간 제한과 버리는 작업 폴더에서)
- [ ] `ci.yml` 의 엔진 체크아웃을 핀의 커밋으로 (`ciEngineRef` 우선, 핀이 없으면 기본 브랜치)

### 마일스톤 4: 자가 검사, 보안 정책, 릴리스 (에디터)

- [ ] 셸: `setup` 의 계획 읽기(환경 변수 경로만), `workDir` 과 프로젝트 폴더 만들기(있으면 계획 오류), 전체 시간 감시 스레드, 명령 `selftest_plan`, `selftest_progress`, `selftest_write_log`(`logs/` 안 단순 이름만), `selftest_finish(reportJson, code)`(계획의 `report` 에 쓴다). `cargo test` (폴더가 있으면 2, 감시가 보고서를 쓰고 1, 로그 이름의 경로 탈출 거부)
- [ ] `lib.rs`: 창 `main` 을 `create: false` 뒤 셸이 만들기, 자가 검사면 `showWindow` 대로 보임과 `window-state` 빼기
- [ ] 앱 격리: 자가 검사면 `MemorySettingsStorage`, 메모리 레이아웃, 모달이 뜨면 실패. 단위 시험 (설정 저장소에 쓰기가 한 번도 없다, 최근 프로젝트가 바뀌지 않는다)
- [ ] 앱: `packages/app/src/editor/selftest/` (대화상자 없는 새 프로젝트, 열기, 진입 스크립트 열기, `edit` 을 맵 문서의 명령과 저장으로, 실행 목록과 `mode` 넘기기, 시간 제한, 실행별 전체 로그, 보고서, `securitypolicyviolation` 수집). 단위 시험은 가짜 백엔드와 가짜 러너로
- [ ] CSP (2.5): `tauri.conf.json` 의 `csp` 와 `devCsp`, `pixi.js/unsafe-eval` 들여오기. 첫 CI 실행의 위반 목록으로 정책을 고치고 2.5 절에 적는다
- [ ] `scripts/selftest-plan.mjs` (macOS, Linux, Windows, 로컬, `--embedded`), `scripts/selftest-check.mjs` (`--plan`, `--report`, 전체 로그와 BMP 를 읽는다, 보고서가 없으면 1), `scripts/lib/flappyChecks.mjs` 와 `scripts/lib/bmp.mjs` (`e2e-engine-scene.mjs` 와 공용). 판정 스크립트의 단위 시험 (가짜 보고서와 로그: 초반 줄이 로그에만 있는 경우 통과, 로그가 없으면 실패, 넘어감 기대가 어긋나면 실패)
- [ ] `release.yml` 의 자가 검사 단계 (macOS 는 dmg 안의 앱, Linux 는 xvfb 와 AppImage, Windows 는 무인 설치본), `timeout-minutes`, `if: always()` 판정, 자가 검사 폴더 전체를 산출물로
- [ ] `release.yml` 의 `check` 잡 (판, 고지, `check-engine-pin.mjs`, 템플릿 묶음에 대한 `templates.test.ts`)과 `release` 잡 (`SHA256SUMS.txt`, 초안, 프리릴리스 판정), `docs/releases/` 틀
- [ ] 로컬에서 같은 검사: `yarn selftest:app <빌드한 앱 경로> [--embedded]` (저자가 CI 없이 돌린다. 기본은 창이 뜨지 않는다)
- [ ] 첫 초안 릴리스 `v2.0.0-alpha.1` (공개는 저자)

### 마일스톤 5: 안드로이드 스테이징 (엔진 짝과 에디터)

- [ ] 엔진: `tools/stage_rules.json`(안드로이드 전용, `shared` 표시), `tools/stage_list.py`. `tools/web_stage.py` 는 무수정
- [ ] 엔진: `prepare_assets.sh` 의 `--project`, `--with-rtp`, `--dry-run`, `--dest`, `python3` 확인, 스탬프, 경고 줄, `STAGED` 줄, `config.setting` 빼기
- [ ] 엔진: `tests/tools/prepare_assets_test.sh` 를 `tests/run_all.sh` 에, `android/README.md` 사용법 (`--with-rtp` 포함)
- [ ] 에디터: `stage_rules.json` 의 `shared` 줄이 `gameView/staging.ts` 에 있는지 보는 시험 (엔진 저장소가 있을 때, 없으면 건너뛴다)
- [ ] 에디터: `src-tauri/src/process.rs` 로 줄 펌프와 정지 떼기 (엔진 시험 무변경), `android_stage` 명령과 시험
- [ ] 에디터: `packages/app/src/editor/android/` (저장소 찾기와 신뢰, `AndroidStageStore`, 명령 `android.stage`, 확인 대화상자, Windows 의 bash 와 `python3` 찾기, 콘솔 source `android`, 토스트), 설정 `engineRepoPath`
- [ ] 교차 검사 `yarn test:android-stage` (`scripts/e2e-android-stage.mjs`)
- [ ] 실기 (선택): 저자가 APK 로 플래피

### 마일스톤 6: 웹판과 링크 (에디터)

- [ ] `packages/app/public/_headers`, `scripts/check-web-dist.mjs` 를 CI 에
- [ ] CI `web` 잡의 `wrangler pages dev dist` 와 그 주소에 대한 `tests/e2e/pages.spec.ts`
- [ ] 샘플 진입 파일(Lua, Ruby)이 `meadow.json` 을 그린다. `game-view.spec.ts` 메모리 모드 검사를 맵 기준으로. `pages.spec.ts` 의 칠하기, 저장, F5, 그 칸의 캡처 차이
- [ ] 새 프로젝트를 `backend.capabilities.pickFolder` 로 켜기 (브라우저 폴더 백엔드에서 된다), 웹판 대화상자의 Ruby 안내. `web-folder.spec.ts` 에 새 플래피 프로젝트를 만들어 F5 로 도는 경우
- [ ] `tauri-plugin-opener` 와 좁은 권한, `openExternal` 과 그 단위 시험, 정보 창과 시작 화면의 모든 바깥 링크를 그리로
- [ ] `__APP_COMMIT__` 과 정보 창 (판, 커밋, 웹 엔진 커밋, 제3자 고지, 데스크톱 앱 받기 또는 웹판 열기)
- [ ] 시작 화면: 데스크톱 앱 받기, 웹판에서 안 되는 것, 샘플이 맵을 연 채로 뜨고 "타일을 칠하고 F5" 안내
- [ ] `.github/workflows/pages-smoke.yml` (저자가 배포 주소로 누른다)
- [ ] Pages 설정 표를 README 에. 프로덕션 브랜치 정리 (저자 결정 뒤)

### 마일스톤 7: 업데이트 확인과 문서

- [ ] 도움말 > 업데이트 확인, 설정 `checkUpdates`, `updateChannel`, `packages/app/src/editor/update/` 와 단위 시험 (판 비교, 가짜 API 응답 넷)
- [ ] 에디터 README (사용법만, 저자 문체): 설치(세 OS, 서명 안 된 앱 열기), 개발 중 동봉 엔진 시험(`yarn engine:fetch [--from]` 과 `yarn tauri dev --config src-tauri/tauri.sidecar.conf.json`), 릴리스 방법(`yarn version:set`, `yarn version:check`, `yarn engine:pin`, `yarn engine:check`, `ciEngineRef`, 태그, 초안 공개, `main` 빨리 감기), 로컬 자가 검사(`yarn selftest:app`), 신뢰 확인, 웹판(Pages 표, `check-web-dist`, 로컬 `wrangler pages dev`, `pages-smoke.yml`), 새 프로젝트 템플릿 셋, 안드로이드 스테이징(`yarn test:android-stage` 포함), 제3자 고지(`gen-licenses.mjs`)
- [ ] 엔진 README: 배포용 빌드(`build_dist.sh`, `check_dist.sh`, `pack_templates.py`), 모르는 인자의 종료 코드, `prepare_assets.sh --project` 와 `--with-rtp`, 에디터가 받는 엔진 릴리스(곧바로 공개)
- [ ] `docs/plans/index.md`: 4절 표의 E6 행을 이 문서로, 5절 후보에서 E6 빼기, 진행 상황에 E6 과 R4 (와 R5) 행, mermaid 그래프에 `R4[R4. 엔진: 배포용 빌드] --> E6` 와 `E3 --> E6`(타일맵 템플릿이 맵 편집에 기댄다)를 더하고 `E5 -.-> E6` 는 지운다 (E5 는 병행). 03 문서 4절의 탐색 순서와 신뢰 규칙, 01 문서 6절의 "shell 플러그인" 줄을 이 문서에 맞춘다

### 마일스톤 8 (저자 결정 뒤, 완료 기준 밖): 서명, 자동 업데이트, Windows 엔진

- [ ] macOS 서명과 공증 (CI 비밀)
- [ ] Windows 서명
- [ ] `tauri-plugin-updater` 와 `latest.json`
- [ ] R5 뒤 Windows 사이드카 (`x86_64-pc-windows-msvc` 를 핀과 행렬에), Windows 자가 검사를 macOS 와 같은 계획으로

## 완료 기준

- [ ] `v*` 태그 하나로 `release.yml` 이 macOS(dmg), Linux(AppImage, deb), Windows(NSIS) 번들과 `SHA256SUMS.txt` 를 초안 릴리스에 올린다
- [ ] **CI 의 macOS 와 Linux 설치본이 자가 검사를 통과한다.** 메모리 설정으로 격리된 채, 번들에 든 템플릿으로 새 프로젝트 셋을 만든다. 플래피 Lua 와 플래피 Ruby 는 엔진 후보 탐색이 `bundled` 를 고르고, 그 엔진이 자동 시연 900틱을 돌아 종료 코드 0, 전체 로그에 상태 전이 셋과 `flappyFinal ... ticks=900` 과 `best >= 1`, 오류 줄 없음. 타일맵은 맵 문서에서 칠하고 저장한 칸이 번들 엔진의 스크린샷에서 표식 색이다. 보안 정책 위반이 없다. **에디터가 만들고 칠한 프로젝트를 번들 엔진이 실제로 돈다**
- [ ] CI 의 Windows 설치본이 무인 설치 뒤 새 플래피 프로젝트를 만들고, 프로세스 방식으로 시작해 엔진을 못 찾고 에디터 안(웹 엔진)으로 넘어가 같은 플래피 검사를 통과한다. 첫 CI 실행이 WebGL 이 없음을 로그로 보일 때만 넘어감까지로 줄이고 그 로그를 이 문서에 적는다
- [ ] 판 대조: 동봉 엔진의 `--version` 커밋, `engine-pin.json`, 웹 엔진 MANIFEST, 템플릿 MANIFEST, 저장소 안의 다른 엔진 사본 MANIFEST 의 커밋이 같고, 앱의 템플릿이 핀의 템플릿 묶음과 생성물까지 sha 가 같고, `ciEngineRef` 가 비어 있다 (릴리스 `check` 잡)
- [ ] 동봉 엔진이 자립 실행 파일이다 (번들 안 파일에 대한 `check-sidecar.mjs`: Homebrew 경로 없음, 허용 목록 밖 의존 없음)
- [ ] 신뢰: 신뢰하지 않은 프로젝트를 열면 프로젝트 안과 형제 경로의 실행 파일을 한 번도 부르지 않고(단위 시험), 확인 대화상자는 실행 파일의 절대 경로를 보이고, 답은 앱 설정에만 남는다
- [ ] 안드로이드: `yarn test:android-stage` 가 통과한다. 에디터 명령과 같은 인자로 스테이징한 폴더만으로 데스크톱 엔진이 플래피 검사를 통과하고, 내용만 바꾼 두 번째 스테이징의 스탬프가 다르고, `config.setting` 과 (기본) RTP 변환물이 들어가지 않는다
- [ ] 웹판: `check-web-dist` 와 `wrangler pages dev dist` 에 대한 `pages.spec.ts` 가 CI 에서 통과한다 (wasm 의 content-type, 샘플 실행, 칠한 칸이 게임 탭에 보인다, 스트리밍 실패 줄 없음). 폴더를 열 수 있는 브라우저에서 새 플래피 프로젝트가 만들어지고 F5 로 돈다 (`web-folder.spec.ts`)
- [ ] 업데이트 확인의 판 비교와 가짜 API 응답 단위 시험이 통과하고, 바깥 링크가 opener 를 거친다
- [ ] 저자 실기: macOS 에서 초안 릴리스의 dmg 를 받아 README 대로 열고, "타일맵" 템플릿으로 새 프로젝트를 만들어 한 칸을 칠하고 F5 로 칠한 맵이 뜬다 (상태 바에 "앱에 든 엔진"). 엔진 저장소를 열면 신뢰 확인 한 번 뒤 그 저장소의 `build/` 가 쓰이고 알데바란이 돈다
- [ ] 두 저장소의 README 에 마일스톤 7 의 목록이 모두 있다 (새 yarn 명령과 워크플로우 전부: `engine:fetch`, `engine:pin`, `engine:check`, `version:set`, `version:check`, `selftest:app`, `test:android-stage`, `check-web-dist`, 로컬 `wrangler pages dev`, `gen-licenses`, 엔진의 `build_dist.sh`, `check_dist.sh`, `pack_templates.py`, `prepare_assets.sh` 의 새 인자)

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
- **템플릿의 생성물.** 플래피 그림 넷은 엔진이 추적하지 않고 Pillow 판에 따라 바이트가 다를 수 있다. 대응: 원천을 릴리스의 템플릿 묶음 하나로 정하고(검수에 쓴 그 그림), 매일의 CI 는 생성물만 표시된 대로 건너뛴다. 커밋으로 추적하는 안은 기각했다: dist.yml 이 그림을 다시 만들면 추적 파일이 바뀌어 판 헤더가 `--dirty` 가 되고, `.gitignore` 의 `resources/*.*` 에 예외가 쌓인다.
- **CI 의 소리.** 오디오 장치가 없는 러너에서 `SDL_Init` 이 소리 때문에 실패할 수 있다. 대응: 모든 프로세스 실행과 엔진 검수에 `SDL_AUDIODRIVER=dummy`.
- **Windows 경로.** 설치 폴더(`%LOCALAPPDATA%\InitialEditor`), 공백과 한글 사용자 이름, 역슬래시, 260자 한도. 대응: `engineCandidates.ts` 는 이미 역슬래시를 다루고 Rust 는 `PathBuf` 만 쓴다. 안드로이드 스테이징의 Git Bash 는 `C:\` 인자를 바꾸려 들므로 `/` 로 바꿔 넘긴다. Python 은 Store 가짜 실행 파일을 가려낸다. Windows 실기는 저자.
- **Windows 엔진 부재.** R5 가 저자 결정에 막히면 Windows 는 계속 Lua 만, 에디터 안에서만 돈다. 대응: 이 문서의 완료 기준은 그것을 전제로 하고, 그 길(넘어감과 플래피)을 CI 가 필수로 본다.
- **CI 의 GUI.** Linux xvfb 의 WebKitGTK, AppImage 의 FUSE(`APPIMAGE_EXTRACT_AND_RUN=1`), 러너의 WebGL, 숨은 창의 프레임 멈춤. 대응: 프로세스 방식을 필수로, 에디터 안은 macOS 와 Linux 에서 시도로 둔다. 에디터 안 실행이 있는 계획만 창을 보인다. Windows 는 넘어감 뒤의 에디터 안 실행이 필수이고, 줄이는 것은 첫 실행의 로그가 보일 때만이다.
- **보안 정책이 기능을 막음.** CSP 가 Monaco 워커, PIXI, 웹 엔진을 막을 수 있다. 대응: 자가 검사가 셋을 모두 열고 위반을 실패로 친다. 개발 중에도 `devCsp` 로 같은 정책을 본다.
- **자가 검사의 멈춤.** 프런트가 멈추거나 죽으면 앱이 끝나지 않는다. 대응: 셸의 전체 시간 감시가 보고서를 쓰고 끝내고, CI 단계의 `timeout-minutes` 와 "보고서가 없으면 실패" 가 겹으로 막는다.
- **판 어긋남.** 동봉 엔진, 웹 엔진, 템플릿, ext-rpg 픽스처, 프로젝트의 런타임 스크립트가 서로 다른 엔진 커밋에서 올 수 있다. 대응: `engine-pin.json` 한 장, `engine:pin` 한 명령, `check` 잡. 핀이 개발을 막는 것은 `ciEngineRef` 로 풀고 릴리스에서는 막는다. 프로젝트 쪽은 후보(런타임 갱신 명령).
- **Pages 빌드 환경.** Yarn Berry, Node 판, `_headers` 문법 실수. 대응: `.node-version`, `yarnPath`, `check-web-dist`, CI 의 `wrangler pages dev` 로 헤더까지 배포 전에 본다.
- **라이선스.** 엔진 저장소에 LICENSE 가 없어 엔진 바이너리를 배포할 근거가 없다. 나눔고딕(OFL)은 고지가 필요하다. 대응: 저자 결정, `THIRD-PARTY.md`, `licenses/`. RTP 변환물은 `--with-rtp` 로만 APK 에 들어가고 경고 줄이 붙는다.
- **엔진의 실행 부작용.** 엔진이 프로젝트 루트에 `config.setting` 을 쓴다 (실행 파일 경로가 들어가 사람마다 다르다). 대응: 새 프로젝트의 `.gitignore`, 안드로이드 스테이징에서 빼기, 탐색의 임시 작업 폴더. 엔진 쪽에서 없애는 것은 C++ 변경이라 이 단계에서는 하지 않는다.
- **`identifier` 변경.** 설정과 기억한 폴더를 잃는다. 대응: 고정 (9절).

## 결정 기록 (2026-09-27)

초안이 저자에게 물은 열한 가지를 저자가 자리에 없는 동안 리드가 정했다. 바깥으로 나가는 일(공개 릴리스, 태그, 라이선스, 서명, Pages 설정)은
정하지 않고 저자에게 남긴다. **이 표가 본문과 어긋나면 이 표가 이기고, 구현하는 쪽이 본문을 이 표에 맞춰 고친다.**

| 물음 | 결정 |
|---|---|
| 서명과 공증 | 이 단계는 서명 없이(macOS ad-hoc) 만든다. 서명과 공증은 마일스톤 8, 저자 결정 |
| 라이선스 | 저장소에 `LICENSE` 를 더하지 않고 `tauri.conf.json` 에 `license` 칸도 두지 않는다 (저자 결정). 제3자 고지(`THIRD-PARTY-editor.md`, 엔진 `THIRD-PARTY.md`)는 만든다. 고지는 의무이고 라이선스 선택이 아니기 때문이다 |
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
