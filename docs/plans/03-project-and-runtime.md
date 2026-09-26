# 03. 프로젝트, 로컬 파일, 크로스 플랫폼, 인게임 실행, 씬 포맷

> 결정: 프로젝트는 `game.json`이 있는 폴더다. 파일은 `ProjectBackend` 인터페이스 하나로 다루고
> 구현은 Tauri와 브리지 둘이다. 인게임은 외부 프로세스 실행이 1차, 내장 실행(WASM)이 2차다.
> 에디터가 만든 씬은 **스크립트 레이어의 씬 로더**가 읽는다. C++은 손대지 않는다.

## 1. 프로젝트

```
mygame/
├── game.json                 엔진이 읽는다: windowWidth, windowHeight, renderScale, script, 그리고 startScene
├── scripts/
│   ├── lua/main.lua          Lua 진입 (템플릿은 씬 로더로 startScene을 연다)
│   └── ruby/main.rb          Ruby 진입 (선택)
├── resources/
│   ├── scenes/               에디터가 만드는 씬 (JSON, 포맷 v1)
│   ├── maps/                 타일맵 확장이 만드는 맵 (엔진 맵 포맷 v2)
│   ├── images/, audio/, fonts/
│   └── schema/               두 저장소가 함께 읽는 스키마 (커맨드 등)
└── .initial-editor/          에디터만 쓰는 것: 레이아웃, 열린 탭, 최근 파일. gitignore 권장
```

- **프로젝트 = `game.json`이 있는 폴더.** 엔진이 이미 작업 폴더의 `./game.json`을 읽으므로 새 개념이 아니다. 엔진은 모르는 키를 무시하므로 에디터가 키를 더해도 안전하다. `startScene`은 엔진이 아니라 씬 로더(스크립트)가 읽는다.
- **`game.json`이 없는 폴더**(지금의 Initial2D 저장소가 그렇다)를 열면 "이 폴더를 프로젝트로 등록할까요"를 묻고 기본값으로 만든다. 알데바란처럼 씬 파일 없이 손으로 쓴 게임도 그대로 프로젝트다. 그때 에디터가 하는 일은 스크립트 편집, 자산 보기, 타일맵 편집, 실행이며 씬 기능은 쓰지 않으면 그만이다.
- 에디터 전용 상태는 `game.json`에 넣지 않고 `.initial-editor/`에 둔다. 게임 데이터와 편집 상태를 섞지 않기 위해서다.
- 새 프로젝트 템플릿은 둘. **빈 프로젝트**(씬 하나, `main.lua`가 씬 로더로 그 씬을 연다)와 **플래피버드**(엔진 저장소의 `scripts/lua/games/flappy.lua`를 씬과 컴포넌트로 옮긴 것, E2에서 만든다).

## 2. `ProjectBackend`: 로컬 파일을 다루는 하나의 창구

UI는 이 인터페이스만 본다. 구현은 `backend-tauri`(데스크톱)와 `backend-bridge`(브라우저)다.

```ts
interface ProjectBackend {
  kind: "tauri" | "bridge";
  open(root: string): Promise<ProjectInfo>;        // game.json 확인, 목록
  list(rel: string): Promise<Entry[]>;             // 폴더 한 층
  readText(rel: string): Promise<string>;
  readBinary(rel: string): Promise<Uint8Array>;
  writeText(rel: string, text: string): Promise<void>;   // 임시 파일 뒤 rename
  writeBinary(rel: string, data: Uint8Array): Promise<void>;
  remove(rel: string): Promise<void>;
  exists(rel: string): Promise<boolean>;
  watch(handler: (e: ChangeEvent) => void): () => void;   // 외부 변경 알림
  hmrPush(files: { path: string; data: Uint8Array }[], target?: { host: string; port: number }): Promise<void>;
  run(spec: RunSpec): Promise<RunHandle>;          // 엔진 프로세스 (브리지 모드는 미지원을 명시)
  pickFolder(): Promise<string | null>;            // 브리지 모드는 경로 입력 폼으로 대체
}
```

### 파일 규칙

1. **경로는 늘 프로젝트 루트 기준 상대 경로, 구분자는 `/`.** Windows의 역슬래시는 백엔드가 바꾼다. 엔진과 맵 파일과 씬 파일도 같은 규칙이라 파일에 적힌 경로가 그대로 통한다.
2. **루트 밖은 없다.** 정규화한 뒤 루트 밖이면 거부, `..`와 URL 인코딩 탈출과 심링크 탈출 거부. 브리지 서버가 이미 하는 검사와 같은 케이스로 Rust 쪽도 테스트한다.
3. **저장은 원자적이다.** 임시 파일에 쓰고 rename. 실행 중인 게임이 반쯤 쓰인 파일을 읽지 않게 하기 위해서다.
4. **외부 변경 정책**은 옛 `LuaEditor.tsx`의 것을 모든 문서로 넓힌다. 미수정 문서는 조용히 다시 읽고, 수정 중인 문서는 배너를 띄워 "다시 읽기"와 "내 것 유지"를 고르게 한다. 저장 직전 파일이 바뀌어 있으면 모달로 한 번 더 묻는다 (2026-09-27 구현: 지워졌거나 다시 읽지 못한 파일도 묻고, 덮어쓰기와 다시 읽기와 취소를 고른다. 자세한 것은 [e3-tilemap.md](e3-tilemap.md)의 저장 충돌 항목).
5. **텍스트는 UTF-8, 줄 끝은 LF.** 대사에 한글과 줄바꿈이 든다. 왕복 테스트 픽스처에 반드시 넣는다.
6. 바이너리(이미지, 오디오)는 읽기와 복사만 한다. 편집은 외부 도구의 일이다.

