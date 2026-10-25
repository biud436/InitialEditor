# 튜토리얼 영상 (scripts/video/)

> 사용법 요약은 README의 "튜토리얼 영상" 절에 있습니다.

튜토리얼 영상은 사용자 가이드의 따라 하기 한 편을 에디터에서 실제로 한 화면과 엔진이 실제로 그린 게임 화면으로 보여 주는 모션 그래픽 영상입니다. 지금 있는 영상은 [RPG Maker 2000 맵 따라 만들기](guide/rm2k-tutorial.md) 한 편입니다.

## 1. 산출물

| 파일 | 내용 |
|---|---|
| `build/video/rm2k-tutorial.mp4` | 1920x1080, 30fps, H.264. 소리는 무음 트랙입니다 (이 게임에는 효과음이 없습니다) |
| `build/video/rm2k-tutorial/chipset.png` | 영상에 쓰는 ChipSet. EasyRPG RTP의 `Exterior.png`(JasonPerry, CC0)를 고정한 커밋에서 받습니다 |
| `build/video/rm2k-tutorial/editor/` | 에디터 화면 (`ui/*.png`, `timeline.json`)과 F5를 누른 순간의 프로젝트 (`runs/`) |
| `build/video/rm2k-tutorial/game/` | 엔진이 그린 게임 프레임 (`<실행 이름>/*.png`, `frames.json`) |

`build/video/`는 git에 넣지 않습니다.

## 2. 만드는 법

준비물은 Playwright의 Chromium(`yarn playwright install chromium`), ffmpeg, 엔진 저장소의 빌드(`../Initial2D/build/Initial2D`)입니다. 엔진은 타일 애니메이션(`Tilemap.Update`)이 있는 판이어야 게임 장면의 물이 움직입니다.

```sh
yarn build                                          # 에디터 빌드 (촬영은 dist/ 를 미리보기 서버로 띄워 찍는다)
node scripts/video/rm2k-tutorial/build.mjs          # 처음부터 끝까지 (20분쯤)
node scripts/video/rm2k-tutorial/build.mjs --skip-editor --skip-game --times 3,40,120   # 합성만 몇 장 PNG 로
```

| 선택 | 뜻 |
|---|---|
| `--engine <폴더>` | 엔진 저장소 (기본 `../Initial2D`, 환경 변수 `INITIAL2D_DIR`). 실행 파일은 `<폴더>/build/Initial2D`, 바꾸려면 `INITIAL2D_EXE` |
| `--skip-editor` | 에디터 촬영을 건너뛰고 있던 `editor/`를 씁니다 |
| `--skip-game` | 게임 촬영을 건너뛰고 있던 `game/`을 씁니다 |
| `--times 1,30,90` | 영상 대신 그 시각(초)의 정지 화면을 `build/video/rm2k-tutorial/stills/`에 씁니다 |
| `--stop-after <장>` | 에디터 촬영을 그 장(0은 준비, 1에서 7은 가이드의 절)까지만 하고 끝냅니다 |

## 3. 단계

### 3.1 에디터 촬영 (`capture-editor.mjs`, `lib/recorder.mjs`)

빌드한 에디터를 미리보기 서버로 띄우고, 헤드리스 Chromium에서 브라우저 폴더 모드(`?backend=browser`, 브라우저 전용 저장소)로 연 뒤 가이드의 순서대로 조작합니다. 화면은 1600x900, 배율 2(그림은 3200x1800), 어두운 테마, 단축키 표기는 Ctrl입니다.

- 페이지의 시계(`Date`, `setTimeout`, `requestAnimationFrame`, `performance`)는 Playwright의 가짜 시계입니다. 멈춘 채 프레임마다 1/30초씩 나아가게 하고 찍으므로, 맵 뷰의 물결과 툴팁 지연이 찍는 속도와 상관없이 영상 시간에 맞습니다.
- 같은 그림은 한 장만 씁니다. `timeline.json`의 `frames`는 프레임마다 `[그림 번호, 커서 x, 커서 y, 눌림]`이고 `events`는 자막, 장, 카메라, 강조, 클릭, 단축키, 파일 복사입니다.
- 마우스 커서는 화면에 그려지지 않으므로 위치만 남기고 합성 단계가 그립니다.
- `<select>`는 누르지 않습니다. 브라우저의 팝업이 다음 입력을 가로채기 때문입니다. 누르는 모습만 남기고 값은 `selectOption`으로 바꿉니다.
- F5는 누르지 않습니다. 브라우저 모드의 F5는 게임 탭을 쓰지만, 영상은 데스크톱 앱의 기본 실행 방식(별도 창)을 보입니다. 대신 그 순간의 프로젝트 파일을 `runs/<이름>/`에 내보내고 표시(`run-<이름>`, `run-<이름>-end`)를 남깁니다.

