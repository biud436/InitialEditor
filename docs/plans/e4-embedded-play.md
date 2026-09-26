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
| 언어 | Lua와 mruby | Lua와 mruby. mruby 는 libmruby 를 emcc 로 교차 빌드해 넣은 웹 빌드에서 (`MANIFEST.json` 의 기능에 `mruby`) |

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
- [x] 포커스: 탭을 누르면(이미 활성이어도) canvas가 키를 받고, 편집기로 가면 놓는다. 오디오가 멈춰 있으면 "소리 켜기" 단추 (canvas 를 눌러도 켜진다)
- [x] 게임 탭은 처음에 문서 영역 오른쪽의 새 그룹에 연다 (`documentDock` 의 옆 문서 자리 규칙). 사용자가 옮기면 그 자리를 기억한다
- [x] 실행 단축키(F5, Shift+F5, Ctrl+F5, 리로드)는 스크립트 편집기와 입력 칸 안에서도 통하고, F5 는 커맨드에 묶여 있으면 늘 기본 동작(새로 고침)을 막는다. 브라우저 모드는 저장하지 않은 문서가 있으면 떠나기 전에 묻는다
- [x] 콘솔 연동과 오류 링크(E1의 파서 재사용). 출력은 source `engine`

### 마일스톤 3: 핫 리로드 내장

- [x] 저장 시 바뀐 파일만 MEMFS에 다시 올리고 `initial2d_reload()` (300ms 안의 저장은 모아서 한 번)
- [x] 씬 파일과 맵 파일도 같은 경로로

### 마일스톤 4: 수명과 성능

- [x] 탭을 닫거나 정지하면 WASM 인스턴스를 버리고 메모리를 돌려준다 (WebGL 컨텍스트를 잃게 하고 AudioContext 를 닫고 canvas 를 뗀다). 다시 실행하면 새 canvas 와 새 인스턴스
- [x] 엔진이 죽는 것을 안다: 로더의 `onExit`, 루프가 멈춘 줄, 실행 중 window 까지 올라온 엔진의 오류와 처리되지 않은 거부, reload 가 던짐. 예외는 세션을 종료 코드 1 로 끝내고 읽는 글(`errorText`)을 콘솔과 상태 띠에 남긴다. reload 가 false(스크립트 오류)면 게임은 계속 돈다. 죽은 엔진의 정지는 기다리지 않는다
- [x] 알데바란이 60fps로 돈다. 헤드리스 크로미움(WebGL 은 SwiftShader)의 게임 탭에서 타이틀과 숲 모두 60 FPS (게임 탭의 FPS 표시)
- [x] 폰트(BMFont)와 OGG가 로드된다. 타이틀의 한글이 BMFont 로 그려지고, `bless.ogg` 를 건 작은 프로젝트에서 `Audio.IsPlayingMusic()` 이 true

### 마일스톤 5: 웹 데모 (부산물)

- [x] 엔진 저장소에 정적 페이지 하나(`build-web/index.html`)가 프로젝트 파일을 fetch로 올려 알데바란을 띄운다 (R3)
- [x] Playwright가 그 페이지를 열어 정해진 프레임의 canvas를 골든과 대조한다 (R3의 회귀 테스트, `tools/web_smoke.mjs`)
- [ ] 엔진 README에 실행 링크 자리 (배포는 저자 결정)

### 마일스톤 6: mruby

- [x] libmruby를 emcc로 빌드해 R3에 붙인다 (엔진 R3 9절, mruby 4.0.0, `-fwasm-exceptions`). 웹 빌드의 기능이 `lua mruby wasm` 이면 `game.json` 이 mruby 인 게임도 게임 탭에서 돈다. 언어 토글(도구 막대)은 늘 열려 있고, mruby 없는 웹 빌드는 실행할 때 이유를 알린다. `yarn sync:engine-web` 은 wasm 에 libmruby 가 링크되었는지(mruby 코어의 `MRUBY_COPYRIGHT` 문자열)로 기능을 적는다. e2e: 메모리 샘플의 Ruby 판이 Lua 판과 같은 사각형을 그리고, 브리지 모드의 알데바란 Ruby 판이 타이틀에서 숲까지 돈다. 거부는 MANIFEST 를 가로챈 가짜(e2e)와 단위 테스트로 본다

