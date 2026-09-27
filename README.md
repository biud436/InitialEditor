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
있습니다 (지금은 E3 맵 편집 단계).

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

- 프로젝트 패널에서 `.lua`, `.rb`, `.json` 을 열면 Monaco 편집기가 뜹니다. Ctrl+S 로 저장하면 (설정이 켜져 있으면) 실행 중인 게임에 핫 리로드가 갑니다. 밖에서 파일이 바뀌면 수정 중이 아닐 때는 조용히 다시 읽고, 수정 중이면 배너로 묻습니다. 저장할 때 디스크의 파일이 연 때와 다르면(배너에서 내 것 유지를 골랐어도, 파일이 지워졌어도) 덮어쓰기, 다시 읽기, 취소를 모달로 한 번 더 묻습니다. 씬, 맵, 모두 저장도 같습니다. 다시 읽기는 저장하지 않은 수정을 버리므로 한 번 더 확인하고, 디스크의 파일이 깨져 다시 읽지 못하면 "다시 읽지 못했다"고 알린 뒤 내 수정과 배너를 그대로 둡니다. 큰 맵을 쓰는 중에 고치고 다시 저장하면 앞의 쓰기가 끝난 뒤 최신 내용으로 한 번 더 저장합니다.
- 자동완성은 프로젝트의 `resources/api/initial2d-api.json`(엔진 저장소가 만들어 둔 API 명세)을 읽습니다. 없으면 내장 기본값으로 동작하며 콘솔에 그렇게 적힙니다. `Input.` 뒤에 멤버, `(` 뒤에 시그니처, 빈 파일에서 씬 계약 네 함수 스니펫.
- 찾기: 편집기 안 Ctrl+F, 프로젝트 전체 Ctrl+Shift+F (대소문자, 정규식). 새 스크립트 Ctrl+Alt+N (씬 템플릿 또는 컴포넌트 템플릿, Lua 나 Ruby).
- 실행(F5)은 Tauri 앱에서만 됩니다. 엔진은 설정의 경로, 프로젝트의 `.initial-editor/engine`(한 줄 경로), 프로젝트 안 `build/Initial2D`, 형제 폴더 `../Initial2D/build/Initial2D` 순서로 찾고 `--features` 로 확인합니다. 정지 Shift+F5, 리로드 Ctrl+Shift+R. 엔진 출력은 콘솔에 오고 `파일:줄:` 은 링크라 누르면 그 줄로 갑니다.
- 배포된 페이지(Cloudflare Pages 등, 로컬이 아닌 호스트)에서는 브리지에 닿을 수 없어 메모리 모드로 시작합니다.

## 씬 편집 (E2)

- `resources/scenes/*.json` 을 열면 씬 뷰(PIXI)가 뜹니다. 클릭과 상자 선택, 끌기(되돌리기 한 단계), 방향키(1px, Shift 10px), 격자와 스냅과 줌(Ctrl+=, Ctrl+-, Ctrl+0), 카메라 사각형은 `game.json` 의 창 크기와 배율에서 옵니다. 씬 뷰는 근사이고 진짜 화면은 실행이 보여 줍니다 (현재 씬부터 실행 Ctrl+F5).
- 계층 패널은 그리기 순서이고(위가 먼저), 눈 토글과 이름 바꾸기(F2)와 끌어서 순서 바꾸기가 됩니다. 인스펙터는 공통 칸(id, x, y, 표시)과 타입별 칸(스프라이트: 이미지와 프레임과 배율, 글자: 글과 폰트), 스크립트 목록(붙이기, 만들기, 열기), 검사 결과를 보여 줍니다.
- 씬 메뉴: 새 씬(Ctrl+Shift+N), 오브젝트 추가(Ctrl+Shift+A 또는 타입별 하위 메뉴), 시작 씬으로 지정(`game.json` 의 `startScene`). 편집 메뉴의 복사와 붙여넣기와 복제(Ctrl+D)와 삭제는 씬 탭에서 오브젝트를 다룹니다.
- 타일맵 오브젝트: 씬 > 오브젝트 추가 > 타일맵. 인스펙터에서 `resources/maps/`의 맵 파일을 고르면 씬 뷰가 그 맵의 레이어를 타일셋으로 오브젝트 자리에 그리고, 맵 파일이나 타일셋 그림이 바뀌면 다시 그립니다. 바닥 레이어 수(`groundLayers`)만큼의 앞 레이어는 씬의 모든 오브젝트 아래에, 나머지 레이어는 모든 오브젝트 위에 그립니다. 목록에서 타일맵보다 앞에 있는 오브젝트도 바닥 위에 보이고, 게임(엔진의 `scene_types/tilemap` 모듈이 같은 파일을 연다)과 같은 순서입니다. "맵 열기"는 그 맵을 맵 뷰로 엽니다.
  씬 뷰에서 타일맵은 배경처럼 다룹니다. 누르고 놓으면 고르고, 고른 뒤에 끌어야 옮겨지며, 고르지 않은 맵 위에서 끌면 상자 선택이 됩니다. 맵 파일을 고르지 않았거나, 고른 맵 파일이 없거나(지웠거나 이름을 바꿈), 있어도 엔진이 열지 못하는 맵(JSON이 아니거나, 버전과 크기가 틀렸거나, 레이어나 타일셋이 비었거나, 타일셋 그림이 없는 맵)을 가리키는 타일맵은 엔진이 씬을 거부하므로 검사 결과에 오류로 뜹니다. 검사는 엔진의 맵 읽기 규칙을 그대로 따라서, 엔진이 여는 맵은 오류로 보지 않습니다. 맵 파일이나 그 타일셋 그림이 바뀌면 다시 검사합니다.
