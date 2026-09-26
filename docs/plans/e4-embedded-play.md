# E4: 내장 플레이. 게임이 에디터 안에서 돈다

**권장 모델**: Claude Fable 5. 엔진의 빌드 시스템과 파일 시스템과 메인 루프에 걸친 작업이고, 실패 원인이 여러 층에 숨는다.

> 목표: **게임 뷰 패널에서 게임이 돈다.** 저자의 요구 "인게임은 프로그램 형도 가능하고, 프로그램 자체에서 돌아도 됩니다"의
> 뒷부분이다. 부산물로 브라우저에서 도는 웹 데모가 생긴다.

## 방식

엔진을 Emscripten으로 빌드한 `Initial2D.wasm`을 게임 뷰의 canvas에 올린다. 에디터가 PIXI로 게임을 흉내 내는 것이 아니라
**진짜 엔진이 웹뷰 안에서 돈다.** 그래서 씬 뷰(근사)와 달리 게임 뷰는 프로세스 실행(모드 A)과 같은 화면이다.

| 자리 | 프로세스 실행 (E1) | 내장 실행 (E4) |
|---|---|---|
| 엔진 | 네이티브 실행 파일 | WASM (Emscripten, SDL2 포트) |
| 파일 | 프로젝트 폴더 그대로 | 가상 파일 시스템에 스테이징 (백엔드로 읽어 MEMFS에 쓴다) |
| 환경 변수 | 프로세스 env | `Module` 설정으로 넘겨 엔진이 `getenv` 대신 읽게 (엔진 쪽 작은 어댑터) |
| 핫 리로드 | TCP `I2DH` | 파일을 다시 올리고 export 함수 `initial2d_reload()` 호출 |
| 콘솔 | stdout 파이프 | `Module.print`와 `printErr` |
| 입력 | 엔진 창 | canvas 포커스. 키와 마우스와 터치는 SDL2 포트가 받는다 |
| 오디오 | SDL2_mixer | SDL2_mixer 포트(Web Audio). 첫 클릭 뒤에 켜진다 (브라우저 정책) |
| 언어 | Lua와 mruby | Lua 먼저. mruby는 libmruby를 emcc로 교차 빌드한 뒤 |

## 선행 조건

- E1 완료 (같은 실행 버튼과 콘솔을 쓴다).
- **R3(엔진 Emscripten 빌드)**: 엔진 저장소 작업. CMake에 `EMSCRIPTEN` 분기(SDL2, SDL2_image, SDL2_mixer 포트, OGG), `HotReloadServer`와 소켓 제외,
  메인 루프를 `emscripten_set_main_loop`로, `--features`에 `wasm` 표시, `build-web/`에 `.js`와 `.wasm`. 헤드리스 검증은 Playwright가 정적 페이지를 열어 canvas를 골든과 대조한다.

## 작업 항목

### 마일스톤 1: 로더 계약 (R3와 함께)

- [x] `Module` 초기화 인터페이스를 정한다: canvas, 설정(환경 변수 대신), print 훅, 준비 완료 콜백, 종료 함수. R3 의 `bootInitial2D({ canvas, files, env, print, printErr })` 를 그대로 쓴다 (준비 완료는 약속이 풀리는 것, 종료는 `quit()` 뒤 "main loop stopped" 줄)
- [x] 프로젝트 파일 스테이징: 백엔드로 `scripts/`, `resources/`, `game.json`을 읽어 MEMFS에 쓴다 (`gameView/staging.ts`, 동시 8개, 진행 표시). RTP 변환물(`resources/rtp/`)과 원본 그림과 압축과 PSD 는 빼고, 32 MB 를 넘는 파일은 경고하고 뺀다
- [ ] 큰 파일은 필요할 때만 (목록을 먼저 올리고 실제 데이터는 요청 시). 알데바란 사본은 190개 6.2 MB 를 0.5 초에 올려 아직 필요 없다
- [x] 엔진 export: `initial2d_reload()`(VM 재시작), `initial2d_quit()`. 엔진 저장소 R3

### 마일스톤 2: 게임 뷰 패널

- [x] 문서 탭 "게임"(kind `game`, 하나만): canvas를 `game.json`의 창 크기로 띄운다. 탭 크기가 바뀌면 정수 배율로 맞추고, 탭이 창보다 작으면 비율을 지켜 줄인다
- [x] 실행 설정에서 모드(프로세스, 내장)를 고른다 (`settings.runMode`, 설정 대화상자의 실행 방식). 같은 F5와 Shift+F5. 브라우저 모드는 늘 내장
- [x] 포커스: 탭을 누르면 canvas가 키를 받고, 편집기로 가면 놓는다. 오디오가 멈춰 있으면 "소리 켜기" 단추 (canvas 를 눌러도 켜진다)
- [x] 콘솔 연동과 오류 링크(E1의 파서 재사용). 출력은 source `engine`