## 완료 기준

- [x] 게임 뷰에서 알데바란이 타이틀에서 숲까지 돈다 (Lua). `tests/e2e/game-view.spec.ts` 의 브리지 모드 검사가 타이틀을 확인하고 Enter 로 숲을 연다
- [x] 스크립트를 저장하면 게임 뷰가 다시 뜬다 (같은 파일의 메모리 모드 검사)
- [x] 같은 씬을 프로세스 모드와 내장 모드로 띄운 화면이 같다 (스크린샷 비교, 허용 오차를 숫자로). 엔진의 인수 씬(알데바란 타이틀)을 같은 파일로 네이티브 엔진(헤드리스)과 게임 탭에서 돌려 20 프레임째를 엔진 골든 검사와 같은 규칙(채널 차이 24 초과면 다른 픽셀, 2% 까지)으로 견준다. 잰 값은 다른 픽셀 0% 나 1.44% (메뉴 커서 칸뿐, 나머지 화면은 채널 차이 3 이하). 아래 "같은 화면 대조" 절과 `tests/e2e/game-view.spec.ts`
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
| `scripts/sync-engine-web.mjs` (`yarn sync:engine-web`) | 엔진의 `build-web/site/` 에서 `Initial2D.js`, `Initial2D.wasm`, `initial2d-loader.js` 를 `packages/app/public/engine/` 으로 복사하고 `MANIFEST.json`(엔진 커밋, 커밋 안 된 변경 여부, 파일별 sha256 과 크기, 기능)을 쓴다. 기능은 wasm 에 libmruby 가 링크되었는지(mruby 코어의 `MRUBY_COPYRIGHT` 문자열 "mruby - Copyright")로 정한다 (`--features` 로 직접 줄 수 있다). Vite 가 `public/` 을 `dist/` 로 옮겨 Cloudflare Pages 와 Tauri 번들에 실린다 |
| `gameView/engineAssets.ts` | 로더를 실행할 때 URL 로 import 한다 (`import.meta.env.BASE_URL` 기준 `engine/`). MANIFEST 를 한 번 읽어 둔다 |
| `gameView/staging.ts` | 올릴 파일 목록(`isStagePath`, `isStageDir`)과 동시 읽기(기본 8개, 진행 콜백, abort) |
| `gameView/GameSession.ts` | 실행 한 번. `RunHandle` 이라 실행기에게는 프로세스와 같다. 부팅 중의 줄을 모아 첫 구독자에게 주고, 로더의 `onExit(code)` 나 "main loop stopped" 줄로 끝을 안다 (onExit 가 없으면 스크립트 오류 줄이 있었을 때 종료 코드 1). `crash(e)` 는 "fatal:" 줄을 찍고 종료 코드 1 로 끝낸다 |
| `gameView/GameViewStore.ts` | 게임 탭 열기, 새 canvas, 스테이징과 부팅, 정리, 핫 리로드(결과에 스크립트 오류 여부), 실행 중 window 의 엔진 오류 듣기, FPS 와 오디오 상태, canvas 초점, 검수용 `capture()` |
| `gameView/errorText.ts` | 던져진 것을 읽는 글로 (`errorText`: 로더의 errorText, Emscripten 의 getExceptionMessage, 값만 보고 순서. undefined 나 빈 글을 돌려주지 않는다). `isEngineError` 는 window 의 오류가 엔진에서 왔는지 (wasm 예외와 트랩, 엔진 파일 이름이나 스택) |
| `documentDock.ts` | `documentPlacement`: 보통 문서는 문서 그룹, 옆 문서(`SIDE_KINDS`, 게임 탭)는 기억한 자리나 문서 그룹 오른쪽. 배치가 바뀔 때마다 옆 문서의 자리(같은 그룹의 다른 탭, 혼자면 문서 그룹에서 본 방향)를 기억한다 |
| `shortcuts.ts` | 입력 칸 안에서도 `run.*` 와 F5 계열이 통한다. 비활성인 F5 커맨드의 키도 기본 동작을 막는다. `installUnloadGuard`(브라우저 모드의 떠나기 전 확인) |
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
- **FPS** 는 로더에 `frames()` 가 있으면 엔진이 돈 프레임 수의 1초 차이다. 없으면(옛 빌드) 게임 탭이 requestAnimationFrame 을 센 값인데, 이것은 엔진이 죽어도 60 이라 새 로더 계약에 `frames()` 를 넣었다. `capture()` 를 자주 부르면 떨어진다 (e2e 의 17 FPS 는 그 때문)
- **엔진이 죽는 모양**: 옛 빌드에서는 Lua 오류가 C++ 예외(`WebAssembly.Exception`)로 프레임 콜백 밖까지 나와 window 의 오류가 되고 루프는 다시 걸리지 않는다. 이 값에는 `message` 가 없어서 `(e as Error).message` 는 "undefined" 였다. 그래서 오류 글은 모두 `errorText` 를 거치고, 실행 중에는 window 의 `error` 와 `unhandledrejection` 을 들어 엔진에서 온 것(wasm 예외와 트랩, 엔진 파일 이름이나 스택)이면 세션을 끝낸다. 오류가 이벤트 처리기에서 났으면 루프가 아직 돌 수 있어서 끝낼 때 한 번 `quit()` 한다
- **죽은 엔진의 정지**: 루프가 멈췄거나 예외로 끝난 세션은 quit 을 기다리지 않는다. `frames()` 가 있으면 quit 뒤 200 ms 동안 프레임이 늘지 않을 때도 죽은 루프로 보고 바로 정리한다 (살아 있는 루프는 다음 프레임에 멈춘다)
- **capture()**: 게임이 스스로 끝나면 SDL 이 창을 닫아 canvas 크기가 0 이 되고 `drawImage` 가 InvalidStateError 를 던진다. 그 프레임에 게임이 끝났거나 크기가 0 이면 null 을, 그 밖의 실패는 "게임 화면을 읽지 못했다: ..." 를 던진다
- **단축키와 초점**: 스크립트 편집기(Monaco)의 입력은 textarea 라 전역 단축키가 입력 칸 규칙으로 걸러 F5 가 브라우저 새로 고침으로 갔다. `run.*` 와 F5 계열을 통과시키고, 비활성이어도 F5 에 커맨드가 묶여 있으면 기본 동작을 막는다. dockview 는 누른 탭 요소에 초점을 두므로(tabIndex 0) 이미 활성인 게임 탭을 누르면 canvas 가 키를 잃었다. 게임 탭의 클릭이 canvas 에 초점을 돌려준다
- **게임 탭의 자리**: dockview 의 배치 변경 이벤트(`onDidLayoutChange`)는 마이크로태스크로 온다. 탭의 닫기 단추로 닫으면 패널이 먼저 사라지므로 자리는 그 전의 배치 변경에서 기억해 둔 것을 쓴다. 혼자 있는 그룹의 방향은 두 그룹 사각형의 가운데를 비교해 정한다 (jsdom 처럼 크기가 없으면 기억하지 않고 오른쪽)
- **오디오**: SDL2 포트의 AudioContext 는 `Module.SDL2.audioContext` 에 있다. F5 는 사용자 제스처라 보통 바로 `running` 이다. 멈춰 있으면 단추나 canvas 누르기가 `resume()` 한다. 정지할 때 닫는다 (실행마다 새 모듈이라 AudioContext 도 새것이다)
- **저장 시 리로드의 갈래**: 게임 탭이 돌면 늘 그쪽이다 (저장한 파일만). 아니면 전처럼 Tauri 는 프로세스가 돌 때 TCP, 브리지는 서버가 전한다(터미널에서 띄운 엔진). 웹판의 브라우저 폴더는 `hmrPush` 가 `unsupported` 라 게임 탭이 돌 때만 리로드하고, 수동 리로드는 꺼 두고 이유를 적는다 (`RunnerStore.canPush`)
- **mruby**: 웹 빌드에 mruby 가 들었으면(MANIFEST 의 기능) Ruby 게임도 같은 길로 돈다 (언어는 `INITIAL2D_SCRIPT`). 기능에 `mruby` 가 없으면 `game.json` 이 mruby 인 프로젝트는 띄우지 않고 "이 웹 엔진 빌드에는 mruby 가 없다. game.json 의 script 를 lua 로 바꾸거나, mruby 를 넣은 웹 빌드를 yarn sync:engine-web 으로 가져오거나, 실행 방식을 프로세스로" 를 알린다 (브라우저면 프로세스 실행은 데스크톱 앱에서라고 덧붙인다). 실행 버튼은 켜 둔다 (누르면 이유가 나온다). 옛 CMake 캐시 검사(`MRUBY_LIBRARY`)는 R3 의 mruby 분기가 경로를 직접 보므로 캐시에 남지 않아 쓸 수 없었다
- **네이티브와 같은 오류**: 새 로더에서 Lua 와 Ruby 오류는 JS 예외가 아니라 네이티브와 같은 줄이 printErr 로 온다. 시작 때와 Update, Render 의 오류는 루프가 내려가고 `onExit(1)`, 게임 뷰는 종료 코드 1 로 끝낸다 (네이티브 프로세스가 종료 코드 1 로 끝나는 것과 같다, 실행기는 "엔진 종료 코드 1" 과 토스트). reload 의 스크립트 오류는 false 이고 스크립트만 멈춘다 (화면은 지워지고 게임 탭은 산다). 고친 파일로 reload 하면 true 이고 다시 그린다. 네이티브 핫 리로드도 엔진 커밋 083ddf8 부터 같다
- **로더의 errorText**: C++ 태그가 아닌 `WebAssembly.Exception` 은 로더가 `String(e)` 인 "[object WebAssembly.Exception]" 을 돌려준다. 게임 뷰의 `errorText` 는 이런 값의 기본 문자열을 읽는 글로 치지 않고 다음 길("C++ 예외 (WebAssembly.Exception, 메시지를 읽을 수 없다)")로 간다
- **샘플 프로젝트의 main.lua** 는 이제 엔진이 부르는 `Initialize`, `Update`, `Render`, `Destroy` 를 씬 계약 네 함수로 잇고, `draw_point` 로 64 x 48 사각형을 칠하고 `sample:frame` 을 한 번 찍는다 (게임 뷰 e2e 의 상대)