### 브라우저 모드에서 안 되는 것

폴더 선택 대화상자(경로 입력으로 대체), 엔진 프로세스 실행(브리지 서버가 `POST /api/run`을 더하면 가능하지만 이번 로드맵에서는 하지 않는다. 브라우저 모드는 개발과 UI 테스트용이다). UI는 `backend.kind`를 보고 해당 버튼을 비활성으로 두고 이유를 툴팁에 적는다.

## 3. 크로스 플랫폼

| 순위 | 플랫폼 | 웹뷰 | 엔진 실행 파일 | 검증 시점 |
|---|---|---|---|---|
| 1 | macOS | WKWebView | `build/Initial2D` (SDL2, CMake) | E0부터 매 단계 |
| 2 | Windows | WebView2 | SDL2 백엔드를 CMake로 빌드한 것. GDI 원형은 손대지 않는다 | E1부터 |
| 3 | Linux | WebKitGTK | SDL2 CMake 빌드 | E6 |
| 개발 | 브라우저 (Chrome) + 브리지 | Chromium | 실행 불가 | E0부터 Playwright |

플랫폼 차이는 백엔드와 셸 안에 가둔다. `core`와 `app`은 플랫폼을 모른다. 단축키의 Ctrl과 Cmd 매핑, 경로 구분자, 폰트 기본값이 셸의 일이다.

## 4. 인게임 실행 (저자 요구: 프로그램으로도, 에디터 안에서도)

### 모드 A: 외부 프로세스 (E1, 1차)

엔진 실행 파일을 **프로젝트 폴더를 작업 폴더로** 띄운다. 엔진이 `./game.json`과 `./scripts/`를 작업 폴더에서 찾기 때문에 인자가 필요 없다.

| 항목 | 내용 |
|---|---|
| 엔진 경로 | 설정값. 자동 탐색 순서: 프로젝트의 `.initial-editor/engine`(사람이 적은 것) > 형제 폴더 `../Initial2D/build/Initial2D` > E6의 동봉 사이드카. 찾지 못하면 실행 버튼이 이유를 띄운다 |
| 실행 인자와 환경 | `cwd = 프로젝트 루트`, `INITIAL2D_HMR=1`(핫 리로드 서버 켜기), `INITIAL2D_SCRIPT=lua|mruby`(툴바의 언어), 현재 씬부터 실행이면 `INITIAL2D_SCENE=<씬 이름>`(씬 로더가 읽는다). `Initial2D --features`로 그 빌드가 Ruby를 지원하는지 먼저 확인해 언어 토글을 잠근다 |
| 출력 | stdout과 stderr를 줄 단위로 콘솔에. `파일:줄:` 꼴(Lua의 `scripts/lua/x.lua:12:`, Ruby의 백트레이스)은 링크로 만들어 누르면 그 자리를 연다 |
| 정지 | 프로세스 종료. 게임이 스스로 끝나면 종료 코드를 콘솔에 |
| 실행 중 저장 | 스크립트를 저장하면 `hmrPush`(TCP 5959, `I2DH`)로 `scripts/` 묶음을 보내고 엔진이 VM을 다시 시작한다. 씬 파일과 맵 파일도 묶음에 넣는다(엔진이 재시작하며 다시 읽는다) |
| 하나만 | 동시에 하나만 띄운다. 실행 중에 다시 누르면 재시작 |

이 모드는 엔진을 한 줄도 안 고치고 되고, 화면이 진짜 엔진이라 근사가 아니며, mruby도 그대로 된다. 그래서 1차다.

### 모드 B: 에디터 안에서 (E4, 2차)

엔진을 Emscripten으로 빌드한 `Initial2D.wasm`을 **게임 뷰 패널의 canvas**에 올린다. 상세는 [e4-embedded-play.md](e4-embedded-play.md).
요점만 적으면, 프로젝트 파일을 WASM의 가상 파일 시스템에 스테이징하고, 핫 리로드는 TCP 대신 함수 호출로, 콘솔은 `print`를 가로채서.
부산물로 웹 데모(README에 넣을 수 있는 실행 링크)가 생긴다. Lua 먼저이고 mruby는 libmruby 교차 빌드가 되면 뒤따른다.

두 모드는 같은 툴바 버튼을 쓰고 설정에서 고른다. 모드 B가 되어도 모드 A는 남는다. 실기 화면과 성능은 프로세스가 진실이다.

## 5. 씬 포맷 v1과 씬 로더 (R1, 엔진 저장소의 선행 작업)