### 3.2 게임 촬영 (`capture-game.mjs`)

`runs/<이름>/`을 엔진 실행 파일로 창 없이(`SDL_VIDEODRIVER=dummy`, `SDL_AUDIODRIVER=dummy`) 돌리고 `INITIAL2D_SCREENSHOT`으로 모든 프레임을 받습니다.

- 진입 스크립트는 촬영용 `main.lua`로 바꿉니다. 엔진이 한 프레임을 그릴 때마다 씬을 정확히 1/30초 나아가게 하므로 프레임 n은 게임 시간 n/30초입니다. 창 없이 돌면 그리기와 틱이 벽시계에 맞지 않기 때문입니다.
- 씬 로더(`scripts/lua/scene_loader.lua`)와 타일맵 오브젝트 스크립트(`scripts/lua/scene_types/tilemap.lua`)는 엔진 체크아웃의 것으로 덮습니다. 에디터의 템플릿이 엔진보다 오래되었으면 물결이 움직이지 않기 때문입니다.

### 3.3 합성 (`video.html`, `video.js`, `lib/render.mjs`)

`video.html`은 1920x1080 고정 무대이고 `window.seek(t)`가 t초의 그림을 만듭니다. 모든 움직임을 t의 함수로 계산하므로 어느 프레임을 어느 순서로 찍어도 같은 그림이 나옵니다. `render.mjs`가 페이지와 재료를 로컬 HTTP로 띄우고, 프레임마다 `seek`한 화면을 ffmpeg에 넘깁니다. 글꼴은 Pretendard Variable(jsdelivr)과 JetBrains Mono(Google Fonts)를 받으므로 네트워크가 필요합니다.

| 구간 | 길이 | 내용 |
|---|---|---|
| 처음 | 7초 | 제목과 완성한 맵 (게임 프레임이 타일 단위로 나타납니다) |
| 준비: ChipSet의 구성 | 50초쯤 | ChipSet을 확대해 구역(물, 물 몸통, 애니메이션 타일, 땅 오토타일, 하층, 상층)을 차례로 강조합니다. 소재 출처와 RTP 주의 |
| 에디터 | 촬영 길이 | 화면, 카메라(강조할 곳으로 확대), 커서와 클릭, 강조 상자, 자막, 장 카드, 단축키, 게임 창 |
| 끝 | 11초 | 따라 한 순서, 가이드 위치, 출처 |

## 4. 고치는 법

- 자막: 에디터 구간은 `capture-editor.mjs`의 `rec.say(...)`, ChipSet 구간은 `video.js`의 `BEATS`입니다. `**굵게**`는 화면의 이름(메뉴, 버튼), `` `코드` ``는 파일과 값입니다. 자막의 길이에 따라 다음 자막까지 기다리는 시간이 정해집니다 (1초에 9자, 짧아도 2.2초).
- 장면의 동작: `capture-editor.mjs`가 가이드의 절 순서대로 적혀 있습니다. 맵의 자리(호수, 길, 나무)는 파일 위쪽의 상수입니다.
- 카메라: `rec.camera(상자, { maxZoom })`. 합성 단계가 0.9초에 걸쳐 그 상자가 보이게 확대합니다 (최대 2배, 그림이 2배 해상도라 더 키우면 흐려집니다).
- 문구와 모양: `video.html`의 CSS, 처음과 끝의 글은 `video.html`, ChipSet 구역은 `video.js`의 `REGIONS`입니다.
- 설계 확인은 `--skip-editor --skip-game --times ...`로 몇 장만 봅니다. 촬영은 다시 하지 않습니다.
- 뒤쪽 장의 동작만 확인할 때는 `capture-editor.mjs --dry-until <장> --out <다른 폴더>`로 그 장 앞까지는 찍지 않고 시계만 돌립니다. 앞쪽 장을 한 번 거쳐야 맵과 프로젝트가 생기기 때문입니다.

## 5. 지킬 것

- 영상의 ChipSet은 EasyRPG RTP의 Exterior(JasonPerry, CC0)만 씁니다. RPG Maker의 RTP 소재는 영상에 넣지 않습니다.
- 자막은 사용자 가이드와 같은 문체(정의 먼저, 비유 없음, 합니다체)이고 가이드에 적힌 동작만 보입니다. 가이드를 고치면 영상의 자막도 맞춥니다.
- 게임 화면은 엔진이 실제로 그린 프레임만 씁니다.