### 검수

- 단위: 스테이징 8, 게임 뷰 스토어 19 (가짜 로더, 옛 계약과 새 계약: 탭과 canvas, env, 줄 모으기, 정지, 시간 제한, 스스로 끝남, abort, 실패, 리로드, 저장 셋이 리로드 한 번, 부팅의 wasm 예외, 부팅 중 window 에 온 예외, reload 의 false 와 던짐, window 의 엔진 오류와 거부, onExit 의 코드, 프레임이 멈춘 엔진의 정지, frames() 의 FPS, capture 의 null 과 오류, canvas 초점), 오류 글 7 (로더가 돌려준 "[object ...]" 를 거르는 것 포함), 문서 탭 자리 8 (규칙, 그리고 jsdom 의 진짜 dockview 에서 옆 그룹과 옮긴 자리 기억), 단축키 9 (편집기 안의 실행 키, 비활성 F5 막기, 떠나기 전 확인), 캔버스 도구 5, MANIFEST 5 (기능의 mruby 와 wasm 대조 포함), 실행 방식 12, 저장 규칙과 모으기 4, 설정 2
- e2e `tests/e2e/game-view.spec.ts` 열셋: 메모리 모드 열(F5 부터 핫 리로드와 Shift+F5 와 다시 실행과 탭 닫기까지, 스크립트 편집기 안의 F5 와 스크립트 옆 그룹의 게임 탭, 편집기 안의 Shift+F5, 이미 활성인 게임 탭 누르기, 엔진 밖으로 나온 예외, 실행 중 저장한 Lua 문법 오류(오류 줄과 링크, 스크립트만 멈춤, 고쳐 저장하면 다시 그림), Update 의 Lua 실행 오류(오류 줄과 링크, 종료 코드 1, 고쳐서 다시 실행), 맵의 여기서 실행, Ruby 판 샘플, mruby 없는 빌드의 거부(가짜 MANIFEST)), 브리지 모드 둘(알데바란 사본, 포트 6073, 타이틀과 숲, Lua 판은 20 초 동안 Lua 오류 없음, Ruby 판은 15 초 동안 Ruby 예외 없음), 네이티브 대조 하나(아래 절). 새 편집기 검사 셋은 고치기 전 빌드에서 실패하는 것을 확인했다. 바뀐 기존 e2e: 스모크의 실행 버튼(켜짐과 새 툴팁), 실행기의 상태 바, 맵 오브젝트의 여기서 실행(켜짐), 편집기 안의 Shift+F5 는 보이는 줄 대신 모델의 글이 그대로인지 본다 (게임 탭이 열리며 편집기가 스크롤되면 보이는 줄이 바뀐다)
- 눈으로: 브리지 모드 사본의 게임 탭을 `GAME_VIEW_SCREENSHOT` 으로 찍어 타이틀과 숲을 봤다

