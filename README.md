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

- 프로젝트 패널에서 `.lua`, `.rb`, `.json` 을 열면 Monaco 편집기가 뜹니다. Ctrl+S 로 저장하면 (설정이 켜져 있으면) 실행 중인 게임에 핫 리로드가 갑니다. 밖에서 파일이 바뀌면 수정 중이 아닐 때는 조용히 다시 읽고, 수정 중이면 배너로 묻습니다. 저장할 때 디스크의 파일이 연 때와 다르면(배너에서 내 것 유지를 골랐어도, 파일이 지워졌어도) 덮어쓰기, 다시 읽기, 취소를 모달로 한 번 더 묻습니다. 씬, 맵, 모두 저장도 같습니다. 다시 읽기는 저장하지 않은 수정을 버리므로 한 번 더 확인하고, 디스크의 파일이 깨져 다시 읽지 못하면 "다시 읽지 못했다"고 알린 뒤 내 수정과 배너를 그대로 둡니다. 큰 맵을 쓰는 중에 고치고 다시 저장하면 앞의 쓰기가 끝난 뒤 최신 내용으로 한 번 더 저장합니다.
- 자동완성은 프로젝트의 `resources/api/initial2d-api.json`(엔진 저장소가 만들어 둔 API 명세)을 읽습니다. 없으면 내장 기본값으로 동작하며 콘솔에 그렇게 적힙니다. `Input.` 뒤에 멤버, `(` 뒤에 시그니처, 빈 파일에서 씬 계약 네 함수 스니펫.
- 찾기: 편집기 안 Ctrl+F, 프로젝트 전체 Ctrl+Shift+F (대소문자, 정규식). 새 스크립트 Ctrl+Alt+N (씬 템플릿 또는 컴포넌트 템플릿, Lua 나 Ruby).
- 엔진 프로세스 실행(F5, 설정의 실행 방식이 프로세스일 때)은 Tauri 앱에서만 됩니다. 브라우저에서는 F5 가 에디터 안 게임 탭에서 돕니다 (아래 "에디터 안에서 실행"). 엔진은 설정의 경로, 프로젝트의 `.initial-editor/engine`(한 줄 경로), 프로젝트 안 `build/Initial2D`, 형제 폴더 `../Initial2D/build/Initial2D` 순서로 찾고 `--features` 로 확인합니다. 정지 Shift+F5, 리로드 Ctrl+Shift+R. 엔진 출력은 콘솔에 오고 `파일:줄:` 은 링크라 누르면 그 줄로 갑니다.
- 배포된 페이지(Cloudflare Pages 등, 로컬이 아닌 호스트)에서는 브리지에 닿을 수 없어 웹판(브라우저 폴더)으로 시작합니다. 폴더 열기가 없는 브라우저는 메모리 모드입니다. 아래 "웹판" 절.

## 웹판 (브라우저에서 폴더 열기)

같은 앱을 Cloudflare Pages 에 올린 것이 웹판입니다. 설치 없이 브라우저가 내 컴퓨터의 프로젝트 폴더를 직접 읽고 씁니다
(File System Access API, 서버 없음). 게임은 게임 뷰에서 엔진의 WASM 빌드로 페이지 안에서 돕니다.

