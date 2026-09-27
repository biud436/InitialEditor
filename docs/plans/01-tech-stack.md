# 01. 기술 스택 검토와 결정

> 결정: **Tauri 2 데스크톱 셸 위에 TypeScript, React 18, PIXI 8, Monaco, dockview.**
> 브라우저 + 브리지 서버는 개발 모드로 남긴다. Electron은 쓰지 않는다.

## 1. 요구에서 나오는 제약

저자의 요구를 스택의 제약으로 옮기면 다섯이다.

1. **로컬 파일을 잘 다룬다.** 폴더 열기, 파일 감시, 원자적 저장, 프로젝트 밖으로 못 나가는 화이트리스트.
2. **크로스 플랫폼.** macOS(저자의 주 환경), Windows, Linux.
3. **가볍다.** 저자 판정: "Electron은 너무 무거운 느낌" (2026-09-26).
4. **인게임이 돈다.** 엔진 실행 파일을 띄우거나(프로세스), 에디터 안에서 돌린다(내장). 둘 다 가능해야 한다.
5. **테마.** 다크와 라이트를 기본으로, 새 테마를 더하기 쉽게.

그리고 이 저장소가 이미 가진 것이 있다. TypeScript와 React와 PIXI로 만든 12,600줄, 그중 순수 로직
(맵 포맷 변환, 오토타일, 되돌리기, 브리지 클라이언트)은 그대로 쓸 수 있다.

## 2. 셸 후보 비교

| 후보 | 로컬 파일 | 크로스 플랫폼 | 무게 | 내장 실행 | TS 자산 재사용 | 판정 |
|---|---|---|---|---|---|---|
| 브라우저 + 브리지 서버 (현행) | 서버를 거쳐서. 폴더 선택 대화상자 없음, 서버를 따로 띄워야 함 | 브라우저가 있는 곳 어디나 | 가장 가벼움 | WASM 엔진을 페이지에 올릴 수 있음 | 전부 | **개발 모드로 유지.** 제품이 되기엔 두 프로세스를 손으로 띄워야 한다 |
| Electron | Node로 직접. `tools/bridge/lib`를 그대로 메인 프로세스에서 쓸 수 있음 | 셋 다, Chromium이라 동작이 같음 | 설치 100MB 이상, 메모리 큼 | WASM 가능 | 전부 | **제외.** 저자 판정 "무겁다". 2023년에 이미 걷어낸 경로이기도 하다 |
| **Tauri 2** | Rust 명령으로 직접. 네이티브 대화상자, 파일 감시, 사이드카(엔진 실행 파일 동봉) | 셋 다. OS 웹뷰(macOS WKWebView, Windows WebView2, Linux WebKitGTK) | 설치 수 MB에서 10MB대, 메모리 작음 | WASM 가능 | 전부 | **채택** |
| 엔진 내장 편집기 (C++ + Dear ImGui) | C++로 직접 | SDL2가 도는 곳 | 단일 실행 파일 | 엔진 그 자체라 완벽 | 없음 (전부 다시 짬) | **차선.** 3절에 따로 적는다 |
| Qt, Flutter | 직접 | 셋 다 | 중간 | 별도 임베딩 필요 | 없음 | 부적합. 웹 자산을 버리고 새 언어를 배워야 한다 |

### 왜 Tauri 2인가

- **가볍다.** OS의 웹뷰를 쓰므로 Chromium을 실어 나르지 않는다. 저자가 Electron에서 느낀 무게의 대부분이 그것이다.
- **Rust 쪽이 작다.** 에디터가 네이티브에 기대는 것은 파일과 프로세스뿐이다. 필요한 명령은 프로젝트 열기, 파일 읽기와 쓰기와 목록과 삭제와 감시, 핫 리로드 push(TCP `I2DH`), 엔진 실행과 정지와 출력 스트리밍, 폴더 선택 대화상자. 합쳐서 수백 줄이며, 그 이상은 늘리지 않는다.
- **엔진을 동봉할 수 있다.** Tauri의 사이드카가 정확히 "다른 실행 파일을 함께 번들하고 띄우는" 기능이다. E6에서 엔진 바이너리를 동봉하면 설치 하나로 편집과 실행이 된다.
- **브라우저 모드와 공존한다.** UI는 `ProjectBackend` 인터페이스만 보고, Tauri 구현과 브리지 구현이 그 뒤에 있다. 브라우저 모드는 Playwright로 UI를 시험하는 자리이기도 하다.

