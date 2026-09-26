# E0: 토대. 스택 정리, Tauri 셸, 도킹 화면, 테마

**권장 모델**: Claude Fable 5 (최소 Opus 5). 패키지 경계와 `ProjectBackend` 계약이 뒤 단계 전부의 토대라서다.
한 번 굳으면 되돌리기 비싸다.

> 목표: **Tauri 앱이 프로젝트 폴더를 열어 파일 트리와 콘솔과 빈 씬 뷰를 보이고, 브라우저 모드가 같은 화면을 보인다.
> 테마가 바뀌고 레이아웃이 저장된다.** 게임을 만드는 기능은 아직 없다. 그 위에 올릴 바닥을 만든다.

## 선행 조건

- `rustup`으로 Rust 안정판 설치 (설치된 1.61은 Tauri 2를 빌드하지 못한다), `@tauri-apps/cli`.
- Node 20 이상, yarn 1.22 (있다).
- 엔진 저장소의 브리지 서버가 돈다 (`node tools/bridge/server.js --project <폴더>`). 브라우저 모드의 상대다.

## 작업 항목

### 마일스톤 1: 저장소 재편

- [x] 워크스페이스를 `packages/core`, `packages/app`, `packages/backend-bridge`, `packages/backend-tauri`, `packages/ext-tilemap`(빈 껍데기), `src-tauri/`로 재편한다 ([01-tech-stack.md](01-tech-stack.md) 5절)
- [x] 옛 `packages/initial-editor`와 `packages/renderer`는 워크스페이스에서 빼고 `legacy/`로 옮긴다. 빌드되지 않고 참고용이다. E3 끝에 지운다
- [x] 의존성 정리표대로 버리고 든다. Vite 하나, MobX 하나, Tailwind + CSS 변수, PIXI 8, Monaco, dockview
- [x] `yarn build`, `yarn dev`(브라우저 모드), `yarn tauri dev`, `yarn test`가 한 줄씩 된다 (`yarn tauri build --debug`로 .app 과 .dmg 번들까지 확인)
- [x] ESLint에 `core`가 `document`와 `window`와 `pixi.js`를 import 하지 못하게 하는 규칙을 둔다

### 마일스톤 2: `core`

- [x] `ProjectBackend` 인터페이스와 타입 ([03-project-and-runtime.md](03-project-and-runtime.md) 2절)
- [x] 프로젝트 모델: `game.json` 읽기와 기본값 만들기, 파일 트리 캐시, 변경 이벤트 반영
- [x] 문서 모델 골격: `Document`(dirty, path, save), `Command`(execute, undo)와 스택, 문서 레지스트리
- [x] 확장 API 골격: 등록 함수와 레지스트리 ([04-extensions-and-tilemap.md](04-extensions-and-tilemap.md) 2절). 이 단계에서는 등록만 되고 소비자는 `app`의 메뉴와 패널
- [x] 커맨드 레지스트리: id, 라벨, 단축키, enabled. 메뉴와 툴바와 키가 이것 하나를 본다
- [x] 단위 테스트 (Vitest): 되돌리기 스택, 경로 정규화, `game.json` 기본값, 커맨드와 단축키, 메뉴 트리, 확장 해제, UTF-8 (코어 48건)

### 마일스톤 3: `backend-bridge`

- [x] 옛 `bridge/BridgeClient.ts`를 옮겨 `ProjectBackend`로 감싼다. `watch`는 `/ws`, `hmrPush`는 `/api/reload`, `run`은 미지원 오류
- [x] **적합성 테스트 한 벌**(`tests/backend-conformance/`): 임시 폴더에 프로젝트를 만들고 브리지 서버를 띄워 읽기와 쓰기와 목록과 삭제와 루트 밖 거부와 외부 변경 알림을 확인한다. 이 벌은 E0 뒤에도 백엔드가 늘 때마다 그대로 쓴다

### 마일스톤 4: `src-tauri`와 `backend-tauri`