### 같은 화면 대조 (완료 기준 셋째)

R3 가 웹 데모를 네이티브와 견준 방법을 그대로 쓴다: 엔진이 `INITIAL2D_SCREENSHOT` 과 `INITIAL2D_SCREENSHOT_FRAME=20` 으로
20 프레임째를 BMP 로 쓰고(웹에서는 MEMFS 에, `module.FS.readFile` 로 꺼낸다), 엔진 골든 검사(`tests/run_engine_tests.py` 의
`check_golden`)와 같은 규칙으로 견준다.

- **씬**: 엔진의 인수 씬 `tests/engine/scenes/aldebaran_scene.lua` 를 `scripts/lua/main.lua` 로, 입력 재생기를 `scripts/lua/luatests/` 에 둔
  알데바란 사본(엔진 테스트 러너의 `make_workdir` 와 같은 배치). `INITIAL2D_ALDEBARAN_STOP=title`, `INITIAL2D_NO_RTP=1` 이면 시작 때
  `update(16)` 서른 번으로 메뉴 창을 다 연 뒤 `update(0)` 만 해서 화면이 선다. 엔진의 타이틀 골든(`aldebaran_title.png`)과 같은 씬, 같은 프레임이다
- **네이티브**: 프로세스 실행과 같은 실행 파일(`INITIAL2D_NATIVE`, 기본 `<엔진>/build/Initial2D`)을 같은 폴더에서 `SDL_VIDEODRIVER=dummy`,
  `INITIAL2D_EXIT_AFTER=30` 으로 돌린다. 없으면(CI) 엔진 저장소의 골든과 견준다 (골든은 같은 씬과 프레임의 네이티브 캡처다)