### 감수하는 것

- **Rust 툴체인.** 저자에게 새 언어다. 다만 코드가 작고, 에이전트가 짜고 테스트한다. 설치된 `rustc 1.61`(2022년)은 Tauri 2를 빌드하지 못하므로 `rustup`으로 갱신해야 한다.
- **웹뷰가 셋이다.** Chromium 하나가 아니라 WKWebView, WebView2, WebKitGTK라서 동작이 미묘하게 다를 수 있다. PIXI(WebGL)와 Monaco는 셋 다에서 돈다. Linux WebKitGTK는 WebGL과 합성 문제가 보고된 적이 있어 3순위로 둔다.
- **씬 뷰는 근사다.** 에디터의 PIXI 렌더링은 엔진의 SDL2 렌더링과 같지 않다. 폰트, 픽셀 배율, 컬링이 다를 수 있다. 그래서 진짜 화면은 게임 뷰(E1의 프로세스 실행, E4의 내장 실행)가 보여 주고, 씬 뷰는 배치를 위한 근사로 못 박는다.

## 3. 차선: 엔진 내장 편집기 (C++ + Dear ImGui)

정직하게 적어 둔다. 이 길이 나은 점이 있다.

- 편집 화면이 엔진의 렌더러 그 자체라 **씬 뷰와 게임 화면이 정확히 같다.** WASM 포팅이 필요 없다.
- 단일 실행 파일, 즉시 시작, 네이티브 파일 접근. SDL2가 이미 크로스 플랫폼 층이다.
- ImGui는 인스펙터(속성 격자)에 강하고 다크와 라이트 스타일이 있다.

그런데도 고르지 않은 이유는 셋이다.

1. **스크립트 편집이 약하다.** 저자가 가장 중요하다고 한 것이 스크립트 작성이다. ImGui의 텍스트 편집기는 구문 강조까지이고, Monaco급(다중 커서, 찾기와 바꾸기, 자동완성, 접기)은 없다.
2. **엔진을 라이브러리로 쪼개야 한다.** 지금 엔진은 실행 파일 하나다. 편집기 타깃을 붙이려면 코어를 라이브러리로 뽑는 큰 재구성이 먼저이고, 그것은 C++을 "엔진과 어댑터만"으로 묶어 둔 원칙을 흔든다.
3. **12,600줄의 웹 자산과 저자의 주 기술이 웹이다.** 테마, 도킹, 대화상자, 목록 같은 것을 웹에서 만드는 비용이 ImGui보다 낮다.

씬 뷰의 근사가 실제로 문제가 되면(E2 완료 기준에서 골든이 자주 어긋나면) 그때 다시 저울질한다. 그때도 전환이 아니라
"게임 뷰를 진실로, 씬 뷰를 보조로" 쓰는 쪽이 먼저다.

## 4. 웹 쪽 스택 결정