에디터가 만든 데이터가 게임에서 돌아가려면 읽는 쪽이 있어야 한다. 그것이 지금 엔진에 없다.
맵 포맷 v2의 `events`가 그랬듯 **C++은 모르고 스크립트가 읽는다.** Lua 판과 Ruby 판을 함께 만든다.

### 파일 (초안, R1에서 확정)

```json
{
  "version": 1,
  "name": "main",
  "objects": [
    { "id": "bg",     "type": "sprite",  "x": 0,   "y": 0,   "props": { "image": "resources/images/bg.png" } },
    { "id": "map",    "type": "tilemap", "x": 0,   "y": 0,   "props": { "map": "resources/maps/forest.json", "groundLayers": 1 } },
    { "id": "player", "type": "sprite",  "x": 100, "y": 200,
      "props": { "image": "resources/images/player.png", "frames": 4, "frameWidth": 32, "frameHeight": 32 },
      "scripts": ["scripts/lua/components/player.lua"] },
    { "id": "score",  "type": "text",    "x": 8,   "y": 8,   "props": { "text": "0", "font": "resources/fonts/hangul.fnt" } }
  ]
}
```

### 규칙

1. `version`이 있고, 로더는 모르는 버전을 명확한 오류로 거부한다 (맵 포맷과 같다).
2. **모르는 키는 무시하고 보존한다.** 에디터가 편집하지 못하는 데이터도 열고 저장하면 그대로 남아야 한다 (맵의 통행 레이어에서 배운 규칙).
3. `id`는 씬 안에서 유일하다. 에디터는 저장 전에 막고, 로더는 열 때 잡는다.
4. `type`은 등록제다. 코어 타입은 `node`(빈 트랜스폼), `sprite`, `text`. 확장 타입(`tilemap`, `event`)은 에디터 확장과 런타임 모듈이 **쌍으로** 등록한다. 모르는 타입은 오류다.
5. 경로는 프로젝트 루트 기준 `/` 상대 경로. 리소스 고르기(`assets.lua`처럼 RTP 유무로 달라지는 것)는 논리 이름을 쓰고 로더가 푼다. 이것은 R1에서 정한다.
6. `objects` 순서가 그리기 순서다. 계층 패널의 순서가 곧 파일의 순서다.

### 스크립트 컴포넌트 계약

오브젝트에 붙는 스크립트는 모듈 하나가 훅 표를 돌려준다. 씬 계약(`init`, `update`, `render`, `destroy`)과 같은 이름을 쓴다.

```lua
-- scripts/lua/components/player.lua
local M = {}
function M.init(obj, scene) end          -- obj: 로더가 만든 오브젝트(스프라이트 핸들, 위치, props)
function M.update(obj, scene, elapsed) end
function M.render(obj, scene) end        -- 보통 비워 둔다. 로더가 그린다
function M.destroy(obj, scene) end
return M
```

Ruby는 같은 이름의 메서드를 가진 클래스다. 로더는 `scene:find(id)`, `scene:spawn(spec)`, `scene:remove(id)`, `scene:switch(name)`을 준다. 이 넷이면 플래피버드가 된다(파이프 스폰과 제거, 게임 오버 씬 전환).

### 새 프로젝트의 `main.lua`

```lua
local SceneLoader = require("scripts/lua/scene_loader")
local game = Json.Load("./game.json")
local scene
function init() scene = SceneLoader.open(System.env("INITIAL2D_SCENE") or game.startScene) end
function update(elapsed) scene = scene:tick(elapsed) end
function render() scene:draw() end
function destroy() scene:close() end
```

`INITIAL2D_SCENE`을 씬 로더가 읽으므로 에디터의 "현재 씬부터 실행"이 환경 변수 하나로 된다.

## 6. 데이터 계약과 교차 검증

두 저장소가 어긋나지 않게 하는 장치는 엔진 검수 문서(09-testing.md 3.5절)의 방식 그대로다.

- **픽스처는 엔진 저장소에 둔다.** `Initial2D/tests/fixtures/scenes/sample_v1.json`. 에디터 저장소의 `tests/fixtures/`는 그 사본이고, 사본이 어긋나면 테스트가 깨진다(sha 비교).
- **양쪽이 같은 파일로 왕복한다.** 엔진은 "로더가 열고 다시 직렬화하면 동등", 에디터는 "문서로 불러와 저장하면 동등". 줄바꿈과 한글이 든 텍스트 오브젝트가 픽스처에 들어 있다.
- **교차 인수 테스트.** 에디터의 `core`가 만든 씬 파일(Node에서 생성)을 엔진이 헤드리스로 열어 골든 스크린샷과 대조한다. 엔진 저장소의 씬 테스트 하나(`scene_loader_scene`)가 그것이고, 에디터 저장소의 CI는 엔진 저장소를 체크아웃해 그 테스트를 돌린다. "에디터가 만든 것이 게임에서 돈다"를 사람이 아니라 테스트가 매번 확인한다.
- 스키마 버전을 올릴 때는 픽스처를 먼저 바꾸고 양쪽 테스트가 함께 깨지는 것을 확인한 뒤 고친다.