- **게임 탭**: 같은 사본을 브리지 모드로 열고 같은 설정으로 실행(`runner.start({ env })`)한 뒤 엔진이 MEMFS 에 쓴 20 프레임째와,
  게임 탭 canvas 의 다음 프레임(엔진의 프레임 콜백 바로 뒤에 읽은 그리기 버퍼)을 둘 다 견준다
- **규칙**: 768 x 896 에서 채널 차이가 24 를 넘는 픽셀이 다른 픽셀이고, 다른 픽셀이 2% 까지면 같은 화면이다 (엔진의 `GOLDEN_PIXEL_TOL`, `GOLDEN_DIFF_RATIO`)
- **잰 값 (2026-09-27, 엔진 07ebd60, 헤드리스 크로미움 1243)**: 여섯 번 돌려 게임 탭 엔진의 20 프레임과 네이티브 20 프레임의 다른 픽셀이
  다섯 번은 9878 이나 9882 / 688128 (1.44%, 채널 차이 평균 0.52 ~ 0.54, 최대 43 ~ 46), 한 번은 0 이었다. 다른 곳은 늘 메뉴 커서 칸
  (108,627) ~ (392,668) 하나이고 그 밖은 채널 차이 3 이하다. 게임 탭 canvas 도 읽는 때에 따라 0% 나 같은 1.44% 다. 골든과도 0% 나 1.44% 다