| 자리 | 결정 | 이유 |
|---|---|---|
| 언어와 UI | TypeScript, React 18 | 유지. 저자의 주 기술이고 옛 렌더러가 이미 React다 |
| 씬 뷰 렌더링 | **PIXI 8** | 새로 짜는 씬 뷰라 처음부터 8로 간다. 7에서 옮기는 일을 두 번 하지 않기 위해서다. WebGPU는 켜지 않고 WebGL로 시작한다 |
| 코드 편집기 | **Monaco** (react-ace 대체) | Lua와 Ruby 구문이 기본으로 들어 있고, 자동완성 공급자를 등록해 엔진 API 스텁(R2)을 붙일 수 있다. 워커 번들은 Vite에서 처리한다 |
| 도킹 레이아웃 | **dockview** | React용, MIT, 레이아웃 직렬화(`toJSON`)와 테마 클래스가 있다. 패널을 끌어 옮기고 저장하는 것이 필요 요건이다 |
| 상태 | MobX 유지, Recoil 제거 | 둘 다 있던 것을 하나로. 문서 모델(씬, 스크립트)은 클래스라 MobX가 맞다 |
| 스타일 | CSS 변수 토큰 + 컴포넌트별 CSS(모듈), styled-components 와 Tailwind 제거 | 테마는 토큰이 전부이고 런타임 CSS-in-JS는 필요 없다. Tailwind 의 팔레트 클래스(`bg-gray-800`)는 토큰 규칙을 비켜 가므로 함께 뺐다 (2026-09-26 E0 에서 정정) |
| DI와 데코레이터 | tsyringe, typedi, reflect-metadata 제거 | 확장 API가 명시적 등록 함수라 컨테이너가 필요 없다. 메뉴 커맨드의 `@MenuCommand` 데코레이터도 명시적 `registerCommand`로 |
| 번들 | Vite 하나, webpack과 babel 제거 | 옛 코어의 webpack 설정은 사용되지 않는 경로다 |
| 테스트 | Vitest 하나로 코어와 React(코어는 Node 환경, 컴포넌트는 jsdom), Playwright(브라우저 모드 UI 스모크), `cargo test`(Rust 명령) | 엔진과 같은 원칙: 렌더링은 골든으로, 로직은 단위로. 처음에는 `node --test`를 코어에 남기려 했으나 빌드 없이 TS 를 바로 돌리는 러너 하나가 낫다 (E0 에서 정정) |
| 패키지 관리 | Yarn 4.3.1 (Berry, `.yarn/releases` 의 파일을 `yarnPath` 로) | 조사 때 1.22 로 보였던 것은 `packageManager` 라벨이었고 실제 락파일과 실행 파일은 Berry 다. 라벨은 그대로 두었다 (corepack 의 1.22 쉼이 `yarnPath` 로 위임하는 경로가 동작한다). Node 20 이상 |

### 의존성 정리표

| 남긴다 | 버린다 | 새로 든다 |
|---|---|---|
| react, react-dom, mobx, mobx-react-lite, vite, typescript, eslint, prettier | tailwindcss, postcss, autoprefixer, uuid, classnames, pixi.js 7 (8로), react-ace, ace-builds, recoil, styled-components, styled-reset, tsyringe, typedi, reflect-metadata, rxjs, axios (fetch로 충분), webpack 일체, babel 일체, dart-sass, sass, @types/jquery, mousetrap (자체 단축키 등록으로), react-draggable, react-resizable (dockview가 대신), react-router-dom (화면이 하나다), storybook (당장은 유지 비용만 든다), @hyrious/marshal (RPG Maker 데이터 읽기, 쓰이지 않는다), ultra-runner, @changesets/cli | pixi.js 8, monaco-editor, dockview, @tauri-apps/api, @tauri-apps/cli, tauri 플러그인(dialog, fs, shell, process, window-state, store), vitest, @playwright/test |

Storybook은 지우지 않고 남겨 두되 새 패널을 등록하지 않는다. 테마 토큰이 자리 잡은 뒤 컴포넌트 카탈로그로 되살릴지 정한다.

## 5. 패키지 구성

```
InitialEditor/
├── docs/plans/                 이 문서들
├── packages/
│   ├── core/                   DOM도 PIXI도 모르는 모델. 프로젝트, 문서, 씬, 명령과 되돌리기, 확장 API, 포맷 변환
│   ├── backend-bridge/         ProjectBackend의 브리지(HTTP + WebSocket) 구현. 옛 BridgeClient.ts가 여기로
│   ├── backend-tauri/          ProjectBackend의 Tauri 구현 (invoke 래퍼). Rust 본체는 src-tauri/
│   ├── app/                    React 셸: 도킹, 패널, 메뉴, 단축키, 테마, 씬 뷰(PIXI), 스크립트 뷰(Monaco). 브라우저와 Tauri 두 진입점
│   └── ext-tilemap/            첫 확장. 타일셋 팔레트, 그리기 도구, 맵 v2 변환, 타일맵 오브젝트 타입
├── src-tauri/                  Rust: 파일과 프로세스 명령, 메뉴, 창 상태
└── tests/                      Playwright 스모크와 두 저장소가 공유하는 픽스처의 사본
```