- **브라우저**: 크롬, 엣지 같은 크로미움 계열 데스크톱 브라우저. 파이어폭스와 사파리에는 폴더 열기가 없어서 샘플 프로젝트(메모리 모드)로 시작하고 시작 화면에 그렇게 적힙니다.
- **폴더 열기**: 시작 화면의 "폴더 열기"(또는 Ctrl+O, 파일 > 프로젝트 열기. "샘플로 해 보기" 뒤에도 같습니다)로 `game.json` 이 있는 폴더를 고르고, 브라우저가 묻는 수정 권한에 동의합니다. 연 폴더는 브라우저(IndexedDB)가 폴더 이름으로 기억해 "최근 폴더"와 파일 > 최근 프로젝트에 나옵니다. 같은 이름의 폴더를 다시 고르면 목록이 늘지 않고 그 자리를 새로 고른 폴더로 바꿉니다. 브라우저가 권한을 기억하지 않았으면 "다시 열기"를 누를 때 한 번 더 묻습니다.
- 열린 프로젝트에 저장하지 않은 문서가 있으면 폴더를 고른 뒤 닫을지 먼저 묻습니다. 여기서 취소하면 기억한 폴더 목록도 지금 열린 프로젝트도 그대로입니다.
- **되는 것**: 파일 트리, 스크립트와 씬과 맵 편집, 저장(임시 파일에 쓰고 한 번에 바꾼다), 이름 바꾸기와 지우기, 밖에서 바뀐 파일 감지(1.5초 간격으로 확인). **안 되는 것**: 새 프로젝트 만들기, 엔진 실행 파일 띄우기(Tauri 앱의 일).
- 밖에서 바뀐 파일은 크기와 수정 시각만 비교해서 찾습니다(내용은 읽지 않는 폴링). 크기와 수정 시각이 둘 다 그대로인 변경(수정 시각을 보존하는 복사 등)은 놓칩니다.
- 이름 바꾸기는 브라우저의 `move()` 가 되면 그것을, 안 되거나 실패하면 복사 뒤 지우기를 씁니다. 크롬 153 은 파일에만 `move()` 가 있어서 폴더 이름 바꾸기는 늘 복사입니다. `move()` 쪽의 자동 테스트는 가짜 파일 시스템으로만 돕니다.
- **시크릿 창**: 크로미움의 시크릿 창(off-the-record 프로필)에서는 IndexedDB 에 기억한 폴더 핸들을 꺼내는 순간 탭이 아니라 브라우저 프로세스가 통째로 꺼집니다(크롬 153 에서 확인, 시크릿 창의 저장소도 함께 사라집니다). 그래서 "다시 열기"는 일반 창이라고 확신할 때만 핸들을 바로 꺼냅니다. 기준은 JS 힙 한도(`performance.memory.jsHeapSizeLimit`)를 알 수 있고, 저장 할당량이 그 두 배보다 크고 4 GiB 보다도 큰 것입니다. 나머지는 모두 핸들을 꺼내지 않고, 이유를 한 줄 알린 뒤 폴더 고르기 대화상자를 엽니다(크롬은 지난번에 고른 폴더에서 엽니다). 같은 폴더를 고르면 됩니다. 크롬 153 의 시크릿 창과 게스트 창은 할당량이 딱 2 GiB(쓴 뒤에는 2 GiB 에 사용량을 더한 값)이고, 일반 창은 10 GiB 였습니다. 힙 한도를 알려 주지 않는 브라우저는 일반 창이어도 폴더 고르기로 돕니다.
- 일반 창에서 핸들을 꺼내다 브라우저가 꺼진 흔적이 몇 분 안에 남아 있으면 그 페이지에서도 "다시 열기"가 폴더 고르기로 돕니다. 폴더를 하나 열면 흔적을 지웁니다.
- 로컬에서 웹판을 띄우려면 `yarn dev` 뒤 `http://127.0.0.1:5173/?backend=browser`. `?backend=opfs` 는 브라우저 전용 저장소(OPFS)를 폴더 대신 바로 여는 테스트용입니다 (`tests/e2e/web-folder.spec.ts`).

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
- 이벤트 패널(창 > 이벤트, 타일맵 레이아웃에 들어 있음): 이 맵의 이벤트 목록과 찾기(id, 트리거, 대사), 오류와 경고 수, 그리고 시작 상태
  한 줄(`arrived,item:warehouse_key=1` 꼴, `INITIAL2D_RPG_STATE`와 같은 규칙)입니다. 시작 상태는 맵마다 `.initial-editor/rpg-play.json`에 남습니다.
- 저장: 엔진이 건너뛸 오류가 있는 맵은 저장하기 전에 목록을 보이고 묻습니다. 에디터의 편집은 그런 값을 만들지 않으므로 밖에서 고친 파일에서만 나옵니다.
  객체가 아닌 이벤트 칸은 이벤트 패널에 `events[n]`과 함께 틀린 줄로 보입니다. 2^53을 넘는 정수(엔진은 64비트 정수로 읽습니다)는 글 그대로 저장합니다.
- 여기서 실행(Ctrl+F5): 등록된 맵에서는 `rpg-game.json`의 `play`로 띄웁니다. 이벤트 하나를 골랐으면 그 앞 칸에서 이벤트 쪽을 보고,
  아니면 커서 칸, 그다음 뷰 가운데에서 가장 가까운 설 수 있는 칸에 아래를 보고 섭니다. 셋 다 없으면 정의 파일의 시작입니다.
  등록되지 않은 맵(알데바란)은 지금처럼 `map-objects.json`의 `play`(`maps`가 받는 맵만)로 띄웁니다.
- 이 이벤트 앞에서 실행, 이 이벤트 자동 재생: 인스펙터의 "앞에서 실행"과 "자동 재생" 단추, 맵 메뉴, 이벤트 패널 줄의 우클릭(또는 Shift+F10)에
  있습니다. 앞 칸은 외형과 방향이 있으면 이벤트가 바라보는 칸, 아니면 아래, 왼쪽, 오른쪽, 위 순서입니다. 자동 재생은 말 걸기(action),
  이벤트 쪽으로 한 걸음(touch), 위치 없이 맵에 들어서기(auto)를 한 번 하고 대화를 알아서 넘기며(선택지는 첫 항목), 끝나면 게임이 스스로
  닫힙니다. parallel은 끝나지 않아 단추가 꺼지고 이유가 보입니다. 저장하지 않은 맵은 먼저 저장할지 묻습니다.
  에디터는 자동 재생의 줄을 지켜봅니다. 씬을 바꾸는 커맨드(데모의 배)로 게임이 새 게임으로 처음부터 다시 시작하면 그 자리에서 멈추고
  이유를 콘솔과 알림에 남깁니다. 게임이 끝났는데 그 이벤트의 `rpg:event:<id>` 줄이 없었으면 성공이 아니라 오류 줄로 알립니다.
  배회하는 NPC는 앞의 auto 이벤트가 도는 동안 자리를 떠날 수 있으니, 시작 상태로 그 auto를 건너뛰거나 앞에서 실행으로 손수 말을 겁니다.