- **1.44% 의 까닭**: 커서의 깜빡임(`rpg/choice.lua`, update 20 번마다 커서 그림 두 장을 바꾼다)은 엔진의 고정 스텝 update(실시간 60 Hz,
  `StepFrame` 의 lag) 수로 세고, 스크린샷의 프레임 번호는 그리기 수로 센다. 헤드리스 네이티브는 한 프레임이 약 5 ms 라 세 프레임에 update
  한 번꼴이고 브라우저는 60 fps 라 프레임마다 한 번이다. 그래서 같은 프레임 번호에서 깜빡임의 위상이 다를 수 있고, 한 프레임의 길이가
  돌 때마다 조금씩 달라서 위상도 돌 때마다 바뀐다 (잰 값의 0% 한 번). 15 ~ 45 프레임을 양쪽에서 찍어 보니 네이티브는 29 프레임에,
  웹은 27, 45 프레임에 커서가 바뀌었고, 차이는 늘 이 칸뿐이었다. 차이는 커서 그림 두 장의 차이(1.44%)를 넘지 않는다. R3 의 Ruby 인수 씬
  대조(12b)도 같은 칸의 1.44% 였다
- 이 대조는 e2e 로 돈다 (`tests/e2e/game-view.spec.ts` 의 "게임 뷰와 네이티브 엔진"). CI 는 엔진 저장소를 받지만 네이티브를 빌드하지 않아
  골든과 견준다

### 남은 것

- 큰 파일의 요청 시 읽기 (마일스톤 1). 알데바란 사본은 아직 통째로 올려도 0.5 초라 급하지 않다
- 엔진 README 의 실행 링크 자리 (마일스톤 5, 배포는 저자 결정)
- 게임 탭 자리의 기억은 에디터를 새로 고치면 사라진다 (게임 탭은 레이아웃을 되살릴 때 다시 열지 않는다)
- 웹 엔진에서 Lua 의 `os.exit` 와 Ruby 의 `Kernel#exit!` 는 루프를 끝내지 않는다 (엔진 R3 9.5, `EXIT_RUNTIME=0`). 게임 뷰는 끝난 줄 모른다. `System.exit` 와 Ruby 의 `exit` 는 된다
- 웹 엔진 빌드는 엔진 저장소의 `fix/wasm-lua-errors` 브랜치(07ebd60, 아직 push 하지 않았다)에서 왔다. 엔진이 master 에 합친 뒤 다시 `yarn sync:engine-web` 하면 MANIFEST 의 커밋이 master 를 가리킨다

## 웹판: 브라우저 폴더 백엔드

index.md 2절의 결정(웹판을 겸한다)의 파일 쪽이다. Cloudflare Pages 에 올린 같은 앱이 서버 없이 내 컴퓨터의 폴더를 읽고 쓴다.
게임은 위의 게임 뷰(WASM)가 돌리므로 이 백엔드는 파일만 맡는다.

### 작업 항목