옛 `packages/initial-editor`는 `core`와 `ext-tilemap`으로 흩어지고, `packages/renderer`는 `app`이 된다. 규칙 하나:
**`core`는 `document`와 `window`를 모른다.** 그래야 `node --test`로 돌고, 그래야 씬 포맷 변환을 엔진 픽스처와 대조할 수 있다.
옛 `MapFormat.ts`가 그 규칙으로 만들어져 유일하게 테스트가 있는 파일이 되었다는 것이 근거다.

## 6. Tauri 쪽 (Rust) 범위

늘어나지 않게 목록으로 못 박는다.

| 명령 | 역할 | 비고 |
|---|---|---|
| `project_open(path)` | `game.json` 확인(없으면 만들 것인지 프런트에 묻는다), 화이트리스트 루트 등록, 목록 반환 | 최근 프로젝트는 store 플러그인 |
| `fs_list(rel)`, `fs_read(rel)`, `fs_write(rel, bytes)`, `fs_delete(rel)`, `fs_exists(rel)` | 프로젝트 루트 기준 상대 경로만. 정규화 뒤 루트 밖이면 거부, 심링크 탈출 거부 | 쓰기는 임시 파일 뒤 rename |
| `fs_watch(rel)` | 변경 이벤트를 프런트로 (`notify` 크레이트) | 브리지의 `/ws`와 같은 이벤트 모양 |
| `hmr_push(host, port, files)` | `I2DH` 묶음을 TCP로 보낸다 | `tools/bridge/lib/hmr.js`와 같은 인코딩, 같은 테스트 벡터 |
| `engine_run(exe, cwd, env, args)`, `engine_stop(id)` | 프로세스 spawn, stdout과 stderr를 줄 단위 이벤트로, 종료 코드 전달 | `std::process` 로 직접 (shell 플러그인은 열지 않는다). E6 의 사이드카도 `externalBin` 으로 파일만 놓고 같은 길로 띄운다 (`engine_bundled`, `engine_exists`, e6-packaging.md 2.1 절) |
| `dialog_pick_folder()` | 네이티브 폴더 선택 | dialog 플러그인 |

메뉴와 창 상태와 테마 감지는 Tauri API를 직접 쓴다. 이 표 밖의 것이 필요해지면 먼저 "브리지 모드에서는 어떻게 되는가"를 답하고 넣는다.

## 7. 툴체인 준비물

| 플랫폼 | 필요한 것 | 지금 상태 (2026-09-26, 저자 맥) |
|---|---|---|
| 공통 | Node 20 이상, yarn 1.22, Rust 안정판(Tauri 2가 요구하는 버전), `@tauri-apps/cli` | Node 23.1, yarn 있음. **Rust 1.61은 너무 오래되어 `rustup update` 필요**, Tauri CLI 없음 |
| macOS | Xcode 명령줄 도구 | 있음 |
| Windows | WebView2 런타임(Windows 10과 11에 내장), MSVC 빌드 도구 | 저자의 Parallels 환경에서 확인 필요 |
| Linux | webkit2gtk 4.1, libappindicator 등 Tauri 요구 패키지 | 3순위 |
| E4 (내장 실행) | Emscripten SDK | 없음. R3에서 설치 |

## 8. 위험

1. **웹뷰 차이.** 특히 Linux. 대응: E0 완료 기준에 macOS와 브라우저 모드만 넣고, Windows는 E1에서, Linux는 E6에서 본다.
2. **Rust 빌드 시간.** 처음 빌드는 몇 분이다. 대응: UI 작업은 브라우저 모드(Vite dev)로 하고 Tauri는 통합 지점에서만 띄운다.
3. **Monaco 번들 크기와 워커.** 대응: 언어를 Lua, Ruby, JSON 셋으로 제한하고 워커는 Vite의 `?worker`로 든다.
4. **PIXI 8 이행.** 옛 타일맵 렌더링 코드는 7 기준이라 그대로 못 옮긴다. 대응: 렌더링은 어차피 새로 짜고(E2 씬 뷰), 옛 코드에서 옮기는 것은 데이터 로직뿐이다.
5. **두 백엔드의 어긋남.** 대응: `ProjectBackend` 적합성 테스트 한 벌을 브리지 구현에 대해 Node로 돌리고, Rust 명령은 같은 케이스를 `cargo test`로 돌린다. 인코딩(`I2DH`)은 같은 테스트 벡터를 양쪽이 읽는다.