### 마일스톤 3: 핫 리로드 내장

- [x] 저장 시 바뀐 파일만 MEMFS에 다시 올리고 `initial2d_reload()` (300ms 안의 저장은 모아서 한 번)
- [x] 씬 파일과 맵 파일도 같은 경로로

### 마일스톤 4: 수명과 성능

- [x] 탭을 닫거나 정지하면 WASM 인스턴스를 버리고 메모리를 돌려준다 (WebGL 컨텍스트를 잃게 하고 AudioContext 를 닫고 canvas 를 뗀다). 다시 실행하면 새 canvas 와 새 인스턴스
- [x] 알데바란이 60fps로 돈다. 헤드리스 크로미움(WebGL 은 SwiftShader)의 게임 탭에서 타이틀과 숲 모두 60 FPS (게임 탭의 FPS 표시)
- [x] 폰트(BMFont)와 OGG가 로드된다. 타이틀의 한글이 BMFont 로 그려지고, `bless.ogg` 를 건 작은 프로젝트에서 `Audio.IsPlayingMusic()` 이 true

### 마일스톤 5: 웹 데모 (부산물)

- [x] 엔진 저장소에 정적 페이지 하나(`build-web/index.html`)가 프로젝트 파일을 fetch로 올려 알데바란을 띄운다 (R3)
- [x] Playwright가 그 페이지를 열어 정해진 프레임의 canvas를 골든과 대조한다 (R3의 회귀 테스트, `tools/web_smoke.mjs`)
- [ ] 엔진 README에 실행 링크 자리 (배포는 저자 결정)

### 마일스톤 6: mruby

- [ ] libmruby를 emcc로 빌드해 R3에 붙인다. `--features`가 `lua mruby`를 찍으면 언어 토글이 열린다

## 완료 기준

- [x] 게임 뷰에서 알데바란이 타이틀에서 숲까지 돈다 (Lua). `tests/e2e/game-view.spec.ts` 의 브리지 모드 검사가 타이틀을 확인하고 Enter 로 숲을 연다
- [x] 스크립트를 저장하면 게임 뷰가 다시 뜬다 (같은 파일의 메모리 모드 검사)
- [ ] 같은 씬을 프로세스 모드와 내장 모드로 띄운 화면이 같다 (스크린샷 비교, 허용 오차를 숫자로). 웹 데모 페이지와 네이티브의 비교는 R3 가 했다 (차이 0). 에디터의 두 모드 비교는 아직
- [x] 웹 데모 페이지가 Playwright 골든을 통과한다 (R3)
- [x] 두 저장소의 README에 사용법이 있다 (에디터 "에디터 안에서 실행", 엔진 "웹 빌드 (Emscripten)")

## 의존 관계

- 선행: E1, R3
- 후행: E6(배포에서 웹 데모를 함께 낼지)

## 위험

- **Emscripten 빌드 자체.** SDL2_mixer의 OGG, BMFont 파일 읽기, `SDL_GetPrefPath`. 대응: R3의 첫 목표를 "플래피가 뜬다"로 작게 잡는다.
- **가상 파일 시스템 동기화.** 프로젝트가 크면 스테이징이 느리다. 대응: 목록 먼저, 데이터는 요청 시.
- **브라우저 오디오 정책과 키 포커스.** 대응: 안내 문구와 포커스 규칙을 마일스톤 2에서 정한다.
- **mruby 교차 빌드.** 안드로이드에서도 아직 안 된 일이다. 대응: 마일스톤 6은 별도로 떼어 낼 수 있게 두고, 완료 기준에 넣지 않는다.

## 구현 노트: 게임 뷰 (2026-09-27)

### 어디에 무엇이