- 새 프로젝트(Tauri): 빈 프로젝트 또는 플래피버드, Lua 또는 Ruby. 엔진의 씬 로더와 진입 파일과 예제가 함께 들어갑니다. 그 파일들은 엔진 저장소의 사본이며 `INITIAL2D_DIR=../Initial2D yarn sync:templates` 로 다시 맞춥니다.
- 교차 검사 `yarn test:engine-scene` 이 템플릿 둘 x 언어 둘을 임시 프로젝트로 써서 진짜 엔진을 헤드리스로 돌립니다 (`INITIAL2D_DIR`).

## 맵 편집 (E3)

`resources/maps/*.json`(엔진 맵 포맷 v1, v2)을 열면 맵 뷰가 뜹니다. 알데바란 숲(256x28 칸)처럼 생성기가 만든 맵도
실제 타일셋으로 보이고, 몬스터와 순찰 범위, 흔적, 구간 같은 배치가 맵 위에 표식으로 나옵니다.

- 칠하기: 팔레트에서 한 칸을 누르거나 끌어서 여러 칸을 고르고 펜(B), 사각형(R), 채우기(G), 지우개(E), 스포이드(I)로 칠합니다. 붓질 한 번이 되돌리기 한 단계입니다. 칠할 레이어는 레이어 패널에서 고르고, 거기서 보이기와 이름과 추가, 삭제, 순서도 바꿉니다.
- 통행: 통행 도구(C)로 왼쪽 클릭은 막힘, 오른쪽 클릭이나 Alt는 지나감입니다. 맵 > 통행 보기로 겹쳐 봅니다.
- 오브젝트: 오브젝트 도구(V)로 고르고 끌어 옮깁니다. 순찰 범위 손잡이와 띠 가장자리도 끌립니다. 맵 오브젝트 패널은 타입별 목록과 추가, 인스펙터는 프로젝트의 `resources/schema/map-objects.json`으로 만든 폼과 검사 결과입니다. 타입과 칸은 스키마가 정하므로 에디터는 몬스터가 무엇인지 모릅니다. 필수 칸이 비면(글 칸은 공백뿐이어도) 검사 결과에 뜹니다.
- 편집 메뉴: 맵 탭에서는 잘라내기, 복사, 붙여넣기, 복제(Ctrl+D), 삭제가 맵 오브젝트를 다룹니다. 붙인 것과 복제한 것은 한 칸 오른쪽에 놓이고 y는 그대로라 바닥에 선 몬스터와 시작 지점이 바닥에 남습니다. 순찰 범위도 같이 옮겨지고, 맵 오른쪽 끝이면 왼쪽으로 갑니다. 잘라내고 붙이면 id가 그대로라 옮기기가 됩니다(시작 지점은 `start` 그대로). 씬 오브젝트와는 클립보드가 따로입니다.
- 새 맵: 맵 > 새 맵(Ctrl+Alt+M). 이름, 크기, 타일 크기, 타일셋(프로젝트의 PNG), 레이어 이름, 통행을 정하면 `resources/maps/<이름>.json`이 생기고 열립니다.
- 크기 바꾸기: 맵 > 크기 바꾸기, 또는 맵 뷰 머리 띠의 크기를 누릅니다. 기준점(아홉 칸)에 따라 내용이 옮겨지고, 맵 밖으로 나가는 오브젝트는 지우지 않고 알려 줍니다.
- 여기서 실행: 맵 > 여기서 실행(Ctrl+F5, Tauri 앱). 스키마의 `play.env`를 채워 엔진을 띄웁니다. 오브젝트를 하나 골랐으면 그 자리(몬스터는 순찰 범위 왼끝에서 48px 왼쪽), 아니면 커서나 화면 가운데서 시작합니다. 알데바란은 `INITIAL2D_ALDEBARAN_STAGE`와 `INITIAL2D_ALDEBARAN_AT`을 받습니다. 스키마의 `play`에 `"maps": ["aldebaran_*"]`처럼 맵 이름 글롭 목록(`*`는 아무 글자열, `?`는 한 글자)을 두면 맞는 맵에서만 엔진을 띄웁니다. 다른 맵에서도 여기서 실행과 Ctrl+F5는 켜져 있고, 누르면 띄우지 않고 이유를 토스트와 콘솔에 한 줄로 알립니다. 메뉴 툴팁에도 그 이유가 보입니다. 없으면 모든 맵에서 띄웁니다.
- 저장(Ctrl+S)은 엔진과 같은 형식입니다. 2칸 들여쓰기에 타일 배열은 맵 한 줄이 한 줄이라 diff가 칸 단위로 보이고, `objects`와 `events`와 모르는 키는 그대로 남습니다.
- 맵 탭을 열면 팔레트, 레이어, 맵 오브젝트 패널이 없을 때 붙습니다 (직접 닫은 것은 다시 열지 않습니다). 창 > 레이아웃 > 타일맵은 맵 편집용 배치입니다.

