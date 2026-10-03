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
있습니다 (E0 부터 E6 까지 마쳤고 프리릴리스는 [Releases](https://github.com/biud436/InitialEditor/releases) 에 있습니다).

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

- 프로젝트 패널에서 `.lua`, `.rb`, `.json` 을 열면 Monaco 편집기가 뜹니다. Ctrl+S 로 저장하면 (설정이 켜져 있으면) 실행 중인 게임에 핫 리로드가 갑니다. 밖에서 파일이 바뀌면 수정 중이 아닐 때는 조용히 다시 읽고, 수정 중이면 배너로 묻습니다. 저장할 때 디스크의 파일이 연 때와 다르면(배너에서 편집 내용 유지를 골랐어도, 파일이 지워졌어도) 덮어쓰기, 다시 읽기, 취소를 모달로 한 번 더 묻습니다. 씬, 맵, 모두 저장도 같습니다. 다시 읽기는 저장하지 않은 수정을 버리므로 한 번 더 확인하고, 디스크의 파일이 깨져 다시 읽지 못하면 "다시 읽지 못했다"고 알린 뒤 내 수정과 배너를 그대로 둡니다. 큰 맵을 쓰는 중에 고치고 다시 저장하면 앞의 쓰기가 끝난 뒤 최신 내용으로 한 번 더 저장합니다.
- 자동완성은 프로젝트의 `resources/api/initial2d-api.json`(엔진 저장소가 만들어 둔 API 명세)을 읽습니다. 없으면 내장 기본값으로 동작하며 콘솔에 그렇게 적힙니다. `Input.` 뒤에 멤버, `(` 뒤에 시그니처, 빈 파일에서 씬 계약 네 함수 스니펫.
- 데스크톱 앱은 Lua 스크립트를 열면 앱에 든 언어 서버 LuaLS 를 띄웁니다. 지역 변수, `require` 한 모듈, 직접 만든 함수까지 아는 자동 완성과 호버, 진단(물결 밑줄), 정의로 이동(F12, Ctrl+클릭), 참조(Shift+F12), 이름 바꾸기(F2, 여러 파일이면 그 파일들을 열어 저장할 수 있게 합니다), 기호로 이동(Ctrl+Shift+O)이 됩니다. 상태 바에 `LuaLS 3.19.1` 처럼 보이고, 멈추면 도구 > 언어 서버 다시 시작. 서버가 도는 동안 명세 자동완성은 씬 계약 스니펫만 남습니다.
- Ruby 스크립트와 브라우저판의 Lua 는 워커 안의 구문 분석기(Ruby 는 Prism, Lua 는 luaparse)가 붙습니다. 구문 오류를 쓰는 동안 밑줄로 보이고, 정의로 이동(F12)과 기호로 이동(Ctrl+Shift+O)이 프로젝트의 `scripts/` 안에서 되고, 자동완성에 지금 파일의 함수 이름과 프로젝트의 클래스, 모듈, 상수 이름이 더해집니다. 엔진 API 의 자동완성은 지금처럼 명세에서 옵니다.
- 진단 규칙은 프로젝트의 `.luarc.json` 입니다. 새 Lua 프로젝트는 엔진 템플릿의 것(형식 검사, 지역 변수 다시 선언, 줄 끝 공백을 끈 LuaLS 기본)과 엔진 API 스텁 `resources/api/initial2d.lua` 를 받고, VS Code 같은 다른 에디터의 LuaLS 도 같은 파일을 읽습니다. 둘 다 없는 옛 프로젝트는 같은 규칙과 앱에 든 스텁을 씁니다. 도구 > 설정의 "진단 표시"에서 표시 안 함, 구문 오류만, 규칙 전체를 고르고, "언어 서버"를 끄면 명세 자동완성만 씁니다. 계획과 구조는 [docs/plans/language-server.md](./docs/plans/language-server.md).
- 찾기: 편집기 안 Ctrl+F, 프로젝트 전체 Ctrl+Shift+F (대소문자, 정규식). 새 스크립트 Ctrl+Alt+N (씬 템플릿 또는 컴포넌트 템플릿, Lua 나 Ruby).
- 엔진 프로세스 실행(F5, 설정의 실행 방식이 프로세스일 때)은 Tauri 앱에서만 됩니다. 브라우저에서는 F5 가 에디터 안 게임 탭에서 돕니다 (아래 "에디터 안에서 실행"). 엔진은 설정의 경로, 프로젝트의 `.initial-editor/engine`(한 줄 경로), 프로젝트 안 `build/Initial2D`, 앱에 든 엔진(설치본), 형제 폴더 `../Initial2D/build/Initial2D` 순서로 찾고 `--features` 로 확인합니다. 프로젝트가 가리키는 실행 파일(`.initial-editor/engine`, `build/`, 형제 폴더)은 처음 한 번 경로를 보여 주고 실행해도 되는지 묻습니다. 답은 프로젝트가 아니라 앱 설정에 남고, 도구 > 설정의 "찾은 엔진" 줄에서 신뢰 취소나 다시 묻기를 합니다. 엔진을 못 찾으면 F5 는 에디터 안 게임 탭으로 넘어갑니다 (Ruby 프로젝트는 이유를 띄웁니다). 정지 Shift+F5, 리로드 Ctrl+Shift+R. 엔진 출력은 콘솔에 오고 `파일:줄:` 은 링크라 누르면 그 줄로 갑니다. 저장하지 않은 문서가 있으면 F5 와 Ctrl+F5, 다시 시작이 먼저 묻습니다. 게임은 디스크의 파일을 읽기 때문입니다. Enter 는 "모두 저장하고 실행"이고, "저장하지 않고 실행"과 "취소"도 있습니다.
- 배포된 페이지(Cloudflare Pages 등, 로컬이 아닌 호스트)에서는 브리지에 닿을 수 없어 웹판(브라우저 폴더)으로 시작합니다. 폴더 열기가 없는 브라우저는 메모리 모드입니다. 아래 "웹판" 절.

## 웹판 (브라우저에서 폴더 열기)

같은 앱을 Cloudflare Pages 에 올린 것이 웹판입니다. 설치 없이 브라우저가 내 컴퓨터의 프로젝트 폴더를 직접 읽고 씁니다
(File System Access API, 서버 없음). 게임은 게임 뷰에서 엔진의 WASM 빌드로 페이지 안에서 돕니다.

- **브라우저**: 크롬, 엣지 같은 크로미움 계열 데스크톱 브라우저. 파이어폭스와 사파리에는 폴더 열기가 없어서 샘플 프로젝트(메모리 모드)로 시작하고 시작 화면에 그렇게 적힙니다.
- **폴더 열기**: 시작 화면의 "폴더 열기"(또는 Ctrl+O, 파일 > 프로젝트 열기. "샘플 프로젝트 열기" 뒤에도 같습니다)로 `game.json` 이 있는 폴더를 고르고, 브라우저가 묻는 수정 권한에 동의합니다. 연 폴더는 브라우저(IndexedDB)가 폴더 이름으로 기억해 "최근 폴더"와 파일 > 최근 프로젝트에 나옵니다. 같은 이름의 폴더를 다시 고르면 목록이 늘지 않고 그 자리를 새로 고른 폴더로 바꿉니다. 브라우저가 권한을 기억하지 않았으면 "다시 열기"를 누를 때 한 번 더 묻습니다.
- 열린 프로젝트에 저장하지 않은 문서가 있으면 폴더를 고른 뒤 닫을지 먼저 묻습니다. 여기서 취소하면 기억한 폴더 목록도 지금 열린 프로젝트도 그대로입니다.
- **되는 것**: 파일 트리, 스크립트와 씬과 맵 편집, 저장(임시 파일에 쓰고 한 번에 바꾼다), 이름 바꾸기와 지우기, 밖에서 바뀐 파일 감지(1.5초 간격으로 확인), 새 프로젝트. **안 되는 것**: 엔진 실행 파일 띄우기와 안드로이드 스테이징(데스크톱 앱의 일). 웹 엔진 빌드에 mruby 가 없으면 Ruby 게임도 돌지 않습니다. 시작 화면 아래에 이 줄과 "데스크톱 앱 받기"(릴리스 페이지)가 있습니다.
- **새 프로젝트**: 시작 화면의 "새 프로젝트"(또는 Ctrl+N, 파일 > 새 프로젝트. "샘플 프로젝트 열기" 뒤에도 같습니다)로 빈 폴더를 고르고 템플릿과 언어를 정하면 그 폴더에 템플릿을 쓰고 엽니다. 폴더를 기억하는 것은 대화상자에서 "만들기"를 누른 뒤라, 중간에 취소하면 최근 폴더도 폴더 안도 그대로입니다. 비어 있지 않은 폴더는 한 번 묻고, 있는 파일은 그대로 두고 없는 것만 만듭니다.
- **샘플 프로젝트 열기**: 엔진의 RPG 데모 「떠나기 전에」를 메모리에 풀어 열고 항구 마을 맵(`resources/maps/port_town.json`)을 맵 뷰로 띄웁니다. 새 프로젝트의 "RPG 데모" 템플릿과 같은 파일입니다. 타일을 칠하거나 이벤트 레이어에서 대사를 고치고 저장한 뒤 F5 를 누르면 타이틀부터, Ctrl+F5 를 누르면 그 맵에서 바로 게임 탭으로 실행합니다. 메모리라 페이지를 다시 열면 처음 상태로 돌아갑니다. 예전의 초원 샘플은 e2e 가 쓰며 `?sample=meadow` 로 엽니다.
- **정보 창**(도움말 > InitialEditor 정보): 판, 빌드한 커밋, 웹 엔진의 커밋과 기능, 데스크톱 앱이면 찾은 엔진(앱에 든 엔진이면 그 판), 제3자 고지(웹 엔진과 함께 실린 `engine/THIRD-PARTY.md`), 웹판이면 "데스크톱 앱 받기", 데스크톱 앱이면 "웹판 열기". 바깥 링크는 데스크톱 앱에서는 기본 브라우저로, 웹판에서는 새 탭으로 열립니다.
- 밖에서 바뀐 파일은 크기와 수정 시각만 비교해서 찾습니다(내용은 읽지 않는 폴링). 크기와 수정 시각이 둘 다 그대로인 변경(수정 시각을 보존하는 복사 등)은 놓칩니다.
- 이름 바꾸기는 브라우저의 `move()` 가 되면 그것을, 안 되거나 실패하면 복사 뒤 지우기를 씁니다. 크롬 153 은 파일에만 `move()` 가 있어서 폴더 이름 바꾸기는 늘 복사입니다. `move()` 쪽의 자동 테스트는 가짜 파일 시스템으로만 돕니다.
- **시크릿 창**: 크로미움의 시크릿 창(off-the-record 프로필)에서는 IndexedDB 에 기억한 폴더 핸들을 꺼내는 순간 탭이 아니라 브라우저 프로세스가 통째로 꺼집니다(크롬 153 에서 확인, 시크릿 창의 저장소도 함께 사라집니다). 그래서 "다시 열기"는 일반 창이라고 확신할 때만 핸들을 바로 꺼냅니다. 기준은 JS 힙 한도(`performance.memory.jsHeapSizeLimit`)를 알 수 있고, 저장 할당량이 그 두 배보다 크고 4 GiB 보다도 큰 것입니다. 나머지는 모두 핸들을 꺼내지 않고, 이유를 한 줄 알린 뒤 폴더 고르기 대화상자를 엽니다(크롬은 지난번에 고른 폴더에서 엽니다). 같은 폴더를 고르면 됩니다. 크롬 153 의 시크릿 창과 게스트 창은 할당량이 딱 2 GiB(쓴 뒤에는 2 GiB 에 사용량을 더한 값)이고, 일반 창은 10 GiB 였습니다. 힙 한도를 알려 주지 않는 브라우저는 일반 창이어도 폴더 고르기로 돕니다.
- 일반 창에서 핸들을 꺼내다 브라우저가 꺼진 흔적이 몇 분 안에 남아 있으면 그 페이지에서도 "다시 열기"가 폴더 고르기로 돕니다. 폴더를 하나 열면 흔적을 지웁니다.
- 로컬에서 웹판을 띄우려면 `yarn dev` 뒤 `http://127.0.0.1:5173/?backend=browser`. `?backend=opfs` 는 브라우저 전용 저장소(OPFS)를 폴더 대신 바로 여는 테스트용입니다 (`tests/e2e/web-folder.spec.ts`).

## 웹판 배포 (Cloudflare Pages)

Pages 는 저장소를 받아 `yarn build` 의 `dist/` 를 냅니다. 설정은 Pages 대시보드에 있고 저장소에는 `wrangler.toml` 을 두지 않습니다.
대시보드 값은 이렇습니다 (바꿀 때는 이 표도 고칩니다).

| 칸 | 값 |
|---|---|
| 프로젝트 | `initial-editor` |
| 빌드 명령 | `yarn build` |
| 출력 폴더 | `dist` |
| 루트 | `/` (저장소 루트) |
| Node | `.node-version` (22) |
| Yarn | `.yarnrc.yml` 의 `yarnPath` (Berry 4.3.1) |
| 환경 변수 | 없음. 정보 창의 커밋은 Pages 가 주는 `CF_PAGES_COMMIT_SHA` 를 `vite.config.ts` 가 읽습니다 |
| 프로덕션 | `main` 브랜치, https://initial-editor.biud436.com (https://initial-editor.pages.dev) |
| 미리보기 | `next` 와 PR 브랜치. `next` 는 https://next.initial-editor.pages.dev |

- Pages 빌드는 엔진을 만들지 않습니다. `packages/app/public/engine/` 에 커밋한 웹 엔진과 제3자 고지를 그대로 싣습니다.
- 응답 헤더는 `packages/app/public/_headers` 입니다: `engine/` 은 이름에 해시가 없어 `no-cache`, `Initial2D.wasm` 은 `application/wasm`(아니면 스트리밍 컴파일이 실패하고 콘솔에 오류 줄이 뜹니다), 해시 이름의 `assets/` 는 1년, 모든 응답에 `nosniff` 와 referrer 정책. 교차 출처 격리 헤더(COOP, COEP)와 CSP 는 두지 않습니다.
- 빌드한 `dist/` 검사: `node scripts/check-web-dist.mjs` 가 `index.html` 과 그것이 부르는 `assets/`, `_headers` 규칙(wasm 타입, 엔진 캐시, nosniff, 격리 헤더 없음), 웹 엔진 파일과 MANIFEST 의 sha256, `engine/THIRD-PARTY.md`, Pages 한도(파일 하나 25 MiB, 2만 개)를 봅니다. 데스크톱 번들용 빌드는 `--desktop` 을 붙여 소스맵이 없는지도 봅니다. 다른 폴더는 `--dist <폴더>`.
- 헤더까지 로컬에서 보려면 `wrangler pages dev` 로 Pages 를 흉내 냅니다 (`_headers` 를 적용합니다).

```sh
yarn build && node scripts/check-web-dist.mjs
npx wrangler@3 pages dev dist --port 8788                                  # http://127.0.0.1:8788/?backend=browser
PAGES_URL=http://127.0.0.1:8788 yarn test:e2e tests/e2e/pages.spec.ts       # 띄워 둔 Pages 로
PAGES_WRANGLER=1 yarn test:e2e tests/e2e/pages.spec.ts                      # 스펙이 wrangler 를 띄우고 끈다 (포트 PAGES_PORT, 기본 8788)
```

- `tests/e2e/pages.spec.ts` 는 헤더(wasm 타입, 캐시, nosniff, 격리 헤더 없음, 고지 파일)와 흐름(샘플 프로젝트 열기, F5, 맵에서 한 칸 칠해 저장, F5 로 그 칸만 바뀌는지, 스트리밍 컴파일 실패 줄이 없는지, 정보 창)을 봅니다. `PAGES_URL` 도 `PAGES_WRANGLER` 도 없으면 헤더 검사는 까닭을 적고 건너뛰고, 흐름은 Playwright 가 띄운 `vite preview` 로 돕니다. wrangler 를 받지 못하면 그 까닭도 적고 건너뜁니다.

## 에디터 안에서 실행 (E4)

엔진의 WebAssembly 빌드를 게임 탭의 canvas 에 올려 게임을 에디터 안에서 돌립니다. 브라우저 모드(브리지, 메모리, 웹판)의
F5 는 늘 이쪽이고, Tauri 앱은 설정의 **실행 방식**(프로세스, 에디터 안)으로 고릅니다. 상태 바의 엔진 칸에 방식이 붙습니다.

- F5 를 누르면 게임 탭이 열리고 `game.json`, `scripts/`, `resources/` 를 웹 엔진의 가상 파일 시스템에 올린 뒤 엔진이 뜹니다. `resources/rtp/`, `resources/aldebaran/src/`, `*.zip`, `*.psd`, 32 MB 를 넘는 파일은 올리지 않습니다. canvas 는 `game.json` 의 창 크기이고 탭에 맞춰 정수 배율로 커집니다 (탭이 작으면 줄인다).
- 게임 탭은 처음에 문서 영역 오른쪽의 새 그룹에 열려서 스크립트를 고치는 동안에도 보입니다. 탭을 다른 자리로 끌어 두면 닫았다 다시 열어도 그 자리에 열립니다 (에디터를 새로 고치면 처음 자리로).
- 게임 탭을 누르거나 (이미 앞에 있어도) 다른 자리로 끌어 옮기면 키가 게임으로 갑니다. F5, Shift+F5, Ctrl+F5, 리로드는 게임이나 스크립트 편집기나 입력 칸에 초점이 있어도, 한글을 조합하는 중이어도 에디터가 받고, 브라우저의 새로 고침으로 가지 않습니다. 리로드가 꺼져 있을 때 누른 Ctrl+Shift+R(mac은 Cmd+Shift+R)도 브라우저의 강력 새로 고침으로 가지 않습니다. 설정 같은 대화상자가 떠 있을 때는 단축키가 대화상자 몫이라 F5 도 아무것도 하지 않습니다. 브라우저 모드에서 저장하지 않은 문서가 있으면 페이지를 새로 고치거나 닫기 전에 묻습니다. 메모리 모드와 웹판의 "샘플로 해 보기"는 파일이 페이지에만 있어서, 이번에 저장한 것이 있으면 문서가 모두 저장되어 있어도 묻습니다. 브라우저는 누르기 전에는 소리를 내지 않아서, 소리가 멈춰 있으면 "소리 켜기"가 뜹니다 (게임 화면을 눌러도 켜진다).
- 출력(Lua `print`, 엔진 로그)은 콘솔에 오고 오류 줄은 링크입니다. 스크립트, 씬, 맵을 저장하면 그 파일만 다시 올리고 VM 을 다시 시작합니다 (콘솔에 "핫 리로드: 에디터 안 엔진"). 파일을 올리거나 엔진이 뜨는 중에 저장하면 엔진이 첫 프레임을 돈 뒤에 그 파일을 다시 올립니다. 그 사이 시작 스크립트나 첫 `update`, `render`의 오류가 나면 게임은 곧 끝나므로 고친 것을 올리지 않고 콘솔에 "게임이 뜨는 중에 끝나서 저장한 파일을 올리지 않았다" 한 줄을 남기니 F5로 다시 실행합니다. 실행 중에도 `update`나 `render`의 오류가 난 뒤 게임이 끝나기 전에 든 저장은 올리지 않고 "게임이 끝나서 저장한 파일을 올리지 않았다" 한 줄만 남깁니다 (종료 코드는 엔진이 준 1). 게임이 돌지 않을 때 저장하면 메모리 모드와 웹판(샘플 포함)은 아무것도 하지 않고 수동 리로드도 꺼져 있으며, 브리지 모드는 터미널에서 `INITIAL2D_HMR=1` 로 띄운 엔진으로 보내되 엔진이 없으면 콘솔에 "엔진이 떠 있지 않아 리로드를 건너뛰었다" 한 줄만 남깁니다. 정지하거나 게임 탭을 닫으면 엔진 인스턴스와 WebGL 컨텍스트를 버리고, 다시 실행하면 새로 띄웁니다.
- 스크립트 오류는 네이티브 엔진과 같은 줄(`Lua error in update: ./scripts/lua/main.lua:5: ...`, Ruby 는 `mruby: uncaught exception in update` 와 역추적)로 콘솔에 오고, 줄을 누르면 그 파일 그 줄로 갑니다. 끝나는 모양도 네이티브와 같습니다. 시작 때나 `Update`, `Render` 의 오류는 게임이 종료 코드 1 로 끝나고 (게임 탭 상태 띠 "오류로 끝남 (종료 코드 1)", 상태 바 "종료 코드 1"), 실행 중 저장한 스크립트의 오류는 스크립트만 멈추고 게임 탭은 살아 있어서 고쳐 저장하면 다시 그립니다 (콘솔에 경고). Ruby 의 끝없는 재귀는 C 를 거치는 것(문자열 보간 안의 `to_s` 같은)도 네이티브처럼 `SystemStackError` 이고, 엔진 바인딩 안에서 난 C++ 예외(타입이 틀린 맵을 읽은 `Tilemap.new` 같은)는 `RuntimeError` 라서 `rescue` 로 잡힙니다. 알려진 한계: 웹 엔진에서는 C를 거친 깊은 재귀 너머의 예외를 `rescue`로 잡을 때마다 게임이 멈춥니다. 크롬에서 수십 ms, DevTools가 붙어 있으면 수백 ms이고 네이티브는 0 ms입니다. 쌓인 프레임을 하나씩 풀어 내는 WebAssembly 예외 처리의 비용이라 엔진에서 고칠 수 없으므로, `update`마다 잡지 말고 끝없는 재귀를 고칩니다. 예외가 엔진 밖으로 나오면(엔진이 죽었다) 콘솔에 `fatal: 타입: 메시지` 줄이 찍히고 종료 코드 1 로 끝납니다. 웹 엔진에서 Lua 의 `os.exit` 와 Ruby 의 `exit!` 는 게임을 끝내지 않으므로 `GameExit()` 나 `System.exit` 을 씁니다. 이 판단과 FPS(엔진이 돈 프레임 수)는 엔진 로더의 `onExit`, `frames()`, `errorText()` 를 쓰고, 그것이 없는 옛 엔진 빌드에서는 줄과 window 오류로 알아내고 FPS 는 페이지의 프레임 수입니다.
- 웹 엔진 빌드에 mruby 가 들었으면(`MANIFEST.json` 의 기능이 `lua mruby wasm`) `game.json` 의 `script` 가 `mruby` 인 게임도 게임 탭에서 돕니다. mruby 없이 만든 빌드면 띄우지 않고 이유를 알립니다.
- 엔진 파일은 `packages/app/public/engine/` 에 든 엔진 저장소 웹 빌드의 사본이고 Cloudflare Pages 빌드에 그대로 실립니다. 엔진을 고쳤으면 엔진 저장소에서 `tools/build_web.sh` 를 돌린 뒤 `INITIAL2D_DIR=../Initial2D yarn sync:engine-web` 으로 다시 복사합니다. `MANIFEST.json` 에 엔진 커밋, 커밋 안 된 변경이 있었는지, sha256, 기능(wasm 에 libmruby 가 링크되었으면 `mruby`)이 적히고 단위 테스트가 파일과 대조합니다. `INITIAL2D_DIR` 저장소가 MANIFEST 의 엔진 커밋에 있으면 그 `build-web/site/` 와도 대조하고, 커밋이 다르면 까닭을 적고 건너뜁니다.
- e2e 는 `tests/e2e/game-view.spec.ts` 입니다. 메모리 모드 샘플(Lua 와 Ruby, Lua 오류 둘, Ruby 오류 둘. Ruby 오류는 네이티브 엔진이 같은 파일로 찍는 줄 묶음과 견줍니다)과, 엔진 저장소(`INITIAL2D_DIR`)가 있으면 알데바란 사본을 브리지 모드(포트 6073, `E2E_BRIDGE_PORT` 로 바꿉니다)로 Lua 와 Ruby 두 판 돌립니다. `GAME_VIEW_SCREENSHOT=<png 경로>` 를 주면 게임 탭을 찍어 둡니다.
- 같은 화면인지: 같은 e2e 가 엔진의 인수 씬(알데바란 타이틀, `INITIAL2D_ALDEBARAN_STOP=title`)을 같은 파일로 네이티브 엔진(헤드리스, 프로세스 실행과 같은 실행 파일)과 게임 탭에서 돌려 20 프레임째를 견줍니다. 규칙은 엔진의 골든 검사와 같습니다 (채널 차이 24 초과면 다른 픽셀, 다른 픽셀 2% 까지). 네이티브 실행 파일은 `INITIAL2D_NATIVE` (기본 `<엔진 저장소>/build/Initial2D`)이고, 없으면 엔진 저장소의 골든 `tests/golden/aldebaran_title.png` 와 견줍니다. 잰 값은 `docs/plans/e4-embedded-play.md` 에 있습니다.

## 씬 편집 (E2)

- `resources/scenes/*.json` 을 열면 씬 뷰(PIXI)가 뜹니다. 클릭과 상자 선택, 끌기(되돌리기 한 단계), 방향키(1px, Shift 10px), 격자와 스냅과 줌(Ctrl+=, Ctrl+-, Ctrl+0), 카메라 사각형은 `game.json` 의 창 크기와 배율에서 옵니다. 씬 뷰는 근사이고 진짜 화면은 실행이 보여 줍니다 (현재 씬부터 실행 Ctrl+F5).
- 계층 패널은 그리기 순서이고(위가 먼저), 눈 토글과 이름 바꾸기(F2)와 끌어서 순서 바꾸기가 됩니다. 인스펙터는 공통 칸(id, x, y, 표시)과 타입별 칸(스프라이트: 이미지와 프레임과 배율, 글자: 글과 폰트), 스크립트 목록(붙이기, 만들기, 열기, 순서, 매개변수), 검사 결과를 보여 줍니다.
- 컴포넌트와 매개변수: 인스펙터는 붙은 컴포넌트를 엔진이 부르는 순서대로 보여 주고, 위아래 단추로 순서를 바꿉니다. 매개변수는 `scripts/components/<경로>.json` 에 선언합니다 (Lua와 Ruby가 같은 파일을 씁니다). 선언이 있으면 인스펙터가 그 필드로 폼을 그리고, 고친 값만 씬 파일의 `params` 에 들어갑니다. "기본값 복원"은 고친 값을 지웁니다. 선언이 없으면 "매개변수 선언 만들기"가 오브젝트에 이미 있는 값의 형식으로 선언 파일을 만들어 엽니다. 편집기는 선언 파일을 스키마로 검사하고, 선언에 맞지 않는 값(모르는 키, 형식, 범위, 씬에 없는 오브젝트)은 검사 결과에 오류로 뜹니다. 형식은 엔진 `docs/plans/r1-scene-loader.md` 5.4절입니다.

  ```json
  { "version": 1, "fields": [
    { "key": "speed", "type": "number", "label": "속도", "default": 60, "min": 0 },
    { "key": "target", "type": "object", "label": "대상" }
  ] }
  ```

  필드 형식은 string, text, number, integer, boolean, enum(`values` 중 하나), object(씬 오브젝트 id)입니다. Lua 컴포넌트는 훅의 마지막 인자로 받고(`function Mover.update(obj, scene, elapsed, params)`), Ruby 컴포넌트는 `initialize(params = {})` 로 받습니다.

  씬 로더는 프로젝트를 만들 때 템플릿에서 복사됩니다. 엔진 v2.0.0-alpha.2 전에 만든 프로젝트의 로더는 params 를 넘기지 않으므로, 인스펙터가 이를 알리고 "씬 로더 교체"로 에디터에 든 로더로 덮어씁니다 (로더를 직접 고쳤다면 그 변경은 사라집니다).
- 씬 메뉴: 새 씬(Ctrl+Shift+N), 오브젝트 추가(Ctrl+Shift+A 또는 타입별 하위 메뉴), 시작 씬으로 지정(`game.json` 의 `startScene`). 편집 메뉴의 복사와 붙여넣기와 복제(Ctrl+D)와 삭제는 씬 탭에서 오브젝트를 다룹니다.
- 타일맵 오브젝트: 씬 > 오브젝트 추가 > 타일맵. 인스펙터에서 `resources/maps/`의 맵 파일을 고르면 씬 뷰가 그 맵의 레이어를 타일셋으로 오브젝트 자리에 그리고, 맵 파일이나 타일셋 그림이 바뀌면 다시 그립니다. 바닥 레이어 수(`groundLayers`)만큼의 앞 레이어는 씬의 모든 오브젝트 아래에, 나머지 레이어는 모든 오브젝트 위에 그립니다. 목록에서 타일맵보다 앞에 있는 오브젝트도 바닥 위에 보이고, 게임(엔진의 `scene_types/tilemap` 모듈이 같은 파일을 연다)과 같은 순서입니다. "맵 열기"는 그 맵을 맵 뷰로 엽니다.
  씬 뷰에서 타일맵은 배경처럼 다룹니다. 누르고 놓으면 고르고, 고른 뒤에 끌어야 옮겨지며, 고르지 않은 맵 위에서 끌면 상자 선택이 됩니다. 맵 파일을 고르지 않았거나, 고른 맵 파일이 없거나(지웠거나 이름을 바꿈), 있어도 엔진이 열지 못하는 맵(JSON이 아니거나, 버전과 크기가 틀렸거나, 레이어나 타일셋이 비었거나, 타일셋 그림이 없는 맵)을 가리키는 타일맵은 엔진이 씬을 거부하므로 검사 결과에 오류로 뜹니다. 검사는 엔진의 맵 읽기 규칙을 그대로 따라서, 엔진이 여는 맵은 오류로 보지 않습니다. 맵 파일이나 그 타일셋 그림이 바뀌면 다시 검사합니다.
- 새 프로젝트(Tauri): 빈 프로젝트, 플래피버드, 타일맵, RPG 데모 가운데 하나와 Lua 또는 Ruby. 엔진의 씬 로더와 진입 파일과 예제가 함께 들어갑니다. 타일맵은 타일셋과 맵 한 장(`resources/maps/start.json`), 그 맵을 여는 씬, 맵 오브젝트 스키마라서 맵을 칠하고 바로 F5 로 돌려 볼 수 있습니다. RPG 데모는 엔진의 「떠나기 전에」(타이틀, 항구 마을과 여관, 이벤트와 대화, 아이템)이고 RPG 레이어가 Lua 에만 있어 Lua 로만 만듭니다. `.gitignore` 에는 `.initial-editor/` 와 엔진이 실행할 때 쓰는 `config.setting` 이 들어갑니다.
- 템플릿 파일은 엔진 저장소의 사본입니다. `INITIAL2D_DIR=../Initial2D yarn sync:templates` 로 엔진 체크아웃에서 다시 맞추고, 엔진의 템플릿 묶음(`tools/pack_templates.py` 가 만든 `Initial2D-templates.zip`)에서 맞출 때는 `yarn sync:templates --from-zip <zip 이나 dist 폴더>` 입니다. 엔진의 추적 파일이 커밋과 다르면 멈추므로 엔진을 먼저 커밋합니다 (`--allow-dirty` 로 넘길 수는 있지만 그 사본은 단위 테스트가 막습니다).
- 교차 검사 `yarn test:engine-scene` 이 템플릿 셋 x 언어 둘을 임시 프로젝트로 써서 진짜 엔진을 헤드리스로 돌립니다. 빈 프로젝트는 컴포넌트에 매개변수 선언과 값을 주고 엔진이 넘긴 params 를 봅니다. 타일맵은 맵 문서로 칸 (24, 28) 을 표식 타일로 칠해 저장한 뒤 엔진 화면의 그 칸 색을 봅니다. 엔진은 `INITIAL2D_DIR` 의 `build/Initial2D` 이고, 배포용 빌드처럼 다른 실행 파일은 `INITIAL2D_EXE=<경로> yarn test:engine-scene` 으로 줍니다.

## 비주얼 스크립팅

컴포넌트를 노드 그래프로 만들 수 있습니다. 그래프는 새 실행기가 아니라 Lua 와 Ruby 코드를 만드는 원본이라서, 게임은 손으로 쓴 컴포넌트와 똑같이 돕니다 (씬 로더, 매개변수, 핫 리로드, 오류 줄). 계획과 포맷은 [docs/plans/visual-scripting.md](docs/plans/visual-scripting.md)입니다.

- 그래프는 `scripts/components/<경로>.graph.json` 이고 컴포넌트 `components/<경로>` 가 됩니다. 저장하면 `scripts/lua/components/<경로>.lua`, `scripts/ruby/components/<경로>.rb`, 매개변수를 선언했으면 선언 파일 `scripts/components/<경로>.json` 을 함께 씁니다. 생성 파일은 커밋합니다 (엔진은 그래프를 읽지 않습니다). 게임이 도는 중이면 생성 코드도 핫 리로드에 실립니다.
- 파일 > 새 그래프 컴포넌트(Ctrl+Alt+G)로 만들고, 그래프 파일을 열면 캔버스가 뜹니다. 노드는 오른쪽 클릭이나 두 번 클릭, 또는 포트에서 끈 선을 빈 곳에 놓아 여는 목록에서 더하고, 포트에서 포트로 끌어 잇습니다. 이어지지 않은 입력의 상수는 노드 안에서 고칩니다. 옆 창에서 고른 노드의 설정과 상태 필드, 지역 변수, 매개변수, 노드 라이브러리를 고칩니다. 자동 정렬, 되돌리기, 복사와 붙여넣기, 복제, 삭제가 됩니다.
- 이동은 가운데나 오른쪽 버튼(또는 Space 와 끌기), 확대는 휠, F 는 화면 맞춤이고, 오른쪽 아래 미니맵을 누르면 그 자리로 갑니다. 선의 오른쪽 클릭이나 Alt 와 포트 클릭은 연결을 끊습니다. 선을 빈 곳에 놓아 연 목록은 그 선에 이을 수 있는 노드만 보입니다.
- 머리줄의 "메모"는 선택한 노드를 감싸는 메모 상자를 만듭니다. 제목 줄을 끌면 안의 노드가 함께 움직입니다. 메모는 코드에 들어가지 않습니다.
- 오류가 있으면 코드를 만들지 않고, 노드 테두리와 옆 창의 문제 목록에 보입니다. 게임의 오류 줄(콘솔 링크)이 생성 파일을 가리키면 그래프를 열고 그 줄을 만든 노드를 고릅니다. 생성 파일은 스크립트 에디터에서 읽기 전용이고 "그래프 열기" 단추가 있습니다.
- 인스펙터의 컴포넌트 "열기"는 그 컴포넌트의 그래프가 있으면 그래프를 엽니다.
- 생성 파일의 첫 줄은 `-- 그래프에서 만든 파일: <그래프 경로>` 입니다. 이 줄이 없는 파일(손으로 쓴 파일)은 덮어쓰지 않습니다.
- 노드는 이벤트(init, update, render, destroy), 흐름(조건 분기, 값 분기, 반복), 상태와 지역 변수와 매개변수, 오브젝트와 props, 씬, 수학, 비교와 논리, 텍스트, 엔진 API(입력, 소리, 화면 크기 등 22개)입니다.
- 게임의 도우미 모듈은 노드 라이브러리(`*.nodes.json`)로 노드가 됩니다. 두 언어의 이름을 적어 두면 Lua 는 `flappy.GRAVITY`, Ruby 는 `FlappyCommon::GRAVITY` 로 부릅니다. 공유 상태 표를 반환하는 함수에 필드(`fields`)를 적어 두면 그 상태를 쓰는 그래프들이 필드를 다시 적지 않습니다.
- 예: 플래피 `bird` 전체를 노드 80개로 적은 그래프가 `packages/core/src/graph/fixtures/flappy/` 에 있고, 만든 코드(`bird.expected.lua`, `bird.expected.rb`)가 그 옆에 있습니다.

교차 검사 `yarn test:engine-graph` 는 그래프에서 만든 코드를 진짜 엔진으로 돌립니다. 플래피는 `bird` 를 그래프의 것으로 바꿔도 손으로 쓴 `bird` 와 같은 판(상태 전이, 점수, 요약)이 나오는지, 샘플러 그래프는 노드마다 찍은 값이 기대값과 같고 Lua 와 Ruby 가 같은지 봅니다.

```bash
INITIAL2D_DIR=../Initial2D yarn test:engine-graph   # 엔진 빌드(build/Initial2D)가 있어야 한다
KEEP_WORKDIR=1 yarn test:engine-graph               # 임시 프로젝트를 남긴다
```

## 맵 편집 (E3)

`resources/maps/*.json`(엔진 맵 포맷 v1, v2)을 열면 맵 뷰가 뜹니다. 알데바란 숲(256x28 칸)처럼 생성기가 만든 맵도
실제 타일셋으로 보이고, 몬스터와 순찰 범위, 흔적, 구간 같은 배치가 맵 위에 표식으로 나옵니다.

- 칠하기: 팔레트에서 한 칸을 누르거나 끌어서 여러 칸을 고르고 펜(B), 사각형(R), 채우기(G), 지우개(E), 스포이드(I)로 칠합니다. 붓질 한 번이 되돌리기 한 단계입니다. 칠할 레이어는 레이어 패널에서 고르고, 거기서 보이기와 이름과 추가, 삭제, 순서도 바꿉니다.
- 통행: 통행 도구(C)로 왼쪽 클릭은 통행 불가(1), 오른쪽 클릭이나 Alt는 통행 가능(0)입니다. 맵 > 통행 오버레이로 겹쳐 봅니다.
- 오브젝트: 오브젝트 도구(V)로 고르고 끌어 옮깁니다. 순찰 범위 손잡이와 띠 가장자리도 끌립니다. 맵 오브젝트 패널은 타입별 목록과 추가, 인스펙터는 프로젝트의 `resources/schema/map-objects.json`으로 만든 폼과 검사 결과입니다. 타입과 칸은 스키마가 정하므로 에디터는 몬스터가 무엇인지 모릅니다. 필수 칸이 비면(글 칸은 공백뿐이어도) 검사 결과에 뜹니다.
- 편집 메뉴: 맵 탭에서는 잘라내기, 복사, 붙여넣기, 복제(Ctrl+D), 삭제가 맵 오브젝트를 다룹니다. 붙인 것과 복제한 것은 한 칸 오른쪽에 놓이고 y는 그대로라 바닥에 선 몬스터와 시작 지점이 바닥에 남습니다. 순찰 범위도 같이 옮겨지고, 맵 오른쪽 끝이면 왼쪽으로 갑니다. 잘라내고 붙이면 id가 그대로라 옮기기가 됩니다(시작 지점은 `start` 그대로). 씬 오브젝트와는 클립보드가 따로입니다.
- 새 맵: 맵 > 새 맵(Ctrl+Alt+M). 이름, 크기, 타일 크기, 타일셋(프로젝트의 PNG), 레이어 이름, 통행을 정하면 `resources/maps/<이름>.json`이 생기고 열립니다.
- 크기 바꾸기: 맵 > 크기 바꾸기, 또는 맵 뷰 머리 띠의 크기를 누릅니다. 기준점(아홉 칸)에 따라 내용이 옮겨지고, 맵 밖으로 나가는 오브젝트는 지우지 않고 알려 줍니다.
- 이 맵에서 실행: 맵 > 이 맵에서 실행(Ctrl+F5, 데스크톱 앱). 스키마의 `play.env`를 채워 엔진을 띄웁니다. 오브젝트를 하나 골랐으면 그 자리(범위가 있는 몬스터는 범위 최소 X에서 48px 왼쪽), 아니면 커서나 화면 가운데서 시작합니다. 알데바란은 `INITIAL2D_ALDEBARAN_STAGE`와 `INITIAL2D_ALDEBARAN_AT`을 받습니다. 스키마의 `play`에 `"maps": ["aldebaran_*"]`처럼 맵 이름 글롭 목록(`*`는 아무 글자열, `?`는 한 글자)을 두면 맞는 맵에서만 엔진을 띄웁니다. 다른 맵에서도 여기서 실행과 Ctrl+F5는 켜져 있고, 누르면 띄우지 않고 이유를 토스트와 콘솔에 한 줄로 알립니다. 메뉴 툴팁에도 그 이유가 보입니다. 없으면 모든 맵에서 띄웁니다.
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

교차 검사 `yarn test:engine-map`은 맵 편집이 엔진과 맞는지 세 가지로 봅니다. 편집은 맵 뷰의 도구와 맵 문서, 씬 문서로 하고
저장도 앱과 같은 함수로 합니다.

- 통행: 타일맵 템플릿의 맵에서 통행을 막고 풀어 저장합니다. 씬에 탐침 컴포넌트를 붙여 엔진의 `IsPassable`(Ruby는 `passable?`)을
  칸마다 찍게 하고, 저장한 파일과 에디터 모델과 칸마다 같은지 봅니다. Lua와 Ruby 둘 다 돌립니다.
- 새 맵 골든: 새 맵 대화상자와 같은 함수로 맵을 만들고 두 레이어를 칠해 씬의 타일맵 오브젝트에 겁니다. 엔진의 프레임 30을
  저장한 맵과 타일셋으로 그린 기준과 견줍니다. 규칙은 숲과 같습니다 (채널마다 ±8, 레이어마다, 칠한 칸마다). Lua와 Ruby 둘 다 돌립니다.
- 항구 마을: 엔진 저장소 추적 파일의 사본에서 `port_town.json`을 이벤트 레이어가 붙은 채로 열고, 골든 화면 밖의 한 칸을 칠해
  저장합니다. 파일은 그 칸만 달라야 하고, 엔진의 인수 시나리오(`run_engine_tests.py --only=rpgdemo_scene`)가 칠하기 전과 같은
  결과로 통과해야 합니다. 짐 상자 대사가 저장한 이벤트의 글인지, 러너가 보는 맵 화면 셋(town, bag, wall)이 칠하기 전과 픽셀까지
  같은지도 봅니다. 러너의 골든 검사는 다른 픽셀 2%까지 받아서 한 칸 차이는 보지 못하기 때문입니다.

판마다 대조가 있습니다. 엔진에게만 고치기 전 맵, 칠하기 전 맵, deco를 비운 맵을 주면 판정이 떨어지는지 보고, 마을 첫 화면 안의
칸을 칠하면 그 화면이 그 칸 자리에서만 달라지는지 봅니다. 엔진 실행 파일이 없으면 `SKIP:` 한 줄을 찍고 통과합니다.
`INITIAL2D_DIR`이 git 저장소가 아니면 항구 마을만 건너뜁니다. 엔진 저장소는 고치지 않습니다.

```sh
INITIAL2D_DIR=../Initial2D yarn test:engine-map   # 엔진 빌드(build/Initial2D)와 python3, Pillow가 있어야 한다
KEEP_WORKDIR=1 yarn test:engine-map               # 임시 프로젝트와 엔진 사본을 남긴다
```

## 앱에 싣는 엔진

설치본은 엔진 실행 파일 하나를 앱 안에 싣습니다. 엔진 저장소의 `tools/build_dist.sh` 로 만든 배포용 빌드이고, 에디터가 묶이는 엔진 커밋은
`engine-pin.json` 에 있습니다.

```sh
# 핀이 엔진의 공개 릴리스를 가리키면 (engineTag) 엔진 빌드 없이 릴리스에서 받는다
yarn engine:fetch                                     # 핀의 sha256 으로 확인한다

# 엔진을 직접 만들 때: 엔진 저장소에서 (핀의 커밋으로 체크아웃한 뒤)
tools/build_dist.sh                                   # dist/Initial2D-<트리플>, dist/engine-dist.json

# 에디터에서
yarn engine:fetch --from ../Initial2D/dist            # src-tauri/binaries/ 와 src-tauri/licenses/engine/ 으로 받는다
yarn luals:fetch                                      # 앱에 싣는 언어 서버 LuaLS 를 src-tauri/luals/ 로 (설치본 빌드 전에)
node scripts/check-sidecar.mjs src-tauri/binaries/Initial2D-aarch64-apple-darwin
yarn tauri dev --config src-tauri/tauri.sidecar.conf.json     # 앱에 든 엔진으로 개발 빌드
yarn tauri build --config src-tauri/tauri.dist.conf.json --config src-tauri/tauri.sidecar.conf.json   # 설치본 (.app 과 dmg)
yarn engine:check                                     # 템플릿, 웹 엔진, RPG 픽스처, 받은 엔진이 핀의 커밋인지
```

- 설치본 빌드는 덮어쓰기 설정 둘을 이 순서로 줍니다. `tauri.dist.conf.json` 이 소스맵 없는 프런트(`yarn build:desktop`)와 제3자 고지(`licenses/`)와 언어 서버(`luals/`, 먼저 `yarn luals:fetch`)를, `tauri.sidecar.conf.json` 이 앱에 든 엔진과 `engine.json` 을 싣습니다. `--bundles` 를 주지 않으면 `.app` 과 함께 dmg 도 만들고, 그때 Finder 창이 잠깐 뜹니다. `.app` 만 만들려면 `--bundles app` 을 붙입니다.

- `--from` 폴더는 엔진의 `dist/` 나 `dist.yml` 산출물 폴더입니다. 엔진 커밋이 핀과 다르면 받지 않고, 다른 엔진을 잠깐 시험할 때는 `--any-commit` 을 붙입니다. `--target <트리플>` 로 다른 타깃을 받고, Windows 타깃은 엔진이 없어 고지만 받습니다. `--templates <빈 폴더>` 는 엔진 대신 템플릿 묶음(`Initial2D-templates.zip`)을 풉니다.
- 받은 파일은 gitignore 입니다: `src-tauri/binaries/Initial2D-<트리플>`, `src-tauri/binaries/engine.json`(판 정보. 상태 바 툴팁과 설정에 "앱에 든 엔진 (cac4b94, lua mruby)" 처럼 보입니다), `src-tauri/licenses/engine/THIRD-PARTY.md`.
- `check-sidecar.mjs` 는 받은 파일이나 빌드한 `.app` 을 받아 동적 의존(Homebrew 경로가 없는지), `--features`, `--version` 의 커밋이 핀과 `engine.json` 에 같은지, 모르는 인자에 종료 코드 2 인지 봅니다. 엔진은 버리는 임시 폴더에서 창 없이 돕니다. `engine.json` 은 받은 파일 옆(`src-tauri/binaries/engine.json`)이나 앱의 `Contents/Resources/engine/` 에서 찾고, 없으면 실패합니다. 다른 곳에 있으면 `--engine-json <경로>`, 엔진 실행 파일만 볼 때는 `--no-engine-json` 을 붙입니다.
- 엔진을 올릴 때는 `engine-pin.json` 의 `engineCommit` 을 바꾸고, 엔진 저장소를 그 커밋으로 체크아웃해 `yarn sync:templates`, `yarn sync:engine-web`, `yarn sync:rpg` 를 다시 돌린 뒤 `yarn engine:check` 로 맞춰졌는지 봅니다. `ciEngineRef` 는 새 엔진 코드가 필요한 PR 이 잠시 쓰는 칸이라 릴리스 전에는 비웁니다.
- 그 커밋에 엔진 태그와 공개 릴리스가 있으면 `yarn engine:pin <태그>` 로 핀을 릴리스에 묶습니다. 릴리스의 `engine-dist.json` 과 `SHA256SUMS.txt` 를 받아 `engineTag` 와 자산(타깃별 엔진, 템플릿 묶음, 제3자 고지)의 sha256 을 적습니다. 릴리스의 커밋이 핀과 다르면 쓰지 않습니다. 폴더에서 읽으려면 `--from <폴더>` 를 붙입니다.

## 설치 파일과 자가 검사

설치 파일은 GitHub Actions 의 `release` 워크플로가 만듭니다. macOS arm64 dmg, Linux AppImage 와 deb, Windows NSIS 입니다.
엔진은 `engine-pin.json` 의 커밋으로 워크플로 안에서 빌드해 싣고, 만든 설치본이 스스로 새 프로젝트를 만들어 돌려 본 뒤
번들과 `SHA256SUMS.txt` 를 산출물로 올립니다. Actions 탭에서 `release` 를 수동으로 돌리면(dry run) 산출물만 나오고,
`v*` 태그를 밀면 초안 릴리스까지 만듭니다. 공개는 직접 합니다. Windows 판에는 엔진이 없어 F5 가 에디터 안에서 돕니다.

설치 파일은 그 실행의 Summary 아래 Artifacts 에서 받습니다 (`InitialEditor-<커밋>` 하나에 전부와 `SHA256SUMS.txt`). 서명하지 않은 앱이라 처음 한 번 막힙니다.

- **macOS** (Apple Silicon만): dmg 를 열어 InitialEditor 를 응용 프로그램 폴더로 옮깁니다. 처음 열 때 막히면 시스템 설정 > 개인정보 보호 및 보안에서 "그래도 열기", 또는 `xattr -dr com.apple.quarantine /Applications/InitialEditor.app`
- **Windows**: 설치 파일을 열면 SmartScreen 이 막습니다. "추가 정보" 를 눌러 "실행". 사용자 폴더에 설치되어 관리자 권한은 필요 없습니다
- **Linux**: AppImage 는 `chmod +x InitialEditor_*.AppImage` 뒤 실행 (FUSE 2 가 필요합니다). deb 는 `sudo apt install ./InitialEditor_*.deb`

같은 안내가 [docs/releases/first-open.md](./docs/releases/first-open.md) 에 있고, 초안 릴리스 본문 맨 위에 들어갑니다.

```sh
yarn version:set 2.0.0-alpha.1    # 루트와 packages/*, Cargo.toml, Cargo.lock 의 판을 한꺼번에 바꾸고 yarn install
yarn version:check                # 판이 한 가지인지 (--tag v<판>, --bundles <번들 폴더> 는 릴리스 워크플로가 쓴다)
yarn licenses                     # src-tauri/licenses/THIRD-PARTY-editor.md 를 다시 쓴다 (의존성이 바뀌면. CI 는 --check)
yarn build:desktop                # 소스맵 없는 프런트 (릴리스 번들이 쓴다)

# 이 컴퓨터에서 설치본을 만들어 자가 검사
yarn engine:fetch --from ../Initial2D/dist
yarn luals:fetch
yarn tauri build --bundles app --config src-tauri/tauri.dist.conf.json --config src-tauri/tauri.sidecar.conf.json
yarn selftest:app src-tauri/target/release/bundle/macos/InitialEditor.app
yarn selftest:app <앱> --forest ../Initial2D     # 알데바란 숲에 한 칸을 칠해 게임 화면과 견주는 것까지
yarn selftest:app <앱> --rpg ../Initial2D        # 항구 마을의 이벤트 레이어와 이벤트 앞에서 실행, 자동 재생까지
```

- `yarn selftest:app` 은 창을 띄우지 않습니다. 앱을 자가 검사 모드(`INITIAL_EDITOR_SELFTEST=<계획 파일>`)로 띄우면, 앱에 든 템플릿으로
  플래피 Lua, 플래피 Ruby, 타일맵 프로젝트를 임시 폴더에 만들고, 타일맵은 맵 문서로 한 칸을 칠해 저장한 뒤, 셋 다 앱에 든 엔진으로 돌립니다.
  플래피 Lua 에서는 앱에 든 LuaLS 가 뜨고 진입 스크립트의 `Json.` 뒤 완성과 호버에 `Load` 가 나오는지도 봅니다.
  끝나면 `scripts/selftest-check.mjs` 가 실행마다 남은 전체 로그와 스크린샷으로 판정합니다. 작업 폴더(보고서, 로그, 스크린샷)는 지우지 않고 경로를 찍습니다.
- 자가 검사는 설정, 최근 프로젝트, 레이아웃, 창 위치, 웹뷰 저장소를 읽지도 쓰지도 않습니다. 확인 창이 뜨거나 웹뷰 보안 정책(CSP) 위반이 있으면 실패입니다.
- `--forest <엔진 저장소>` 는 숲 맵의 사본을 맵 뷰로 열어 deco 레이어의 빈 칸 하나를 칠해 저장하고 앱에 든 엔진으로 돌린 뒤, 게임 화면을 맵 뷰와 견주고 저장한 맵과 타일셋으로 직접 그린 기준과도 견줍니다. 레이어마다, 칠한 칸까지 게임 화면에 있어야 통과합니다 (게임이 레이어 하나를 빼고 그리거나 칠하기 전 맵을 돌리면 실패).
- `--rpg <엔진 저장소>` 는 항구 마을(`port_town.json`)의 사본을 맵 뷰로 열어 RPG 확장이 붙인 이벤트 레이어와 뷰가 그린 표식을 보고서에 적고, 맵 메뉴의 "이 이벤트 앞에서 실행"과 "이 이벤트 자동 재생"을 물고기 장수에게 앱에 든 엔진으로 돌립니다. 판정은 표식 17개가 맵 파일의 자리에 게임의 그리기 규칙대로 있는지, 게임이 이벤트를 다 읽었는지, 플레이어가 판정이 맵 파일로 셈한 자리에 섰는지(`rpg:player:`), 자동 재생이 이벤트를 돌렸는지(`rpg:event:`) 봅니다. `--forest` 와 같은 저장소면 사본 하나를 함께 씁니다.
- `--embedded` 는 에디터 안 실행을 더하는데 창이 뜹니다. `--total-timeout <ms>` 로 전체 시간을 줄일 수 있습니다.
- 로컬에서 dmg 까지 만들면(`--bundles app,dmg`) Finder 창이 잠깐 뜹니다. CI 에서는 뜨지 않습니다.
- CSP 는 `src-tauri/tauri.conf.json` 의 `app.security.csp` 입니다. 새 기능이 막히면 자가 검사 보고서의 `cspViolations` 에 무엇이 막혔는지 나옵니다.

## 안드로이드로 스테이징

데스크톱 앱의 "실행 > 안드로이드로 스테이징" 은 열린 프로젝트를 엔진 저장소의 `android/app/src/main/assets/` 로 옮깁니다. 엔진의
`android/prepare_assets.sh --project <프로젝트>` 를 부르는 것이라 엔진 저장소(Initial2D 체크아웃)와 bash, python3 이 있어야 합니다.
APK 빌드와 설치는 하지 않고, 끝나면 콘솔에 칠 명령을 적어 줍니다.

- 엔진 저장소는 설정의 "엔진 저장소" 칸, 열린 프로젝트 자신, 찾은 엔진의 저장소(`<저장소>/build/Initial2D`), 형제 폴더 `../Initial2D` 순서로 찾습니다.
  설정 칸이 아닌 곳에서 찾은 스크립트는 경로를 보이고 "스크립트 실행 허용" 을 누른 뒤에만 돌립니다. 허용은 프로젝트마다 앱 설정에 남고 설정에서 취소할 수 있습니다.
- 확인 대화상자가 파일 수와 크기를 미리 셉니다. 대상 폴더는 통째로 바뀝니다. `config.setting`, 점 파일, zip, psd 는 넣지 않습니다.
- "RTP 변환물 넣기" 는 기본 꺼짐입니다. 켜면 `resources/rtp/` 가 들어가는데 재배포할 수 없는 소재라 그 APK 는 개인 기기 시험에만 씁니다.
- Windows 는 Git for Windows 의 bash 와 Python 3 이 필요합니다.
- 엔진 저장소가 `--project` 를 모르는 판(`tools/stage_list.py` 가 없다)이면 미리 세기에서 멈추고 스크립트를 돌리지 않습니다. 엔진 저장소를 올립니다.
- 교차 검사: `INITIAL2D_DIR=../Initial2D yarn test:android-stage` 가 템플릿으로 만든 플래피 프로젝트를 에디터와 같은 인자로 임시 폴더에
  스테이징하고, 기기처럼 풀어 데스크톱 엔진으로 돌립니다. `--project` 를 모르는 엔진이나 빌드한 엔진이 없으면 건너뜁니다.

## RPG 이벤트 (E5)

맵 파일의 `events`를 맵 위에서 고치는 RPG 확장(`packages/ext-rpg`)입니다. 엔진의 이벤트 스키마(`resources/schema/event-commands.json`)와
게임 설정(`resources/data/rpg-game.json`)을 읽고, 엔진과 같은 검사를 같은 경로(`events[3].commands[2].text`)로 내고,
되돌릴 수 있는 명령으로 이벤트와 커맨드를 고칩니다. 고친 이벤트는 그 앞에서 바로 띄워 봅니다.
계약의 정본은 엔진의 `docs/plans/m2-rpg-events.md`입니다.

- 이벤트 레이어: `rpg-game.json`에 등록된 맵(항구 마을, 여관)을 열면 레이어 패널에 "이벤트" 줄이 오브젝트 위에 생깁니다.
  외형이 있는 이벤트는 CharSet의 서 있는 프레임이 게임과 같은 자리(발이 칸 아래 변)에, 나머지는 칸에 트리거 글자(말, 밟, 자, 병)로 보입니다.
  외형은 스키마의 후보 중 프로젝트에 있는 첫 그림이라 RTP가 있으면 RTP 그림입니다. 등록되지 않은 맵(알데바란, 샘플)에는 줄 대신
  한 줄 안내가 있고, 스키마가 없는 프로젝트에는 레이어 줄도, 맵 메뉴의 이벤트 항목도, 창 메뉴의 이벤트도 없습니다. RTP 판과 기본 판이
  따로 있는 맵(마을, 오두막)과 스키마 버전을 모르는 경우는 읽기 전용이고 이유가 자물쇠 옆에 보입니다. 읽기 전용이어도 맵 크기를 바꾸면
  이벤트는 타일과 함께 옮겨집니다. 레이어의 눈을 끄면 타일 레이어처럼 맵 뷰에서 고치지 않고 알립니다.
- 이벤트 도구(N): 클릭으로 고르기(Shift, Ctrl은 더하고 빼기), 빈 곳을 끌면 상자 선택, 끌어서 칸 단위로 옮기기(놓을 수 없는 칸이면
  빨간 미리보기로 알려 주고 제자리에 둡니다. 배회 구역도 같이 옮기고 Alt를 누르면 구역은 둡니다), 고른 이벤트의 배회 구역 가장자리 끌기,
  빈 칸 더블클릭으로 새 이벤트, 방향키로 한 칸, Delete로 지우기, Enter로 커맨드 편집기. Ctrl+C, Ctrl+V(커서 칸에), Ctrl+D는
  이벤트 전용 클립보드라 맵 오브젝트나 씬과 섞이지 않습니다. 끌기 한 번, 입력 칸의 타이핑 한 번이 되돌리기 한 단계입니다.
- 인스펙터: 스키마의 이벤트 칸(id, 칸, 방향, 트리거, 외형과 8명 격자, 지나가기, 막기, 속도, 배회)과 그 아래 커맨드 목록 편집기입니다.
  id를 바꾸면 이 맵의 `moveRoute`와 `turn`의 대상도 함께 바뀝니다. 커맨드 트리는 위아래로 줄, Enter로 인자 폼, Insert로 팔레트,
  Ctrl+위아래로 옮기기, Ctrl+C와 Ctrl+V로 여러 줄 복사와 붙여넣기, Delete로 빼기입니다 (macOS는 도구 줄의 넣기 단추나 끝 줄의 Enter).
  트리에서 누른 글자 키는 맵 도구를 바꾸지 않습니다. 인자 폼의 한 줄 칸은 Enter로 값을 넣고 폼에 남고, Escape로 트리에 돌아갑니다.
  입력 칸 안의 Ctrl+Z는 문서를 되돌리고 칸도 되돌린 글을 보입니다 (씬 인스펙터와 같습니다). 고른 이벤트는 번호가 아니라 이벤트라서
  앞의 이벤트를 지우고 되돌려도 같은 이벤트가 골라져 있습니다.
- 맵 이동의 대상 고르기: `transfer`(맵 인자와 x, y가 있는 커맨드)의 인자 폼 아래에 "맵에서 고르기"와 "대상 보기" 단추가 있고
  Tab으로 갈 수 있습니다. "맵에서 고르기"는 대상 맵(`rpg-game.json`의 `file`)을 탭으로 열고 뷰 위에 "타일을 클릭해 이동 위치 지정 (Esc: 취소)"
  띠를 띄웁니다. 타일을 누르면 원래 맵의 탭으로 돌아와 x, y가 한 번에 바뀌고(원래 맵의 되돌리기 한 단계) 그 커맨드의 폼이 열려 있습니다.
  Esc, 맵 밖이나 뷰 밖의 누름, 띠의 취소는 바꾸지 않고 돌아오고, 고르는 동안 원래 탭을 닫으면 바꾸지 않고 끝납니다. 같은 맵으로 가는
  이동이면 그 맵의 뷰에서 고릅니다. 고르는 동안 맵 도구는 누름과 키를 받지 않고, 휠과 오른쪽 끌기와 Space+끌기는 그대로 뷰를 옮깁니다.
  "대상 보기"는 대상 맵을 열고 x, y 타일을 뷰 가운데에 둡니다. 맵이 비었거나, `rpg-game.json`에 없거나, 파일이 없거나, 엔진이 열 수 없는
  맵(모르는 버전, 타일셋 그림 없음 등)이면 두 단추가 꺼지고 이유가 한 줄 보입니다. 읽기 전용 레이어는 고르기만, x, y가 없으면 대상 보기만 꺼집니다.
- 이벤트 패널(창 > 이벤트, 타일맵 레이아웃에 들어 있음): 이 맵의 이벤트 목록과 찾기(id, 트리거, 대사), 오류와 경고 수, 그리고 시작 상태
  한 줄(`arrived,item:warehouse_key=1` 꼴, `INITIAL2D_RPG_STATE`와 같은 규칙)입니다. 시작 상태는 맵마다 `.initial-editor/rpg-play.json`에 남습니다.
- 저장: 엔진이 건너뛸 오류가 있는 맵은 저장하기 전에 목록을 보이고 묻습니다. 에디터의 편집은 그런 값을 만들지 않으므로 밖에서 고친 파일에서만 나옵니다.
  객체가 아닌 이벤트 칸은 이벤트 패널에 `events[n]`과 함께 틀린 줄로 보입니다. 2^53을 넘는 정수(엔진은 64비트 정수로 읽습니다)는 글 그대로 저장합니다.
- 이 맵에서 실행(Ctrl+F5): 등록된 맵에서는 `rpg-game.json`의 `play`로 띄웁니다. 이벤트 하나를 골랐으면 그 앞 칸에서 이벤트 쪽을 보고,
  아니면 커서 칸, 그다음 뷰 가운데에서 가장 가까운 설 수 있는 칸에 아래를 보고 섭니다. 셋 다 없으면 정의 파일의 시작입니다.
  등록되지 않은 맵(알데바란)은 지금처럼 `map-objects.json`의 `play`(`maps`가 받는 맵만)로 띄웁니다.
- 이 이벤트 앞에서 실행, 이 이벤트 자동 재생: 인스펙터의 "앞에서 실행"과 "자동 재생" 단추, 맵 메뉴, 이벤트 패널 줄의 우클릭(또는 Shift+F10)에
  있습니다. 앞 칸은 외형과 방향이 있으면 이벤트가 바라보는 칸, 아니면 아래, 왼쪽, 오른쪽, 위 순서입니다. 자동 재생은 결정 키(action),
  이벤트 쪽으로 한 걸음(touch), 위치 없이 맵에 들어서기(auto)를 한 번 하고 대화를 알아서 넘기며(선택지는 첫 항목), 끝나면 게임이 스스로
  닫힙니다. parallel은 끝나지 않아 단추가 꺼지고 이유가 보입니다. 저장하지 않은 맵은 먼저 저장할지 묻습니다.
  에디터는 자동 재생의 줄을 지켜봅니다. 씬을 바꾸는 커맨드(데모의 배)로 게임이 새 게임으로 처음부터 다시 시작하면 그 자리에서 멈추고
  이유를 콘솔과 알림에 남깁니다. 게임이 끝났는데 그 이벤트의 `rpg:event:<id>` 줄이 없었으면 성공이 아니라 오류 줄로 알립니다.
  배회하는 NPC는 앞의 auto 이벤트가 도는 동안 자리를 떠날 수 있으니, 시작 상태로 그 auto를 건너뛰거나 앞에서 실행으로 손수 말을 겁니다.
- 시작 상태: 이벤트 패널의 시작 상태 칸에 적은 값이 세 실행에 `INITIAL2D_RPG_STATE`로 실립니다. 비우면 새 게임 그대로입니다.
  데모의 대사는 대부분 깃발과 아이템으로 갈리므로(`arrived,heardAltar`면 아이가 조개 목걸이를 줍니다) 여기에 적어 두고 봅니다.
- 실행의 변수와 콘솔: `play.env`의 `INITIAL2D_SCRIPT=lua`, `INITIAL2D_SCENE=rpg`, `INITIAL2D_MAP`, `INITIAL2D_RPG_AT`, `INITIAL2D_RPG_STATE`,
  `INITIAL2D_RPG_TRACE=1`에 자동 재생은 `play.probe`의 `INITIAL2D_AUTOPLAY=1`, `INITIAL2D_RPG_ROUTE`를 더합니다. 자동 재생은 에디터가
  게임의 줄을 지켜보므로 `play`에 없어도 `INITIAL2D_RPG_TRACE=1`을 늘 넣고, `play.probe`의 `{event}`는 그 이벤트의 id로 채웁니다.
  프로세스 실행과 게임 탭(웹 엔진) 모두 같은 변수이고, 콘솔에 `rpg:player:`(선 칸과 방향), `rpg:event:`, `rpg:message:이름|대사`, `rpg:route:done` 줄이 남습니다.
  `game.json`이 mruby여도 RPG 실행은 `INITIAL2D_SCRIPT=lua`로 덮으므로 언어 검사는 덮은 값으로 합니다.

- 픽스처: 모델 테스트는 엔진 파일의 사본(`packages/ext-rpg/test/fixtures/`)으로 돕니다. 이벤트 스키마, 게임 설정, 아이템 표,
  항구 마을과 여관 맵, 경로 대조 픽스처, 플레이스홀더 그림입니다. 엔진 쪽 파일이 바뀌면 `yarn sync:rpg`로 다시 맞춥니다.
  `MANIFEST.json`에 엔진 커밋(40자)과 sha256이 남고, 엔진 저장소가 옆에 있으면 사본이 엔진 파일과 같은지 테스트가 봅니다.
  `resources/rtp/`는 복사하지 않습니다. 엔진 작업 트리가 커밋과 다르면 멈추고, 그래도 복사하려면 `--allow-dirty`를 줍니다.
- 교차 검사: `yarn test:engine-events`는 엔진 저장소의 사본 프로젝트에서 항구 마을을 앱과 같은 길(맵 문서에 이벤트 레이어가 붙는다)로 열어
  모델의 명령만으로 이벤트를 만들고 저장한 뒤, 에디터의 실행 명령과 같은 함수로 만든 변수로 진짜 엔진을 헤드리스 프로세스로 띄워
  trace 줄(`rpg:player:`, `rpg:message:`, `rpg:route:done`)을 봅니다. 판은 다섯입니다: 말 걸기, 밟아서 여관으로 옮기기, auto 둘이 차례로 돌기,
  되돌린 맵을 시작 상태 `arrived`로 다시 띄우기, 여기서 실행(고른 이벤트 앞에 서기만). 그리고 러너처럼 줄을 지켜보는 자동 재생 둘이
  있습니다: 배(ship)는 새 게임으로 다시 시작하는 자리에서 멈추고, 배회하는 아이(kid)는 이벤트가 돌지 않았으면 실패로 알립니다. 여관으로 옮기는 판은
  대조 판 셋이 뒤따릅니다. `transfer`의 x, y, dir을 하나씩 빼고 띄워 도착 검사가 실제로 실패하는지 봅니다. 엔진 실행 파일이 없거나
  M2 계약 전의 엔진(Initial2D `74febb4` 이전)이면 `SKIP:` 한 줄을 찍고 통과합니다. 엔진 저장소는 고치지 않습니다.

```sh
INITIAL2D_DIR=../Initial2D yarn sync:rpg              # 엔진 파일을 픽스처로 복사하고 MANIFEST 갱신
INITIAL2D_DIR=../Initial2D yarn test:engine-events    # 엔진 빌드(build/Initial2D)가 있어야 한다
KEEP_WORKDIR=1 yarn test:engine-events                # 사본 프로젝트를 남긴다 (경로를 마지막에 찍는다)
yarn build && yarn test:e2e tests/e2e/rpg-layer.spec.ts  # 메모리 모드에 픽스처를 써 넣고 이벤트 레이어를 브라우저로 본다
RPG_LAYER_SCREENSHOT=/tmp/shots yarn test:e2e tests/e2e/rpg-layer.spec.ts  # 맵 뷰를 찍어 남긴다
INITIAL2D_DIR=../Initial2D yarn test:e2e tests/e2e/rpg-events.spec.ts     # 놓기부터 저장까지, 실행 명령의 변수, 브리지 모드의 자동 재생
yarn build && yarn test:e2e tests/e2e/rpg-editor.spec.ts  # 좁은 인스펙터, 입력 칸의 Ctrl+Z, 숨긴 레이어, RPG 아닌 프로젝트의 메뉴
INITIAL2D_DIR=../Initial2D yarn test:e2e tests/e2e/rpg-transfer-pick.spec.ts  # 맵 이동의 대상 고르기와 대상 보기, 브리지 모드의 저장
E2E_BRIDGE_PORT=6561 RPG_EVENTS_SCREENSHOT=/tmp/rpg.png yarn test:e2e tests/e2e/rpg-events.spec.ts  # 포트를 바꾸고 끝난 화면을 찍는다
```

`rpg-events.spec.ts`의 브리지 모드는 엔진 저장소의 `resources`(RTP 빼고)와 `scripts`를 임시 폴더에 복사해 열고, 아이를 고른 뒤 자동 재생을 눌러
게임 탭의 웹 엔진이 콘솔에 남긴 줄을 봅니다. 배의 자동 재생은 새 게임으로 다시 시작하는 자리에서 멈추는지 봅니다. 프로세스 실행은 브라우저로 볼 수 없어 `yarn test:engine-events`와 러너의 단위 테스트
(`RunnerStore.play.test.ts`, 실행 제공자의 변수가 `RunSpec.env`에 그대로 실린다)가 맡습니다.

## 프로젝트

프로젝트는 `game.json`이 있는 폴더입니다. 엔진이 작업 폴더의 `./game.json`을 읽으므로 새 개념이 아닙니다.
`game.json`이 없는 폴더(예: Initial2D 저장소 자체)를 열면 에디터가 만들 것인지 묻습니다. 에디터만 쓰는 상태
(레이아웃 등)는 `.initial-editor/`에 두므로 gitignore 하는 것을 권합니다.

프로젝트 패널은 처음에 프로젝트 파일(`game.json`, `scripts/`, `resources/`)만 보여 줍니다. 점으로 시작하는 이름도 빠집니다.
머리의 깔때기 단추 옆 숫자가 숨긴 항목 수이고, 누르면 전부 보입니다. 켜고 끈 상태는 `.initial-editor/project-view.json`에 남습니다.
프로젝트 최상위에 `.initial-editorignore`(`.gitignore` 문법)를 두면 더 뺄 수 있습니다.

```gitignore
# 작업 파일
*.psd
/resources/aldebaran/src/
```

프로젝트 전체 찾기, 게임 탭이 올리는 파일, 인스펙터의 이미지와 컴포넌트 목록도 이 파일을 따릅니다. `.gitignore`는 따르지 않습니다
(게임이 읽는 `resources/rtp`까지 숨기게 됩니다). 브리지 모드는 브리지가 이 파일을 넘겨주지 않아 기본 규칙만 씁니다.

## 저장소 구성

```
packages/core/            DOM 도 PIXI 도 모르는 모델: 프로젝트, 문서와 되돌리기, 커맨드와 메뉴, 확장 API, 로그, 설정
packages/backend-bridge/  ProjectBackend 의 브리지(HTTP + WebSocket) 구현
packages/backend-fsaccess/ ProjectBackend 의 브라우저 폴더(File System Access API) 구현. 웹판이 쓴다
packages/backend-tauri/   ProjectBackend 의 Tauri 구현 (invoke 래퍼). Rust 본체는 src-tauri/
packages/app/             React 셸: 도킹(dockview), 패널, 메뉴와 단축키, 테마, 두 진입 모드
packages/ext-tilemap/     타일맵 확장: 맵 모델(포맷, 타일 계산, 명령, 오브젝트 스키마, 오토타일)과 씬의 타일맵 오브젝트 타입,
                          다른 확장이 맵에 레이어와 이 맵에서 실행 제공자를 붙이고, 맵을 띄우고, 맵 뷰에서 타일을 고르는 자리(contrib.ts)
packages/ui/              React 입력 부품: 인스펙터의 숫자, 글, 스키마 칸 입력. 앱과 확장이 함께 쓴다
packages/ext-rpg/         RPG 확장: 이벤트 모델(스키마, 게임 설정, 검사, 명령, 실행 제공자와 실행 변수), 맵 뷰의 이벤트 레이어
                          (뷰, 도구, 인스펙터, 목록 패널), 커맨드 목록 편집기, 이벤트 실행 명령, 엔진 교차 검사
src-tauri/                Rust: 파일과 프로세스 명령, 감시, 핫 리로드 push, 앱에 든 엔진 찾기
tests/e2e/                Playwright (브라우저 모드)와 알데바란 인수 테스트, 도우미는 tests/e2e/support/
tests/scripts/            scripts/*.mjs 의 단위 테스트 (판 번호, 고지, 자가 검사 계획과 판정)
.github/workflows/        ci.yml (매 푸시), release.yml (설치 파일과 자가 검사)
docs/plans/               계획과 진행 상황
docs/design/              UI 용어와 문구 규칙 (ui-terms.md)
```

## 개발 명령

| 명령 | 무엇 |
|---|---|
| `yarn dev`, `yarn build`, `yarn preview` | 앱 (Vite) |
| `yarn typecheck`, `yarn lint` | TypeScript 와 ESLint (`core`와 `ext-rpg`의 모델은 DOM 과 PIXI 를 import 하지 못한다) |
| `yarn test` | Vitest 단위 테스트 (모든 패키지, e2e 도우미 `tests/e2e/support/*.unit.ts`, 스크립트 `tests/scripts/*.unit.ts`) |
| `yarn test:conformance` | 브리지 백엔드 적합성 (엔진 저장소의 브리지 서버를 임시 프로젝트로 띄운다. 위치는 `INITIAL2D_DIR`, 기본 `../Initial2D`) |
| `yarn test:rust` | `cargo test` (src-tauri) |
| `yarn test:engine-scene` | 에디터 템플릿으로 만든 프로젝트(빈, 플래피, 타일맵 x Lua, Ruby)를 진짜 엔진이 돌리는 교차 검사 (`INITIAL2D_DIR`, 실행 파일을 직접 줄 때는 `INITIAL2D_EXE`) |
| `yarn test:engine-map` | 맵 편집의 엔진 교차 검사 (위 "맵 편집 (E3)"): 통행 편집과 엔진의 막힘, 새 맵과 엔진 화면의 골든(Lua, Ruby), 항구 마을 한 칸을 칠한 뒤의 엔진 인수 시나리오 (`INITIAL2D_DIR`, 실행 파일을 직접 줄 때는 `INITIAL2D_EXE`) |
| `yarn test:android-stage` | 안드로이드 스테이징 교차 검사 (에디터와 같은 인자로 스테이징한 폴더만으로 데스크톱 엔진이 플래피를 돌린다, 스탬프, `config.setting` 과 RTP 가 빠지는지). 엔진 저장소는 `INITIAL2D_DIR` |
| `yarn test:engine-graph` | 그래프에서 만든 Lua 와 Ruby 를 진짜 엔진이 돌리는 교차 검사 (위 "비주얼 스크립팅"): 그래프의 플래피 `bird` 가 손으로 쓴 것과 같은 판인지, 샘플러의 값이 두 언어에서 같은지 (`INITIAL2D_DIR`, 실행 파일을 직접 줄 때는 `INITIAL2D_EXE`) |
| `yarn luals:fetch` | 앱에 싣는 언어 서버 LuaLS 를 받아(sha256 확인) 쓰지 않는 것을 빼고 `src-tauri/luals/` 에 푼다. 고지는 `src-tauri/licenses/luals/`. `--target <트리플>`, `--from <압축 파일>` |
| `yarn test:luals` | 진짜 LuaLS 와 에디터의 LSP 클라이언트 (`tests/luals/`): 새 RPG 프로젝트가 경고 없이 읽히는지, 스텁 없는 프로젝트의 진단, 완성, 호버, 정의, 참조, 이름 바꾸기. 먼저 `yarn luals:fetch`, 다른 실행 파일은 `INITIAL_EDITOR_LUALS` |
| `yarn test:engine-events` | 모델의 명령으로 만든 RPG 이벤트를 진짜 엔진이 돌리는 교차 검사 (항구 마을 사본, 네 판과 대조 세 판, `INITIAL2D_DIR`) |
| `yarn sync:templates` | 엔진 저장소의 씬 로더와 템플릿과 예제를 `packages/app/templates/` 로 복사하고 MANIFEST(출처, 엔진 커밋, sha256, 생성물 표시)를 갱신 (`INITIAL2D_DIR`). `--from-zip <zip 이나 dist 폴더>` 는 엔진의 템플릿 묶음에서 |
| `yarn sync:rpg` | 엔진 저장소의 RPG 이벤트 계약 파일을 `packages/ext-rpg/test/fixtures/` 로 복사하고 MANIFEST(출처, 엔진 커밋, sha256)를 갱신 (`INITIAL2D_DIR`) |
| `yarn engine:fetch` | 앱에 싣는 엔진을 받는다. `--from <엔진 dist 폴더>`, `--target <트리플>`, `--templates <폴더>`, `--any-commit` (위 "앱에 싣는 엔진") |
| `yarn engine:check` | 핀(`engine-pin.json`)과 엔진에서 온 MANIFEST 전부, 받아 둔 `engine.json` 의 엔진 커밋 대조 |
| `yarn engine:pin <태그>` | 핀을 엔진의 공개 릴리스에 묶는다 (`engineTag` 와 자산의 sha256). `--from <폴더>` (위 "앱에 싣는 엔진") |
| `yarn version:set <판>`, `yarn version:check` | 판 번호를 한꺼번에 바꾸거나 한 가지인지 본다 (위 "설치 파일과 자가 검사") |
| `yarn licenses` | 에디터의 제3자 고지 `src-tauri/licenses/THIRD-PARTY-editor.md` 를 다시 쓴다 (`scripts/gen-licenses.mjs`). `--check` 는 다르면 실패 |
| `yarn build:desktop` | 소스맵 없는 빌드 (데스크톱 번들용, `src-tauri/tauri.dist.conf.json` 이 부른다) |
| `yarn selftest:app <앱>` | 빌드한 앱의 자가 검사 (창 없음). `--forest <엔진 저장소>`, `--rpg <엔진 저장소>`, `--embedded`, `--plan <계획> --no-check` |
| `yarn sync:engine-web` | 엔진 저장소의 웹 빌드(`build-web/site/` 의 `Initial2D.js`, `Initial2D.wasm`, `initial2d-loader.js`)와 제3자 고지(`THIRD-PARTY.md`)를 `packages/app/public/engine/` 으로 복사하고 MANIFEST(출처, 엔진 커밋, sha256, 기능)를 갱신 (`INITIAL2D_DIR`). 먼저 엔진 저장소에서 `tools/build_web.sh` |
| `yarn test:engine` | 진짜 엔진과 핫 리로드 교차 검사 (엔진을 헤드리스로 띄우고 I2DH 묶음을 보내 `HotReload: reloaded` 를 본다). 엔진 저장소 위치는 `INITIAL2D_DIR`, 기본 `../Initial2D` |
| `yarn test:e2e` | Playwright, Chromium 으로 모든 스펙 (먼저 `yarn build`, 처음 한 번 `yarn playwright install chromium`). 브리지 모드와 알데바란 인수 테스트는 `INITIAL2D_DIR`의 엔진 저장소를 쓰고, 없으면 건너뜁니다. 포트는 환경 변수로 바꿉니다: `E2E_PORT`(미리보기, 기본 4173), `E2E_BRIDGE_PORT`(브리지를 고정 포트로 띄우는 테스트의 포트) |
| `yarn test:e2e:webkit` | 같은 Playwright 를 WebKit(macOS 앱의 웹뷰 WKWebView 와 같은 엔진)으로. 브라우저 엔진에 따라 동작이 갈리는 스펙(`playwright.config.ts` 의 `WEBKIT_SPECS`: 스크립트 편집, 스크립트 탭 여럿, 그래프, 언어 서버, 분석기 워커)만 돕니다. 언어 서버 스펙(`language-server.spec.ts`)은 `yarn luals:fetch` 로 받은 LuaLS 를 시험 프로세스가 띄워 붙이고, 없으면 CI 가 아닐 때 건너뜁니다. 처음 한 번 `npx playwright install --with-deps webkit`, 스펙 하나만은 `yarn test:e2e:webkit tests/e2e/script-tabs.spec.ts` |
| `yarn check:colors` | 토큰 파일 밖의 색 리터럴 검사 (테마 규칙) |
| `yarn check:terms` | UI 문구 검사: `packages/*/src`, `src-tauri/src` 의 문자열 리터럴과 JSX 텍스트에서 쓰지 않는 말과 한다체 끝맺음을 찾는다 (규칙은 아래 "UI 문구"). 폴더나 파일을 주면 거기만 |
| `node scripts/check-web-dist.mjs` | 빌드한 `dist/` 검사 (`_headers`, 웹 엔진과 MANIFEST, 고지, Pages 한도). `--desktop` 은 소스맵이 없는지도 (위 "웹판 배포") |
| `yarn tauri <cmd>` | Tauri CLI |

## 테마

색은 `packages/app/src/theme/tokens.css`의 토큰(CSS 변수)으로만 씁니다. `<html data-theme="dark|light">`로 바뀌고
기본은 OS 설정을 따릅니다. 새 테마는 토큰 값 한 벌을 더하면 됩니다. 규칙은
[docs/plans/02-scope-and-screens.md](./docs/plans/02-scope-and-screens.md) 6절.

## UI 문구

화면, 알림, 콘솔, 오류에 쓰는 말은 [docs/design/ui-terms.md](./docs/design/ui-terms.md)의 용어표와 끝맺음 규칙을 따릅니다.
같은 대상은 어디서나 같은 말로 부르고(타일, 브러시, 게임 탭, 이 맵에서 실행), 메뉴와 레이블과 상태는 짧은 명사구로 씁니다.
설명, 알림, 오류, 확인 대화상자의 사실과 결과는 합니다체로 쓰고 질문은 `~할까요?`로 씁니다. 문장이 둘 이상이면 문장마다 마침표를 찍습니다.
변수 뒤에는 받침에 따라 달라지는 조사를 붙이지 않습니다. 새 문구를 넣으면 `yarn check:terms`를 돌립니다.
테스트를 뺀 소스의 문자열 리터럴과 JSX 텍스트에서 쓰지 않는 말, 한다체 끝맺음, 확실하게 구분되는 전보체 끝맺음을 찾고, CI도 색 리터럴 검사 옆에서 같은 검사를 합니다.
규칙이 맞지 않는 줄(새 스크립트 템플릿이 쓰는 코드 주석 같은 것)은 줄 끝에 `// terms-ok: <이유>` 를 적어 뺍니다.

## 옛 에디터

2020년부터의 타일맵 에디터(PIXI 7, jQuery 시절의 셸)는 E3에서 지웠습니다. 옛 기능이 새 에디터의 어디로 갔는지는
[docs/plans/e3-tilemap.md](./docs/plans/e3-tilemap.md)의 이전표에 있고, 코드는 git 이력에 남아 있습니다.

# License

MIT.