| 파일 | 하는 일 |
|---|---|
| `scripts/sync-engine-web.mjs` (`yarn sync:engine-web`) | 엔진의 `build-web/site/` 에서 `Initial2D.js`, `Initial2D.wasm`, `initial2d-loader.js` 를 `packages/app/public/engine/` 으로 복사하고 `MANIFEST.json`(엔진 커밋, 커밋 안 된 변경 여부, 파일별 sha256 과 크기, 기능)을 쓴다. 기능은 `build-web/CMakeCache.txt` 에 libmruby 가 잡혔는지로 정한다 (`--features` 로 직접 줄 수 있다). Vite 가 `public/` 을 `dist/` 로 옮겨 Cloudflare Pages 와 Tauri 번들에 실린다 |
| `gameView/engineAssets.ts` | 로더를 실행할 때 URL 로 import 한다 (`import.meta.env.BASE_URL` 기준 `engine/`). MANIFEST 를 한 번 읽어 둔다 |
| `gameView/staging.ts` | 올릴 파일 목록(`isStagePath`, `isStageDir`)과 동시 읽기(기본 8개, 진행 콜백, abort) |
| `gameView/GameSession.ts` | 실행 한 번. `RunHandle` 이라 실행기에게는 프로세스와 같다. 부팅 중의 줄을 모아 첫 구독자에게 주고, "main loop stopped" 줄로 끝을 안다 (스크립트 오류가 있었으면 종료 코드 1) |
| `gameView/GameViewStore.ts` | 게임 탭 열기, 새 canvas, 스테이징과 부팅, 정리, 핫 리로드, FPS 와 오디오 상태, 검수용 `capture()` |
| `components/documents/GameView.tsx` | 상태 띠(상태, 진행, FPS, 소리 켜기, 실행과 정지와 다시 시작)와 canvas 자리, 배율 맞춤, 실행 단축키 가로채기 |
| `runner/RunnerStore.ts` | `mode`(설정과 백엔드), `activeMode`(지금 실행의 방식), `launchProcess` 와 `launchEmbedded`, 에디터 안 리로드. 상태 바 문구에 방식이 붙는다 |
| `runner/reloadOnSave.ts` | `SaveReloader`: 300ms 안에 저장한 경로를 모아 `runner.reload(paths)` 한 번 |

### 배운 것

- **SDL 은 canvas 를 `document.querySelector("#canvas")` 로 찾는다** (Emscripten 의 `findEventTarget`, `Module.canvas` 가 아니다). 창을 만들 때와 WebGL 컨텍스트를 만들 때 둘 다다. 그래서 id 는 `canvas` 하나뿐이어야 하고, 부팅 전에 canvas 가 문서에 붙어 있어야 한다. 게임 뷰는 탭을 열고 canvas 가 붙기를 기다린 뒤(최대 5초) 부팅한다
- **도킹은 뒤에 있는 탭의 내용을 문서에서 뗀다** (dockview 의 기본 `onlyWhenVisible`). 게임 탭 뒤에 스크립트 탭이 오면 canvas 가 문서 밖에 있어도 엔진은 돌고(requestAnimationFrame 은 창 기준), 핫 리로드도 된다. 탭을 다시 앞으로 하면 같은 canvas 와 같은 컨텍스트가 붙는다. 그래서 canvas 는 React 가 아니라 스토어가 만들고 뷰는 붙이기만 한다
- **SDL 은 게임이 받는 키의 기본 동작을 막는다** (글자 입력을 끈 엔진이라 모든 키). 에디터의 전역 단축키는 `defaultPrevented` 인 키를 건너뛰므로 canvas 에 초점이 있으면 F5 와 Shift+F5 가 죽는다. 게임 뷰가 캡처 단계에서 `run.*` 커맨드의 단축키만 먼저 받아 실행하고 나머지는 게임에 넘긴다
- **탭을 앞으로 할 때의 초점**: 도킹이 내용을 다시 붙이는 것이 React 의 effect 보다 늦어서, 붙을 때까지 다음 프레임들에서 `focus()` 를 다시 시도한다
- **WebGL 캔버스 읽기**: `preserveDrawingBuffer` 가 꺼져 있어 아무 때나 `toDataURL` 하면 빈 화면이다. `capture()` 는 requestAnimationFrame 안에서(엔진의 프레임 콜백 바로 뒤, 합성 전) 2D canvas 로 복사해 통계(가장 많은 색의 비율, 색 수, 16x16 칸 밝기)를 낸다. e2e 는 칸 밝기 차이로 타이틀과 숲을 가른다 (타이틀끼리 1 아래, 숲 18 안팎)
- **CSS 크기**: SDL 은 창을 만들 때 canvas 에 CSS 크기가 있으면 그대로 두고 그리기 버퍼만 창 크기(고해상도 화면이면 곱절)로 맞춘다. 그래서 배율은 CSS 크기만 바꾸면 되고 마우스 좌표도 SDL 이 CSS 크기로 환산한다
- **FPS** 는 게임 탭이 requestAnimationFrame 을 센 값이다. 엔진 루프가 같은 박자(`emscripten_set_main_loop` 의 fps -1)로 돌아서 엔진의 프레임 수와 같다. `capture()` 를 자주 부르면 떨어진다 (e2e 의 17 FPS 는 그 때문)
- **오디오**: SDL2 포트의 AudioContext 는 `Module.SDL2.audioContext` 에 있다. F5 는 사용자 제스처라 보통 바로 `running` 이다. 멈춰 있으면 단추나 canvas 누르기가 `resume()` 한다. 정지할 때 닫는다 (실행마다 새 모듈이라 AudioContext 도 새것이다)
- **저장 시 리로드의 갈래**: 게임 탭이 돌면 늘 그쪽이다 (저장한 파일만). 아니면 전처럼 Tauri 는 프로세스가 돌 때 TCP, 브리지는 서버가 전한다(터미널에서 띄운 엔진). 웹판의 브라우저 폴더는 `hmrPush` 가 `unsupported` 라 게임 탭이 돌 때만 리로드하고, 수동 리로드는 꺼 두고 이유를 적는다 (`RunnerStore.canPush`)
- **mruby**: MANIFEST 의 기능에 `mruby` 가 없으면 `game.json` 이 mruby 인 프로젝트는 띄우지 않고 "웹 엔진은 Lua 만 돈다. game.json 의 script 를 lua 로 바꾸거나 실행 방식을 프로세스로" 를 알린다 (브라우저면 프로세스 실행은 데스크톱 앱에서라고 덧붙인다). 실행 버튼은 켜 둔다 (누르면 이유가 나온다)
- **샘플 프로젝트의 main.lua** 는 이제 엔진이 부르는 `Initialize`, `Update`, `Render`, `Destroy` 를 씬 계약 네 함수로 잇고, `draw_point` 로 64 x 48 사각형을 칠하고 `sample:frame` 을 한 번 찍는다 (게임 뷰 e2e 의 상대)