- [x] `packages/backend-fsaccess`: `FsAccessBackend`(`kind: "browser"`, `capabilities: { run: false, pickFolder: true, watch: true }`). `BackendKind` 에 `"browser"` 를 더했다
- [x] `open(root)` 의 root 는 기억한 폴더의 키이거나 `"opfs"`, `"opfs:<하위 폴더>"`(브라우저 전용 저장소, 테스트와 연습용). 경로 규칙과 오류 코드는 브리지와 같다 (`normalizeRel`, `not_found`, `outside_root`, `not_open`, `io`, `unsupported`)
- [x] 쓰기는 `createWritable` 뒤 `close()`. 명세의 스왑 파일이라 원자적이다. 이름 바꾸기는 `move()` 가 되면 그것, 안 되면 복사 뒤 지우기 (폴더는 통째로). 크롬 153 은 파일 핸들에만 `move()` 가 있어 폴더는 늘 복사다. `move()` 경로의 단위 검사는 가짜(`test/fakeFs.ts`)뿐이고 실제 디스크 폴더에서는 자동 검사가 없어서, 복사 뒤 지우기를 남겨 둔다
- [x] 감시는 1.5초 폴링. 범위는 목록을 읽은 폴더(루트와 트리가 펼친 폴더)와 읽거나 쓴 파일. 크기와 마지막 수정 시각을 비교하고, 추적하는 폴더에 새 폴더가 생기면 그 안까지 알리고 추적한다. 내용은 읽지 않으므로 크기와 수정 시각이 둘 다 그대로인 밖의 변경(수정 시각을 보존하는 복사 등)은 놓친다 (폴링의 한계)
- [x] 내가 한 변경: 쓰는 동안 경로를 잡고(hold), 끝나면 스냅숏을 고치고(note), 바로 `self` 로 알린다. 도장을 못 읽은 쓰기는 3초 안에 내용 해시가 같으면 `self` (브리지와 같은 규칙)
- [x] `hmrPush` 와 `run` 은 `unsupported` (게임 뷰의 엔진이 저장을 받아 스스로 다시 뜬다)
- [x] 폴더 기억: IndexedDB `initial-editor` 의 `handles`(키, 핸들)와 `folders`(키, 이름, 연 시각). 기억의 기준은 폴더 이름이다: 같은 이름을 고르면 그 기록의 핸들과 시각을 바꾼다 (새것이 이긴다, 기록이 늘지 않는다). 고를 때 기억한 핸들을 꺼내 비교하지 않는다. 최대 10개
- [x] 핸들을 꺼내는 곳은 다시 열기(`HandleStore.restore`) 하나이고, 일반 프로필로 보일 때만 꺼낸다. 시크릿 짐작(`src/profile.ts`): `navigator.storage.estimate()` 의 할당량이 `performance.memory.jsHeapSizeLimit`(없으면 1 GiB)의 두 배보다 작으면 시크릿일 수 있다고 본다 (흔한 시크릿 판별과 같은 기준, 모르면 시크릿 쪽). 그때 다시 열기는 이유를 한 줄 알리고 폴더 고르기(`id: "initial-editor"`, 크롬은 지난번 폴더에서 연다)로 연다. `open()` 은 이 페이지에서 고르거나 꺼낸 핸들만 쓴다
- [x] 권한: `queryPermission` 뒤 `requestPermission`. 묻는 것은 클릭 안에서만 되므로 시작 화면의 "다시 열기"가 먼저 묻고 연다
- [x] 앱: `chooseMode` 에 `browser`. 로컬이 아닌 호스트는 `showDirectoryPicker` 가 있으면 브라우저 폴더, 없으면 메모리와 안내. `?backend=browser` 는 강제, `?backend=opfs` 는 OPFS 를 바로 연다
- [x] 시작 화면: 폴더 열기, 최근 폴더와 다시 열기, 샘플로 해 보기(메모리 샘플로 바꾼다). 파일 > 최근 프로젝트도 브라우저 폴더 모드에서는 기억한 폴더의 이름이다
- [x] 검수: 적합성 한 벌 14건을 루트 둘(기억한 폴더, OPFS 하위 폴더)에 (가짜 File System Access API `test/fakeFs.ts`, 가짜 자체의 명세 검사 7건), 폴링 단위 12건, 백엔드 단위 19건, 시크릿 짐작 단위 6건(`test/profile.test.ts`, 두 갈래와 값이 없을 때), 앱의 짐작 연결 1건(`backends.test.ts`), e2e `tests/e2e/web-folder.spec.ts` 4건 (기본 컨텍스트에서 다시 열기와 이미 기억한 이름의 폴더 열기와 프로젝트 열기 커맨드가 폴더 고르기로 돌고 브라우저가 살아 있는지, `launchPersistentContext` 에서 바로 다시 열기와 흔적이 있을 때 폴더 고르기)

