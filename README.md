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
| **Tauri 앱** (제품) | macOS, Windows, Linux 데스크톱 앱 | 직접 (폴더 선택, 감시, 원자적 저장) | 엔진 실행 파일을 띄운다 (E1) |
| **브라우저** (개발) | Vite dev 서버 + 엔진 저장소의 브리지 서버 | 브리지 서버(`127.0.0.1:5960`)를 거쳐서 | 없음 |

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
- 실행(F5)은 Tauri 앱에서만 됩니다. 엔진은 설정의 경로, 프로젝트의 `.initial-editor/engine`(한 줄 경로), 프로젝트 안 `build/Initial2D`, 형제 폴더 `../Initial2D/build/Initial2D` 순서로 찾고 `--features` 로 확인합니다. 정지 Shift+F5, 리로드 Ctrl+Shift+R. 엔진 출력은 콘솔에 오고 `파일:줄:` 은 링크라 누르면 그 줄로 갑니다.
- 배포된 페이지(Cloudflare Pages 등, 로컬이 아닌 호스트)에서는 브리지에 닿을 수 없어 메모리 모드로 시작합니다.

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
packages/backend-tauri/   ProjectBackend 의 Tauri 구현 (invoke 래퍼). Rust 본체는 src-tauri/
packages/app/             React 셸: 도킹(dockview), 패널, 메뉴와 단축키, 테마, 두 진입 모드
packages/ext-tilemap/     타일맵 확장 (E3 에서 채운다)
src-tauri/                Rust: 파일과 프로세스 명령, 감시, 핫 리로드 push
tests/e2e/                Playwright 스모크 (브라우저 모드)
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
| `yarn test:engine` | 진짜 엔진과 핫 리로드 교차 검사 (엔진을 헤드리스로 띄우고 I2DH 묶음을 보내 `HotReload: reloaded` 를 본다). 엔진 저장소 위치는 `INITIAL2D_DIR`, 기본 `../Initial2D` |
| `yarn test:e2e` | Playwright (먼저 `yarn build`, 처음 한 번 `yarn playwright install chromium`) |
| `yarn check:colors` | 토큰 파일 밖의 색 리터럴 검사 (테마 규칙) |
| `yarn tauri <cmd>` | Tauri CLI |

## 테마

색은 `packages/app/src/theme/tokens.css`의 토큰(CSS 변수)으로만 씁니다. `<html data-theme="dark|light">`로 바뀌고
기본은 OS 설정을 따릅니다. 새 테마는 토큰 값 한 벌을 더하면 됩니다. 규칙은
[docs/plans/02-scope-and-screens.md](./docs/plans/02-scope-and-screens.md) 6절.

## 옛 에디터

2020년부터의 타일맵 에디터(PIXI 7, jQuery 시절의 셸)는 E3에서 지웠습니다. 옛 기능이 새 에디터의 어디로 갔는지는
[docs/plans/e3-tilemap.md](./docs/plans/e3-tilemap.md)의 이전표에 있고, 코드는 git 이력에 남아 있습니다.

# License

MIT.