### 검수

- 단위: 스테이징 8, 게임 뷰 스토어 8 (가짜 로더: 탭과 canvas, env, 줄 모으기, 정지, 시간 제한, 스스로 끝남, abort, 실패, 리로드, 저장 셋이 리로드 한 번), 캔버스 도구 5, MANIFEST 4, 실행 방식 9, 저장 규칙과 모으기 4, 설정 2
- e2e `tests/e2e/game-view.spec.ts`: 메모리 모드 셋(F5 부터 핫 리로드와 Shift+F5 와 다시 실행과 탭 닫기까지, 맵의 여기서 실행, mruby 거부), 브리지 모드 하나(알데바란 사본, 포트 5973, 타이틀과 숲, 20 초 동안 Lua 오류 없음). 바뀐 기존 e2e: 스모크의 실행 버튼(켜짐과 새 툴팁), 실행기의 상태 바, 맵 오브젝트의 여기서 실행(켜짐)
- 눈으로: 브리지 모드 사본의 게임 탭을 `GAME_VIEW_SCREENSHOT` 으로 찍어 타이틀과 숲을 봤다

### 남은 것

- 프로세스 모드와 내장 모드의 같은 씬 화면 비교 (완료 기준 셋째)
- 큰 파일의 요청 시 읽기 (마일스톤 1)
- 게임 탭은 활성 문서 옆(같은 그룹)에 열린다. 스크립트를 고치며 게임을 보려면 탭을 옆으로 끌어 둔다. 처음부터 옆 그룹에 여는 것은 `documentDock` 의 자리 규칙을 넓혀야 한다
- 엔진 README 의 "웹 빌드" 절에 `yarn sync:engine-web`(에디터로 복사) 한 줄

## 웹판: 브라우저 폴더 백엔드

index.md 2절의 결정(웹판을 겸한다)의 파일 쪽이다. Cloudflare Pages 에 올린 같은 앱이 서버 없이 내 컴퓨터의 폴더를 읽고 쓴다.
게임은 위의 게임 뷰(WASM)가 돌리므로 이 백엔드는 파일만 맡는다.

### 작업 항목