- [x] Rust 명령 표([01-tech-stack.md](01-tech-stack.md) 6절)를 구현한다. 그 표 밖은 넣지 않는다
- [x] 화이트리스트: 정규화 뒤 루트 밖 거부, 심링크 탈출 거부. `cargo test`로 브리지 테스트와 같은 케이스
- [x] 원자 저장(임시 파일 뒤 rename), 파일 감시(`notify`) 이벤트를 프런트로
- [x] `I2DH` 인코딩: 엔진 저장소 `tools/bridge/test`의 테스트 벡터 파일을 사본으로 두고 같은 바이트를 낸다
- [x] `engine_run`과 `engine_stop`: stdout과 stderr 줄 이벤트, 종료 코드. E1이 쓴다
- [x] `backend-tauri`는 `invoke` 래퍼이며, 적합성 테스트의 케이스를 Rust 단위 테스트로 옮긴다 (웹뷰 없이)
- [x] 네이티브 메뉴는 커맨드 레지스트리에서 만든다. 창 상태(위치와 크기) 저장 (`nativeMenu.ts` 가 메뉴 트리에서 `@tauri-apps/api/menu` 로 만든다, 창 상태는 window-state 플러그인. 눈으로 본 확인은 저자 몫)

### 마일스톤 5: `app` 셸

- [x] dockview로 패널 여섯 자리 (계층, 프로젝트, 문서 탭, 인스펙터, 콘솔, 확장 패널 자리). 레이아웃 저장과 복원(`.initial-editor/layout.json`), 프리셋 셋
- [x] 메뉴 바와 툴바와 단축키가 커맨드 레지스트리를 그린다. macOS는 Cmd
- [x] 프로젝트 패널: 파일 트리, 외부 변경 반영, 새 파일과 이름 바꾸기와 삭제(모달 확인)
- [x] 콘솔 패널: 로그 줄, 필터, 지우기. `파일:줄:` 링크 자리(E1이 채운다)
- [x] 상태 바와 토스트와 모달 부품
- [x] 테마: 토큰 파일, `data-theme`, OS 따라가기, 설정에서 고정, dockview 스타일 덮기. Monaco와 PIXI 연동은 각각 E1과 E2에서
- [x] 설정 대화상자(테마, 엔진 경로 자리, 저장 시 리로드 자리)와 최근 프로젝트
- [x] 브라우저 진입점과 Tauri 진입점이 백엔드만 다르게 같은 `App`을 띄운다

### 마일스톤 6: 검수와 CI

- [x] Playwright 스모크(브라우저 모드, 브리지 서버를 테스트가 띄운다): 프로젝트 열기, 파일 트리, 테마 전환, 레이아웃 저장
- [x] 색 리터럴 검사(토큰 파일 밖의 `#`과 `rgb(` 금지)
- [x] GitHub Actions(macOS): `yarn test`, `cargo test`, `yarn tauri build`가 성공한다 (워크플로우는 썼고 같은 명령이 로컬에서 전부 통과했다. GitHub 에서의 첫 실행은 PR 에서 본다)
- [x] README에 사용법(브라우저 모드, Tauri 모드, 개발 명령)을 새로 쓴다. 엔진 README의 "에디터 브리지 서버" 절도 새 화면에 맞춘다

## 완료 기준

- [x] macOS Tauri 앱에서 폴더 선택으로 Initial2D 저장소를 열면 `game.json` 생성을 묻고 만든 뒤 파일 트리가 보인다. 자동 검수는 두 겹으로 했다: 빌드한 `.app` 을 `INITIAL_EDITOR_OPEN=<임시 프로젝트>` 로 띄워 12초 뒤에도 살아 있고 stderr 가 비었으며 그 프로젝트에 `.initial-editor/layout.json` 이 생겼다 (Tauri 백엔드로 프로젝트를 열고 파일을 쓴 증거). `game.json` 생성 흐름은 같은 코드 경로를 Playwright 가 메모리 모드(`?sample=nogame`)로 검사한다. **폴더 선택 대화상자와 화면은 저자가 눈으로 확인해야 한다** (이 세션은 화면 캡처 권한이 없었다)
- [x] 브라우저 모드에서 브리지로 같은 프로젝트를 열면 같은 화면이 보인다 (실행 버튼은 비활성이고 이유가 툴팁에 있다)
- [x] 테마를 바꾸면 모든 패널이 따라오고, 색 리터럴 검사가 통과한다
- [x] 레이아웃을 바꾸고 다시 열면 그대로다
- [x] 백엔드 적합성 테스트가 두 구현에 대해 통과한다
- [x] 두 저장소의 README에 사용법이 있다