인수 테스트 `tests/e2e/aldebaran-map.spec.ts`는 엔진 저장소의 숲 맵을 사본으로 열어 타일 세 칸과 늑대 하나를 고쳐
저장하고, Ctrl+F5가 넘긴 환경 변수에 `INITIAL2D_ALDEBARAN_TRACE=1`을 더해 엔진을 헤드리스로 돌립니다 (Lua, 빌드에 mruby가
있으면 Ruby도). 엔진이 찍는 `알데바란: 맵 <경로> 타일 <검사합>` 줄의 검사합이 저장한 파일에서 같은 식(레이어 순서와 칸 순서대로
`(합 * 31 + gid) mod 1000000007`)으로 계산한 값과 같고 원본의 값과 달라야 하며, `알데바란: 몬스터 ...` 줄에서 옮긴 늑대가 새 x와
순찰 범위여야 통과합니다. 엔진이 고치지 않은 맵을 읽으면 실패합니다. 엔진 저장소는 고치지 않습니다.

```sh
yarn build
INITIAL2D_DIR=../Initial2D yarn test:e2e tests/e2e/aldebaran-map.spec.ts                  # 엔진 빌드(build/Initial2D)가 있어야 한다
KEEP_WORKDIR=1 INITIAL2D_DIR=../Initial2D yarn test:e2e tests/e2e/aldebaran-map.spec.ts   # 사본 프로젝트와 스크린샷을 남긴다
```