- 시작 상태: 이벤트 패널의 시작 상태 칸에 적은 값이 세 실행에 `INITIAL2D_RPG_STATE`로 실립니다. 비우면 새 게임 그대로입니다.
  데모의 대사는 대부분 깃발과 아이템으로 갈리므로(`arrived,heardAltar`면 아이가 조개 목걸이를 줍니다) 여기에 적어 두고 봅니다.
- 실행의 변수와 콘솔: `play.env`의 `INITIAL2D_SCRIPT=lua`, `INITIAL2D_SCENE=rpg`, `INITIAL2D_MAP`, `INITIAL2D_RPG_AT`, `INITIAL2D_RPG_STATE`,
  `INITIAL2D_RPG_TRACE=1`에 자동 재생은 `play.probe`의 `INITIAL2D_AUTOPLAY=1`, `INITIAL2D_RPG_ROUTE`를 더합니다. 프로세스 실행과 게임 탭(웹 엔진)
  모두 같은 변수이고, 콘솔에 `rpg:player:`(선 칸과 방향), `rpg:event:`, `rpg:message:이름|대사`, `rpg:route:done` 줄이 남습니다.
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
E2E_BRIDGE_PORT=6561 RPG_EVENTS_SCREENSHOT=/tmp/rpg.png yarn test:e2e tests/e2e/rpg-events.spec.ts  # 포트를 바꾸고 끝난 화면을 찍는다
```

`rpg-events.spec.ts`의 브리지 모드는 엔진 저장소의 `resources`(RTP 빼고)와 `scripts`를 임시 폴더에 복사해 열고, 아이를 고른 뒤 자동 재생을 눌러
게임 탭의 웹 엔진이 콘솔에 남긴 줄을 봅니다. 배의 자동 재생은 새 게임으로 다시 시작하는 자리에서 멈추는지 봅니다. 프로세스 실행은 브라우저로 볼 수 없어 `yarn test:engine-events`와 러너의 단위 테스트
(`RunnerStore.play.test.ts`, 실행 제공자의 변수가 `RunSpec.env`에 그대로 실린다)가 맡습니다.

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
packages/ext-tilemap/     타일맵 확장: 맵 모델(포맷, 타일 계산, 명령, 오브젝트 스키마, 오토타일)과 씬의 타일맵 오브젝트 타입,
                          다른 확장이 맵에 레이어와 여기서 실행 제공자를 붙이고 맵을 띄우는 자리(contrib.ts)
packages/ui/              React 입력 부품: 인스펙터의 숫자, 글, 스키마 칸 입력. 앱과 확장이 함께 쓴다
packages/ext-rpg/         RPG 확장: 이벤트 모델(스키마, 게임 설정, 검사, 명령, 실행 제공자와 실행 변수), 맵 뷰의 이벤트 레이어
                          (뷰, 도구, 인스펙터, 목록 패널), 커맨드 목록 편집기, 이벤트 실행 명령, 엔진 교차 검사
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
| `yarn test:engine-events` | 모델의 명령으로 만든 RPG 이벤트를 진짜 엔진이 돌리는 교차 검사 (항구 마을 사본, 네 판과 대조 세 판, `INITIAL2D_DIR`) |
| `yarn sync:rpg` | 엔진 저장소의 RPG 이벤트 계약 파일을 `packages/ext-rpg/test/fixtures/` 로 복사하고 MANIFEST(엔진 커밋, sha256)를 갱신 (`INITIAL2D_DIR`) |
| `yarn sync:engine-web` | 엔진 저장소의 웹 빌드(`build-web/site/` 의 `Initial2D.js`, `Initial2D.wasm`, `initial2d-loader.js`)를 `packages/app/public/engine/` 으로 복사하고 MANIFEST(커밋, sha256, 기능)를 갱신 (`INITIAL2D_DIR`) |
| `yarn test:engine` | 진짜 엔진과 핫 리로드 교차 검사 (엔진을 헤드리스로 띄우고 I2DH 묶음을 보내 `HotReload: reloaded` 를 본다). 엔진 저장소 위치는 `INITIAL2D_DIR`, 기본 `../Initial2D` |
| `yarn test:e2e` | Playwright (먼저 `yarn build`, 처음 한 번 `yarn playwright install chromium`). 브리지 모드와 알데바란 인수 테스트는 `INITIAL2D_DIR`의 엔진 저장소를 쓰고, 없으면 건너뜁니다. 포트는 환경 변수로 바꿉니다: `E2E_PORT`(미리보기, 기본 4173), `E2E_BRIDGE_PORT`(브리지를 고정 포트로 띄우는 테스트의 포트) |
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