## 의존 관계

- 선행: 없음 (툴체인 설치뿐)
- 후행: E1, E2가 이 위에 선다

## 위험

- **재편이 커서 중간 상태가 길다.** 대응: `legacy/`를 남겨 옛 에디터를 언제든 띄울 수 있게 한다 (`yarn legacy:dev`). 새 에디터가 옛 기능을 다 갖출 때(E3)까지 그렇게 둔다.
- **dockview와 Monaco와 PIXI 8을 한 화면에 처음 올린다.** 대응: 마일스톤 5의 첫 커밋은 세 라이브러리가 빈 패널에 뜨는 것만 확인하는 스파이크로 한다.
- **Rust 툴체인이 낯설다.** 대응: 명령 표를 넘지 않고, 모든 명령에 단위 테스트를 둔다.

## 구현 노트 (2026-09-26)

- **Yarn 은 Berry 4.3.1 이고 저장소에 들어 있다** (`.yarn/releases/yarn-4.3.1.cjs`, `.yarnrc.yml` 의 `yarnPath`, `packageManager: yarn@4.3.1`). 처음에는 저장소의 `yarnPath` 가 Yarn 1.22 classic 파일을 가리켜, 로컬에서는 저자 홈 폴더의 설정 덕에 Berry 가 돌고 CI 에서는 classic 이 Berry 잠금 파일을 무시하고 새로 풀었다. 그 결과 새로 나온 `@tauri-apps/api` 2.12 가 Rust 쪽 2.11 과 어긋나 Tauri 빌드가 깨졌다 (2026-09-26). 이제 CI 의 classic 도 저장소의 Berry 로 넘기고 `yarn install --immutable` 이 잠금 파일을 지킨다.
- **테스트 러너는 Vitest 하나.** 코어까지 Vitest 로 돌린다 (빌드 없이 TS). 루트 `vitest.config.ts` 가 모든 패키지의 `*.test.ts(x)` 를 모은다. 서버를 띄우는 브리지 적합성 테스트만 `yarn test:conformance` 로 뗐다.
- **core 는 `TextEncoder` 도 쓰지 않는다.** 타입이 DOM lib 에만 있어 DOM 을 켠 패키지와 안 켠 패키지 사이에서 전역 선언이 충돌했다. 작은 UTF-8 코덱(`utf8.ts`)을 코어에 두었다.
- **절대 경로는 거부한다.** `normalizeRel("/etc/passwd")` 를 루트 기준으로 받으면 대화상자가 준 OS 경로가 프로젝트 안의 경로로 둔갑한다. `/` 하나만 루트로 본다.
- **브리지 서버 0.2.0 이 선행이다.** 파일 단위 API 만 있던 서버에 폴더 목록, stat, mkdir, rename, 폴더 삭제, `game.json` 과 `.initial-editor/` 허용, `*.rb` 리로드, 변경 `kind` 를 더했다 (엔진 저장소 PR #38). 적합성 한 벌(14 케이스)이 메모리 백엔드와 브리지 백엔드 양쪽에서 통과한다.
- **메모리 백엔드 모드(`?backend=memory`)** 를 브라우저 모드에 두었다. 서버 없이 UI 를 만들고 Playwright 스모크를 돌리는 자리다. 브리지 모드 스모크는 엔진 저장소가 옆에 있을 때만 돈다.
- **Tailwind 를 버렸다.** 토큰 규칙(색은 `var(--...)` 만)을 팔레트 클래스가 비켜 가기 때문이다. 컴포넌트별 CSS 와 색 리터럴 검사(`scripts/check-color-literals.mjs`)로 대신한다.