### 메모

- **시크릿 프로필에서 IndexedDB 의 폴더 핸들을 꺼내면 브라우저 프로세스가 통째로 죽는다 (탭만이 아니다).** 크롬 153 의 진짜 `--incognito` 창(프로세스가 SIGTRAP 으로 끝난다)과 Playwright 의 기본 컨텍스트(크로미움과 크롬, `browser.isConnected()` 가 false 가 된다)에서 재현했다. 넣는 것은 되고 꺼내는 순간 죽는다. 일반 프로필(`launchPersistentContext`, 일반 크롬)에서는 된다. 시크릿 창의 저장소(localStorage 의 표시 포함)도 함께 사라지므로 아래 표시는 시크릿 창에서는 효과가 없다. 그래서 핸들은 일반 프로필로 보일 때 다시 열기에서만 꺼내고, 시크릿일 수 있으면 폴더 고르기로 돈다 (위 작업 항목)
- 잰 값: 할당량은 시크릿 창과 Playwright 기본 컨텍스트가 2048 MiB, 일반 크롬과 `launchPersistentContext` 가 10240 MiB. 힙 한도는 크롬 4192 MiB, 크로미움 3586 MiB. 일반 프로필이라도 할당량이 기준보다 작게 나오는 기기에서는 다시 열기가 폴더 고르기로 돌 뿐 죽지는 않는다
- 두 번째 방어(일반 프로필): 꺼내는 동안 localStorage 에 표시(`initial-editor.folders.restoring`)를 남긴다. 다음에 페이지가 떴을 때 5분 안의 표시가 남아 있으면 꺼내다 죽은 것이므로 그 페이지에서는 꺼내지 않고 이유를 알린 뒤 폴더 고르기로 연다. 폴더를 하나라도 열면(`open()` 성공) 표시를 지운다. 같은 이름은 한 기록이라 다시 골라도 쌓이지 않는다
- 사람이 볼 것: 진짜 로컬 폴더를 시크릿 창에서 고른 뒤 다시 열기가 폴더 고르기로 돌 때 크롬이 지난번 폴더에서 대화상자를 여는지 (자동 검사는 OPFS 하위 폴더와 가짜 대화상자로 한다)
- 핸들은 경로와 같다. 지우고 같은 이름으로 다시 만들면 옛 핸들이 새 항목을 가리킨다 (가짜도 그렇게 만들었다)
- `ProjectInfo.root` 는 폴더 이름이다 (브라우저는 절대 경로를 주지 않는다). 다시 열 때 쓰는 키는 `backend.openedRoot`
- 설정의 `recentProjects`(브리지와 같은 localStorage)에 키가 남지 않게 `browserFolders.ts` 가 `projectOpened` 에서 지운다. `Editor.openProject` 가 브라우저 폴더 모드에서 `addRecentProject` 를 건너뛰면 이 우회는 없앨 수 있다
- 진짜 폴더 열기 대화상자는 자동화할 수 없다. e2e 는 OPFS 를 폴더 대신 쓰고, 기억한 폴더는 IndexedDB 에 OPFS 하위 폴더 핸들을 심어 흉내 낸다. 실제 로컬 폴더를 고르는 흐름은 저자 확인
- 수동 확인: 빌드한 `dist` 를 정적 서버로 로컬이 아닌 이름(`initial-editor.test`, 크로미움의 `--host-resolver-rules` 와 `--unsafely-treat-insecure-origin-as-secure` 로 보안 컨텍스트)에서 열면 브라우저 폴더 모드로 시작하고 폴더 열기 버튼이 보인다. 보안 컨텍스트가 아니면 폴더 열기가 없어 메모리 모드와 안내가 뜬다
