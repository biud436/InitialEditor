<div align="center">

![LOGO](https://repository-images.githubusercontent.com/294916739/2f3b679c-ef74-43a7-9d9d-9c08982e3db1)

![typescript](https://img.shields.io/badge/typescript-5-green.svg?logo=typescript&style=for-the-badge)
![react](https://img.shields.io/badge/react-18-green.svg?logo=react&style=for-the-badge)
![tauri](https://img.shields.io/badge/tauri-2-green.svg?logo=tauri&style=for-the-badge)

</div>

# InitialEditor

[Initial2D](https://github.com/biud436/Initial2D) 엔진으로 게임을 만드는 에디터입니다. 프로젝트(폴더)를 열고,
스크립트를 쓰고, 씬에 오브젝트를 놓고, 실행 버튼을 누르면 엔진에서 그 게임이 돕니다. 에디터 코어는 장르를
모르고, 타일맵과 RPG 이벤트는 확장이 더합니다. 계획과 진행 상황은 [docs/plans/index.md](./docs/plans/index.md)에
있습니다 (지금은 E0 토대 단계).

두 가지 모드로 돕니다.

| 모드 | 무엇 | 로컬 파일 | 엔진 실행 |
|---|---|---|---|
| **Tauri 앱** (제품) | macOS, Windows, Linux 데스크톱 앱 | 직접 (폴더 선택, 감시, 원자적 저장) | 엔진 실행 파일을 띄운다 (E1). 설정에서 에디터 안(E4)으로 바꿀 수 있다 |
| **브라우저** (개발) | Vite dev 서버 + 엔진 저장소의 브리지 서버 | 브리지 서버(`127.0.0.1:5960`)를 거쳐서 | 에디터 안 게임 탭 (웹 엔진, E4) |

브라우저 모드에는 서버 없이 도는 **메모리 모드**(`?backend=memory`)도 있어, UI 작업과 스모크 테스트에 씁니다.

## 시작하기

Node 22 이상(브라우저 모드 테스트가 전역 `WebSocket`을 쓴다), Yarn(저장소에 든 Berry 4.3.1, `.yarn/releases/`. 전역 `yarn` 이 1.x 여도 이것으로 넘깁니다), Tauri 앱을 빌드하려면 Rust 안정판과
플랫폼별 준비물([docs/plans/01-tech-stack.md](./docs/plans/01-tech-stack.md) 7절)이 필요합니다.

```sh
yarn install

# 브라우저 모드 (엔진 저장소가 옆 폴더에 있다고 가정)
INITIAL2D_HMR=1 ../Initial2D/build/Initial2D &              # 1. 게임을 핫 리로드 켜고 실행 (선택)
node ../Initial2D/tools/bridge/server.js --project ../Initial2D  # 2. 브리지 서버 (127.0.0.1:5960)
yarn dev                                                     # 3. http://127.0.0.1:5173

# 메모리 모드 (서버 없음)
VITE_DEFAULT_BACKEND=memory yarn dev      # 또는 http://127.0.0.1:5173/?backend=memory

# Tauri 앱
yarn tauri dev                            # 개발 (Vite dev 서버를 함께 띄운다)
yarn tauri build                          # 번들 (src-tauri/target/release/bundle/)
INITIAL_EDITOR_OPEN=~/mygame yarn tauri dev   # 시작하자마자 그 폴더를 연다 (--open <폴더> 인자도 같다)
```

브리지 서버는 엔진 저장소의 `tools/bridge/server.js`(0.2.0 이상)이며 프로젝트의 `scripts/`, `resources/`,
`.initial-editor/`와 루트의 `game.json`만 읽고 씁니다. 사용법은 엔진 README의 "에디터 브리지 서버" 절에 있습니다.

## 스크립트 쓰기와 실행 (E1)

- 프로젝트 패널에서 `.lua`, `.rb`, `.json` 을 열면 Monaco 편집기가 뜹니다. Ctrl+S 로 저장하면 (설정이 켜져 있으면) 실행 중인 게임에 핫 리로드가 갑니다. 밖에서 파일이 바뀌면 수정 중이 아닐 때는 조용히 다시 읽고, 수정 중이면 배너로 묻습니다.
- 자동완성은 프로젝트의 `resources/api/initial2d-api.json`(엔진 저장소가 만들어 둔 API 명세)을 읽습니다. 없으면 내장 기본값으로 동작하며 콘솔에 그렇게 적힙니다. `Input.` 뒤에 멤버, `(` 뒤에 시그니처, 빈 파일에서 씬 계약 네 함수 스니펫.
- 찾기: 편집기 안 Ctrl+F, 프로젝트 전체 Ctrl+Shift+F (대소문자, 정규식). 새 스크립트 Ctrl+Alt+N (씬 템플릿 또는 컴포넌트 템플릿, Lua 나 Ruby).
- 엔진 프로세스 실행(F5, 설정의 실행 방식이 프로세스일 때)은 Tauri 앱에서만 됩니다. 브라우저에서는 F5 가 에디터 안 게임 탭에서 돕니다 (아래 "에디터 안에서 실행"). 엔진은 설정의 경로, 프로젝트의 `.initial-editor/engine`(한 줄 경로), 프로젝트 안 `build/Initial2D`, 형제 폴더 `../Initial2D/build/Initial2D` 순서로 찾고 `--features` 로 확인합니다. 정지 Shift+F5, 리로드 Ctrl+Shift+R. 엔진 출력은 콘솔에 오고 `파일:줄:` 은 링크라 누르면 그 줄로 갑니다.
- 배포된 페이지(Cloudflare Pages 등, 로컬이 아닌 호스트)에서는 브리지에 닿을 수 없어 웹판(브라우저 폴더)으로 시작합니다. 폴더 열기가 없는 브라우저는 메모리 모드입니다. 아래 "웹판" 절.

## 웹판 (브라우저에서 폴더 열기)

같은 앱을 Cloudflare Pages 에 올린 것이 웹판입니다. 설치 없이 브라우저가 내 컴퓨터의 프로젝트 폴더를 직접 읽고 씁니다
(File System Access API, 서버 없음). 게임은 게임 뷰에서 엔진의 WASM 빌드로 페이지 안에서 돕니다.

- **브라우저**: 크롬, 엣지 같은 크로미움 계열 데스크톱 브라우저. 파이어폭스와 사파리에는 폴더 열기가 없어서 샘플 프로젝트(메모리 모드)로 시작하고 시작 화면에 그렇게 적힙니다.
- **폴더 열기**: 시작 화면의 "폴더 열기"(또는 Ctrl+O)로 `game.json` 이 있는 폴더를 고르고, 브라우저가 묻는 수정 권한에 동의합니다. 연 폴더는 브라우저(IndexedDB)가 기억해 "최근 폴더"와 파일 > 최근 프로젝트에 나옵니다. 브라우저가 권한을 기억하지 않았으면 "다시 열기"를 누를 때 한 번 더 묻습니다.
- **되는 것**: 파일 트리, 스크립트와 씬과 맵 편집, 저장(임시 파일에 쓰고 한 번에 바꾼다), 이름 바꾸기와 지우기, 밖에서 바뀐 파일 감지(1.5초 간격으로 확인). **안 되는 것**: 새 프로젝트 만들기, 엔진 실행 파일 띄우기(Tauri 앱의 일).
- 시크릿 창에서는 기억한 폴더를 다시 열다가 탭이 멈출 수 있습니다(크로미움의 제약). 그런 일이 한 번 있으면 그 창에서는 다시 열기를 끄고 "폴더 열기"로 다시 고르게 합니다.
- 로컬에서 웹판을 띄우려면 `yarn dev` 뒤 `http://127.0.0.1:5173/?backend=browser`. `?backend=opfs` 는 브라우저 전용 저장소(OPFS)를 폴더 대신 바로 여는 테스트용입니다 (`tests/e2e/web-folder.spec.ts`).

## 에디터 안에서 실행 (E4)

엔진의 WebAssembly 빌드를 게임 탭의 canvas 에 올려 게임을 에디터 안에서 돌립니다. 브라우저 모드(브리지, 메모리, 웹판)의
F5 는 늘 이쪽이고, Tauri 앱은 설정의 **실행 방식**(프로세스, 에디터 안)으로 고릅니다. 상태 바의 엔진 칸에 방식이 붙습니다.

- F5 를 누르면 게임 탭이 열리고 `game.json`, `scripts/`, `resources/` 를 웹 엔진의 가상 파일 시스템에 올린 뒤 엔진이 뜹니다. `resources/rtp/`, `resources/aldebaran/src/`, `*.zip`, `*.psd`, 32 MB 를 넘는 파일은 올리지 않습니다. canvas 는 `game.json` 의 창 크기이고 탭에 맞춰 정수 배율로 커집니다 (탭이 작으면 줄인다).
- 게임 탭을 누르면 키가 게임으로 갑니다. F5, Shift+F5 같은 실행 단축키는 그때도 에디터가 받습니다. 브라우저는 누르기 전에는 소리를 내지 않아서, 소리가 멈춰 있으면 "소리 켜기"가 뜹니다 (게임 화면을 눌러도 켜진다).
- 출력(Lua `print`, 엔진 로그)은 콘솔에 오고 오류 줄은 링크입니다. 스크립트, 씬, 맵을 저장하면 그 파일만 다시 올리고 VM 을 다시 시작합니다 (콘솔에 "핫 리로드: 에디터 안 엔진"). 정지하거나 게임 탭을 닫으면 엔진 인스턴스와 WebGL 컨텍스트를 버리고, 다시 실행하면 새로 띄웁니다.
- 웹 엔진은 Lua 만 돕니다. `game.json` 의 `script` 가 `mruby` 면 띄우지 않고 이유를 알립니다.
- 엔진 파일은 `packages/app/public/engine/` 에 든 엔진 저장소 웹 빌드의 사본이고 Cloudflare Pages 빌드에 그대로 실립니다. 엔진을 고쳤으면 엔진 저장소에서 `tools/build_web.sh` 를 돌린 뒤 `INITIAL2D_DIR=../Initial2D yarn sync:engine-web` 으로 다시 복사합니다. `MANIFEST.json` 에 엔진 커밋과 sha256 이 적히고 단위 테스트가 파일과 대조합니다.
- e2e 는 `tests/e2e/game-view.spec.ts` 입니다 (메모리 모드 샘플, 그리고 엔진 저장소가 있으면 알데바란 사본을 브리지 모드로). `GAME_VIEW_SCREENSHOT=<png 경로>` 를 주면 게임 탭을 찍어 둡니다.

## 씬 편집 (E2)

- `resources/scenes/*.json` 을 열면 씬 뷰(PIXI)가 뜹니다. 클릭과 상자 선택, 끌기(되돌리기 한 단계), 방향키(1px, Shift 10px), 격자와 스냅과 줌(Ctrl+=, Ctrl+-, Ctrl+0), 카메라 사각형은 `game.json` 의 창 크기와 배율에서 옵니다. 씬 뷰는 근사이고 진짜 화면은 실행이 보여 줍니다 (현재 씬부터 실행 Ctrl+F5).
- 계층 패널은 그리기 순서이고(위가 먼저), 눈 토글과 이름 바꾸기(F2)와 끌어서 순서 바꾸기가 됩니다. 인스펙터는 공통 칸(id, x, y, 표시)과 타입별 칸(스프라이트: 이미지와 프레임과 배율, 글자: 글과 폰트), 스크립트 목록(붙이기, 만들기, 열기), 검사 결과를 보여 줍니다.
- 씬 메뉴: 새 씬(Ctrl+Shift+N), 오브젝트 추가(Ctrl+Shift+A 또는 타입별 하위 메뉴), 시작 씬으로 지정(`game.json` 의 `startScene`). 편집 메뉴의 복사와 붙여넣기와 복제(Ctrl+D)와 삭제는 씬 탭에서 오브젝트를 다룹니다.
- 새 프로젝트(Tauri): 빈 프로젝트 또는 플래피버드, Lua 또는 Ruby. 엔진의 씬 로더와 진입 파일과 예제가 함께 들어갑니다. 그 파일들은 엔진 저장소의 사본이며 `INITIAL2D_DIR=../Initial2D yarn sync:templates` 로 다시 맞춥니다.
- 교차 검사 `yarn test:engine-scene` 이 템플릿 둘 x 언어 둘을 임시 프로젝트로 써서 진짜 엔진을 헤드리스로 돌립니다 (`INITIAL2D_DIR`).

## 프로젝트

프로젝트는 `game.json`이 있는 폴더입니다. 엔진이 작업 폴더의 `./game.json`을 읽으므로 새 개념이 아닙니다.
`game.json`이 없는 폴더(예: Initial2D 저장소 자체)를 열면 에디터가 만들 것인지 묻습니다. 에디터만 쓰는 상태
(레이아웃 등)는 `.initial-editor/`에 두므로 gitignore 하는 것을 권합니다.

## 저장소 구성

```
packages/core/            DOM 도 PIXI 도 모르는 모델: 프로젝트, 문서와 되돌리기, 커맨드와 메뉴, 확장 API, 로그, 설정
packages/backend-bridge/  ProjectBackend 의 브리지(HTTP + WebSocket) 구현
packages/backend-fsaccess/ ProjectBackend 의 브라우저 폴더(File System Access API) 구현. 웹판이 쓴다
packages/backend-tauri/   ProjectBackend 의 Tauri 구현 (invoke 래퍼). Rust 본체는 src-tauri/
packages/app/             React 셸: 도킹(dockview), 패널, 메뉴와 단축키, 테마, 두 진입 모드
packages/ext-tilemap/     타일맵 확장 (E3 에서 채운다)
src-tauri/                Rust: 파일과 프로세스 명령, 감시, 핫 리로드 push
tests/e2e/                Playwright 스모크 (브라우저 모드)
legacy/                   2020~2026 의 옛 에디터 (참고용, E3 끝에 지운다)
docs/plans/               계획과 진행 상황
```

## 개발 명령

| 명령 | 무엇 |
|---|---|
| `yarn dev`, `yarn build`, `yarn preview` | 앱 (Vite) |
| `yarn typecheck`, `yarn lint` | TypeScript 와 ESLint (`core`는 DOM 과 PIXI 를 import 하지 못한다) |
| `yarn test` | Vitest 단위 테스트 (모든 패키지) |
| `yarn test:conformance` | 브리지 백엔드 적합성 (엔진 저장소의 브리지 서버를 임시 프로젝트로 띄운다. 위치는 `INITIAL2D_DIR`, 기본 `../Initial2D`) |
| `yarn test:rust` | `cargo test` (src-tauri) |
| `yarn test:engine-scene` | 에디터 템플릿으로 만든 프로젝트(빈, 플래피 x Lua, Ruby)를 진짜 엔진이 돌리는 교차 검사 (`INITIAL2D_DIR`) |
| `yarn sync:templates` | 엔진 저장소의 씬 로더와 템플릿과 예제를 `packages/app/templates/` 로 복사하고 MANIFEST(sha256)를 갱신 (`INITIAL2D_DIR`) |
| `yarn sync:engine-web` | 엔진 저장소의 웹 빌드(`build-web/site/` 의 `Initial2D.js`, `Initial2D.wasm`, `initial2d-loader.js`)를 `packages/app/public/engine/` 으로 복사하고 MANIFEST(커밋, sha256, 기능)를 갱신 (`INITIAL2D_DIR`) |
| `yarn test:engine` | 진짜 엔진과 핫 리로드 교차 검사 (엔진을 헤드리스로 띄우고 I2DH 묶음을 보내 `HotReload: reloaded` 를 본다). 엔진 저장소 위치는 `INITIAL2D_DIR`, 기본 `../Initial2D` |
| `yarn test:e2e` | Playwright (먼저 `yarn build`, 처음 한 번 `yarn playwright install chromium`) |
| `yarn check:colors` | 토큰 파일 밖의 색 리터럴 검사 (테마 규칙) |
| `yarn tauri <cmd>` | Tauri CLI |
| `yarn legacy:test`, `yarn legacy:build`, `yarn legacy:dev` | 옛 에디터 |

## 테마

색은 `packages/app/src/theme/tokens.css`의 토큰(CSS 변수)으로만 씁니다. `<html data-theme="dark|light">`로 바뀌고
기본은 OS 설정을 따릅니다. 새 테마는 토큰 값 한 벌을 더하면 됩니다. 규칙은
[docs/plans/02-scope-and-screens.md](./docs/plans/02-scope-and-screens.md) 6절.

## 옛 에디터

`legacy/`에 2020년부터의 타일맵 에디터(PIXI 7, jQuery 시절의 셸)가 그대로 있습니다. 새 에디터가 그 기능을 전부
갖출 때(E3)까지 `yarn legacy:dev`로 띄울 수 있습니다. 브리지 서버가 필요하고, 사용법은 엔진 README에 있습니다.

# License

MIT. 다만 포함된 일부 아이콘, 스크립트, 스타일시트, 이미지는 자기 라이선스를 따릅니다.

- Font Awesome Free - https://fontawesome.com/license/free
- FSM Tile (2k_town05.png) - http://refmap-l.blog.jp/archives/8632768.html
- FSM Tile (2k_town05-01.png) - http://refmap-l.blog.jp/archives/8632768.html
- Tuxemon Tileset - https://opengameart.org/content/tuxemon-tileset