- [x] `packages/backend-fsaccess`: `FsAccessBackend`(`kind: "browser"`, `capabilities: { run: false, pickFolder: true, watch: true }`). `BackendKind` 에 `"browser"` 를 더했다
- [x] `open(root)` 의 root 는 기억한 폴더의 키이거나 `"opfs"`, `"opfs:<하위 폴더>"`(브라우저 전용 저장소, 테스트와 연습용). 경로 규칙과 오류 코드는 브리지와 같다 (`normalizeRel`, `not_found`, `outside_root`, `not_open`, `io`, `unsupported`)
- [x] 쓰기는 `createWritable` 뒤 `close()`. 명세의 스왑 파일이라 원자적이다. 이름 바꾸기는 `move()` 가 되면 그것, 안 되면 복사 뒤 지우기 (폴더는 통째로)
- [x] 감시는 1.5초 폴링. 범위는 목록을 읽은 폴더(루트와 트리가 펼친 폴더)와 읽거나 쓴 파일. 크기와 마지막 수정 시각을 비교하고, 추적하는 폴더에 새 폴더가 생기면 그 안까지 알리고 추적한다
- [x] 내가 한 변경: 쓰는 동안 경로를 잡고(hold), 끝나면 스냅숏을 고치고(note), 바로 `self` 로 알린다. 도장을 못 읽은 쓰기는 3초 안에 내용 해시가 같으면 `self` (브리지와 같은 규칙)
- [x] `hmrPush` 와 `run` 은 `unsupported` (게임 뷰의 엔진이 저장을 받아 스스로 다시 뜬다)
- [x] 폴더 기억: IndexedDB `initial-editor` 의 `handles`(키, 핸들)와 `folders`(키, 이름, 연 시각). 같은 폴더를 다시 고르면 같은 키 (`isSameEntry`), 최대 10개
- [x] 권한: `queryPermission` 뒤 `requestPermission`. 묻는 것은 클릭 안에서만 되므로 시작 화면의 "다시 열기"가 먼저 묻고 연다
- [x] 앱: `chooseMode` 에 `browser`. 로컬이 아닌 호스트는 `showDirectoryPicker` 가 있으면 브라우저 폴더, 없으면 메모리와 안내. `?backend=browser` 는 강제, `?backend=opfs` 는 OPFS 를 바로 연다
- [x] 시작 화면: 폴더 열기, 최근 폴더와 다시 열기, 샘플로 해 보기(메모리 샘플로 바꾼다). 파일 > 최근 프로젝트도 브라우저 폴더 모드에서는 기억한 폴더의 이름이다
- [x] 검수: 적합성 한 벌 14건을 루트 둘(기억한 폴더, OPFS 하위 폴더)에 (가짜 File System Access API `test/fakeFs.ts`, 가짜 자체의 명세 검사 7건), 폴링 단위 12건, 백엔드 단위 15건, e2e `tests/e2e/web-folder.spec.ts` 4건

### 메모

- **시크릿 컨텍스트에서 IndexedDB 의 폴더 핸들을 꺼내면 탭이 죽는다.** Playwright 의 기본 컨텍스트(시크릿 창과 같은 off-the-record 프로필)에서 크로미움 153 과 크롬 모두 재현했다. 넣는 것은 되고 꺼내는 순간 렌더러가 닫힌다. 일반 프로필(`launchPersistentContext`)에서는 된다. 그래서 목록은 이름만 담은 `folders` 에서 읽고, 핸들은 다시 열 때만 꺼내며, 꺼내는 동안 localStorage 에 표시(`initial-editor.folders.restoring`)를 남긴다. 다음에 페이지가 떴을 때 표시가 남아 있으면 꺼내다 죽은 것이므로 그 창에서는 다시 열기를 끄고 안내한다 (12시간 뒤 풀린다). 진짜 시크릿 창에서 같은지는 저자 확인이 필요하다
- 핸들은 경로와 같다. 지우고 같은 이름으로 다시 만들면 옛 핸들이 새 항목을 가리킨다 (가짜도 그렇게 만들었다)
- `ProjectInfo.root` 는 폴더 이름이다 (브라우저는 절대 경로를 주지 않는다). 다시 열 때 쓰는 키는 `backend.openedRoot`
- 설정의 `recentProjects`(브리지와 같은 localStorage)에 키가 남지 않게 `browserFolders.ts` 가 `projectOpened` 에서 지운다. `Editor.openProject` 가 브라우저 폴더 모드에서 `addRecentProject` 를 건너뛰면 이 우회는 없앨 수 있다
- 진짜 폴더 열기 대화상자는 자동화할 수 없다. e2e 는 OPFS 를 폴더 대신 쓰고, 기억한 폴더는 IndexedDB 에 OPFS 하위 폴더 핸들을 심어 흉내 낸다. 실제 로컬 폴더를 고르는 흐름은 저자 확인
- 수동 확인: 빌드한 `dist` 를 정적 서버로 로컬이 아닌 이름(`initial-editor.test`, 크로미움의 `--host-resolver-rules` 와 `--unsafely-treat-insecure-origin-as-secure` 로 보안 컨텍스트)에서 열면 브라우저 폴더 모드로 시작하고 폴더 열기 버튼이 보인다. 보안 컨텍스트가 아니면 폴더 열기가 없어 메모리 모드와 안내가 뜬다