엔진 실행 파일이나 숲 맵이 없으면 건너뜁니다. 엔진은 `INITIAL2D_ALDEBARAN_AT`으로 시작할 때마다
`알데바란: 시작 x <x> (y <y>)`를 찍고(엔진 PR #47 이후), `INITIAL2D_ALDEBARAN_TRACE=1`이면 맵과 몬스터 검수 줄을 찍는
판(엔진 PR #48 이후)이어야 합니다. 검수 줄이 없는 엔진이면 테스트가 실패합니다.

## RPG 이벤트 (E5, 진행 중)

맵 파일의 `events`를 에디터에서 고치는 RPG 확장입니다. 지금은 `packages/ext-rpg`에 DOM 없는 모델만 있습니다.
엔진의 이벤트 스키마(`resources/schema/event-commands.json`)와 게임 설정(`resources/data/rpg-game.json`)을 읽고,
엔진과 같은 검사를 같은 경로(`events[3].commands[2].text`)로 내고, 되돌릴 수 있는 명령으로 이벤트와 커맨드를 고칩니다.
맵 뷰의 이벤트 레이어와 커맨드 편집기는 다음 마일스톤입니다. 계약의 정본은 엔진의 `docs/plans/m2-rpg-events.md`입니다.

- 픽스처: 모델 테스트는 엔진 파일의 사본(`packages/ext-rpg/test/fixtures/`)으로 돕니다. 이벤트 스키마, 게임 설정, 아이템 표,
  항구 마을과 여관 맵, 경로 대조 픽스처, 플레이스홀더 그림입니다. 엔진 쪽 파일이 바뀌면 `yarn sync:rpg`로 다시 맞춥니다.
  `MANIFEST.json`에 엔진 커밋(40자)과 sha256이 남고, 엔진 저장소가 옆에 있으면 사본이 엔진 파일과 같은지 테스트가 봅니다.
  `resources/rtp/`는 복사하지 않습니다. 엔진 작업 트리가 커밋과 다르면 멈추고, 그래도 복사하려면 `--allow-dirty`를 줍니다.
- 교차 검사: `yarn test:engine-events`는 엔진 저장소의 사본 프로젝트에서 항구 마을을 열어 모델의 명령만으로 이벤트를 만들고
  저장한 뒤, 진짜 엔진을 헤드리스로 띄워 trace 줄(`rpg:player:`, `rpg:message:`, `rpg:route:done`)을 봅니다. 판은 넷입니다:
  말 걸기, 밟아서 여관으로 옮기기, auto 둘이 차례로 돌기, 되돌린 맵을 시작 상태 `arrived`로 다시 띄우기. 엔진 실행 파일이 없거나
  M2 계약 전의 엔진(Initial2D `74febb4` 이전)이면 `SKIP:` 한 줄을 찍고 통과합니다. 엔진 저장소는 고치지 않습니다.

```sh
INITIAL2D_DIR=../Initial2D yarn sync:rpg              # 엔진 파일을 픽스처로 복사하고 MANIFEST 갱신
INITIAL2D_DIR=../Initial2D yarn test:engine-events    # 엔진 빌드(build/Initial2D)가 있어야 한다
KEEP_WORKDIR=1 yarn test:engine-events                # 사본 프로젝트를 남긴다 (경로를 마지막에 찍는다)
```

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
packages/ext-tilemap/     타일맵 확장: 맵 모델(포맷, 타일 계산, 명령, 오브젝트 스키마, 오토타일)과 씬의 타일맵 오브젝트 타입
packages/ext-rpg/         RPG 확장: 이벤트 모델(스키마, 게임 설정, 검사, 명령, 여기서 실행 변수)과 엔진 교차 검사
src-tauri/                Rust: 파일과 프로세스 명령, 감시, 핫 리로드 push
tests/e2e/                Playwright (브라우저 모드)와 알데바란 인수 테스트, 도우미는 tests/e2e/support/
docs/plans/               계획과 진행 상황
```

## 개발 명령

| 명령 | 무엇 |
|---|---|
| `yarn dev`, `yarn build`, `yarn preview` | 앱 (Vite) |
| `yarn typecheck`, `yarn lint` | TypeScript 와 ESLint (`core`와 `ext-rpg`의 모델은 DOM 과 PIXI 를 import 하지 못한다) |
| `yarn test` | Vitest 단위 테스트 (모든 패키지와 e2e 도우미 `tests/e2e/support/*.unit.ts`) |
| `yarn test:conformance` | 브리지 백엔드 적합성 (엔진 저장소의 브리지 서버를 임시 프로젝트로 띄운다. 위치는 `INITIAL2D_DIR`, 기본 `../Initial2D`) |
| `yarn test:rust` | `cargo test` (src-tauri) |
| `yarn test:engine-scene` | 에디터 템플릿으로 만든 프로젝트(빈, 플래피 x Lua, Ruby)를 진짜 엔진이 돌리는 교차 검사 (`INITIAL2D_DIR`) |
| `yarn sync:templates` | 엔진 저장소의 씬 로더와 템플릿과 예제를 `packages/app/templates/` 로 복사하고 MANIFEST(sha256)를 갱신 (`INITIAL2D_DIR`) |
| `yarn test:engine-events` | 모델의 명령으로 만든 RPG 이벤트를 진짜 엔진이 돌리는 교차 검사 (항구 마을 사본, 네 판, `INITIAL2D_DIR`) |
| `yarn sync:rpg` | 엔진 저장소의 RPG 이벤트 계약 파일을 `packages/ext-rpg/test/fixtures/` 로 복사하고 MANIFEST(엔진 커밋, sha256)를 갱신 (`INITIAL2D_DIR`) |
| `yarn test:engine` | 진짜 엔진과 핫 리로드 교차 검사 (엔진을 헤드리스로 띄우고 I2DH 묶음을 보내 `HotReload: reloaded` 를 본다). 엔진 저장소 위치는 `INITIAL2D_DIR`, 기본 `../Initial2D` |
| `yarn test:e2e` | Playwright (먼저 `yarn build`, 처음 한 번 `yarn playwright install chromium`). 브리지 모드와 알데바란 인수 테스트는 `INITIAL2D_DIR`의 엔진 저장소를 쓰고, 없으면 건너뛴다 |
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
