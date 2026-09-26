# 04. 확장 시스템과 타일맵 확장

> 결정: 타일맵은 코어가 아니라 확장이다. 확장은 코어의 등록 API로 오브젝트 타입, 자산 타입, 패널, 도구,
> 커맨드를 더한다. 에디터 확장 하나에 런타임 모듈(Lua와 Ruby) 하나가 짝이다. 타일맵 확장이 첫 소비자이며
> 확장 API가 맞는지 증명하는 자리다.

## 1. 확장이란

Unity에서 타일맵이 패키지이고 `Tilemap`이 씬에 놓는 게임오브젝트인 것과 같은 그림이다.

- 확장은 `activate(api)` 하나를 내보내는 패키지다. 처음에는 같은 모노레포의 패키지를 `app`이 빌드 시점에 정적으로 등록한다.
- 확장은 코어의 API만 쓴다. 코어의 내부(문서 클래스, PIXI 스테이지)에 손을 넣지 않는다. 그래야 코어를 고쳐도 확장이 깨지지 않고, 나중에 동적 로딩으로 갈 수 있다.
- 확장은 다른 확장에 의존할 수 있다. `ext-rpg`의 이벤트 오브젝트는 타일맵 격자 좌표를 쓰므로 `ext-tilemap`에 의존한다. 의존은 `package.json`의 의존성으로 드러낸다.

## 2. 확장 API

| 등록 | 무엇을 더하는가 | 코어가 그것으로 하는 일 |
|---|---|---|
| `registerObjectType({ type, label, icon, defaults, Inspector, createSceneNode, runtime })` | 씬에 놓을 수 있는 오브젝트 타입 | "오브젝트 추가" 메뉴에 항목, 계층에 아이콘, 인스펙터에 `Inspector` 컴포넌트, 씬 뷰에 `createSceneNode`가 돌려준 PIXI 노드. `runtime`은 로더 모듈 이름(`scripts/lua/scene_types/tilemap.lua`)이며 검증과 문서에 쓴다 |
| `registerAssetType({ extensions, label, open, Preview })` | 프로젝트 패널이 아는 파일 종류 | 더블클릭으로 `open`, 인스펙터에 `Preview` |
| `registerPanel({ id, title, Component, defaultDock })` | 도킹 패널 | "창" 메뉴 토글, 레이아웃 프리셋에 자리 |
| `registerTool({ id, label, icon, appliesTo, onPointer... })` | 씬 뷰 도구 | 툴바의 "확장 도구" 자리. `appliesTo`가 맞는 오브젝트가 선택됐을 때만 활성 |
| `registerCommand({ id, label, shortcut, run, enabled })` | 커맨드 | 메뉴와 툴바와 단축키가 같은 커맨드를 가리킨다 |
| `registerMenu({ path, commandId })` | 메뉴 항목 | 도구 메뉴 아래 확장 이름의 하위 메뉴 |
| `registerValidator(fn)` | 저장 전 검증 | 콘솔 "문제" 탭에 결과 |
| `registerImporter/Exporter({ label, extensions, run })` | 파일 가져오기와 내보내기 | 도구 메뉴 |

문서 편집은 코어의 명령 객체로만 한다. 확장이 `document.applyCommand(cmd)`를 부르면 되돌리기 스택에 들어간다.
확장이 문서를 직접 고치는 길은 없다. 타일 칠하기가 씬의 되돌리기와 한 스택에 들어가는 것이 이 규칙의 결과다.

## 3. 런타임 짝

에디터 확장이 등록한 오브젝트 타입은 게임 안에서 누군가 만들어야 한다. 씬 로더는 코어 타입(`node`, `sprite`, `text`)만 알고,
나머지는 **타입 모듈**에 위임한다.

```
scripts/lua/scene_loader.lua            코어 타입과 위임
scripts/lua/scene_types/tilemap.lua     타일맵 확장의 짝: props.map 을 Tilemap.load 로
scripts/ruby/scene_loader.rb            같은 것의 Ruby 판
scripts/ruby/scene_types/tilemap.rb
```

규칙 셋.

1. **에디터 확장 하나, 런타임 모듈 하나(언어당), 픽스처 하나.** 셋이 같은 이름을 쓴다.
2. 런타임 모듈은 엔진 저장소에 산다 (`scripts/lua/scene_types/`). 에디터는 새 프로젝트 템플릿에 그것을 복사하거나, 엔진 저장소를 참조한다. 어느 쪽인지는 R1에서 정한다. 복사가 단순하고 참조가 갱신에 유리하다.
3. 에디터의 "문제" 탭은 씬에 쓰인 타입의 런타임 모듈이 프로젝트에 있는지 확인한다. 없으면 실행 전에 알려 준다.

## 4. 타일맵 확장 설계

### 데이터

- **맵 데이터는 씬 파일이 아니라 맵 파일에 있다.** 씬의 타일맵 오브젝트는 `props.map`으로 `resources/maps/*.json`(엔진 맵 포맷 v2)을 가리킨다. 이유: 엔진의 `Tilemap.load`가 이미 그 파일을 읽고, 알데바란과 항구 마을이 그 파일을 쓰며, 맵은 크다(80x70 맵이 169KB).
- **타일셋은 자산 타입이다.** 이미지 파일 + 타일 크기. 옛 에디터는 16x16으로 고정했는데, 엔진 맵 포맷의 `tileWidth`와 `tileHeight`를 따른다.
- **빈 칸은 내부적으로 `-1`이다.** 옛 에디터가 0을 빈 칸으로 써서 첫 타일셋의 첫 타일을 표현하지 못했다 (엔진 3단계 문서의 알려진 한계). 파일에서는 엔진 규칙(gid 0이 빈 칸)으로 변환한다. 이 변환은 `MapFormat.ts`의 순수 함수에 들어간다.
- **`events`를 비롯해 확장이 모르는 키는 보존한다.** 엔진 12 문서의 마일스톤 1("잃지 않기")이 여기서 끝난다. 열어서 타일 한 칸을 칠하고 저장해도 항구 마을의 짐 상자 이벤트가 그대로 돈다.

### 편집

- 씬에서 타일맵 오브젝트를 선택하면 **타일 팔레트**와 **레이어** 패널이 살아나고, 툴바의 확장 도구(펜, 사각형, 채우기, 지우개, 스포이드)가 활성이 된다. 오브젝트 선택이 풀리면 도구도 접힌다.
- 레이어는 파일이 가진 만큼이다 (4로 고정하지 않는다). 레이어 이름과 가시성과 `groundLayers` 구분(캐릭터 아래인지 위인지)을 레이어 패널에서 고친다.
- **통행 레이어** 편집 모드. 격자 위에 막힘 표시를 칠한다. 엔진의 충돌 레이어 형식을 그대로 쓴다.
- 되돌리기는 씬 문서의 스택에 `PaintTilesCommand`로 들어간다. 옛 `TilemapHistory.ts`의 델타 기록 방식을 그 명령 안에서 쓴다.
- 오토타일은 후순위다. `AutoTile.ts`(Wang blob 6x8)를 옮겨 두되 도구로 켜는 것은 엔진 로드맵 13단계("굽기" 방식, 에디터가 최종 gid를 굳혀 내보낸다)와 함께.

### 옛 기능 이전표

| 옛 기능 | 옛 자리 | 새 자리 |
|---|---|---|
| 타일맵 데이터(`number[]`, `data[z*W*H + y*W + x]`), 그리기, 채우기 | `tilemap.ts` (1,052줄) | `ext-tilemap/src/model/`(순수 데이터와 알고리즘, DOM 없음)과 `ext-tilemap/src/view/`(PIXI 8 노드) |
| 타일셋 팔레트와 선택 표시 | `TilesetCanvas.ts`, `tilesetMarker.ts`, `tileMarker.ts` | `ext-tilemap/src/panels/Palette.tsx` (canvas) |
| 되돌리기 | `TilemapHistory.ts` | `PaintTilesCommand` (코어 명령 객체) |
| 오토타일 | `AutoTile.ts` (미사용) | `ext-tilemap/src/model/autotile.ts` (후순위) |
| 맵 포맷 변환, gid 변환 | `map/MapFormat.ts`, `map/MapDocumentService.ts` | `ext-tilemap/src/format/` (v1과 v2, 보존 키), 기존 테스트가 그대로 따라온다 |
| 새 맵, 열기, 내보내기 대화상자 | `NewMapWindow.tsx`, `OpenMapWindow.tsx`, `ExportMapWindow.tsx` | "오브젝트 추가 > 타일맵"이 새 맵을 만들고, 열기는 프로젝트 패널, 내보내기는 저장이 대신한다. 옛 v1로 내보내는 것만 도구 메뉴 |
| 레이어 창 | `app.ts`의 DOM 조작 | `ext-tilemap/src/panels/Layers.tsx` |
| 메뉴와 툴바 | `menu/`, `toolbar/` (데코레이터) | `registerCommand`, `registerTool` |

### 런타임 짝 (엔진 저장소)

`scene_types/tilemap.lua`는 `props.map`을 `Tilemap.load`로 열고, `groundLayers`로 캐릭터 아래와 위를 가른다
(엔진 10단계에서 맵 정의 파일이 정하던 값). 카메라는 씬 로더의 카메라 오브젝트(있으면)를 따른다.

## 5. RPG 확장 예고 (E5)

엔진의 `docs/plans/12-editor-events.md`가 이미 설계를 대부분 해 두었다. 이 확장은 그 문서의 마일스톤 2와 3이다.

- `event` 오브젝트 타입. 타일맵 오브젝트의 자식으로만 놓이고 격자 좌표를 가진다. 외형은 CharSet 정면 프레임.
- 커맨드 목록 편집기는 `resources/schema/event-commands.json`에서 폼을 만든다. 위젯 여덟(문자열, 여러 줄, 숫자, 불리언, 열거, 파일, 얼굴, 조건, 중첩 목록).
- 저장 전 검증은 엔진의 `Commands.validate`와 같은 경로 표기(`events[2].commands[3]`)로 알린다.
- 데이터베이스 패널(아이템, 적)은 JSON 표 편집기다. 엔진 로드맵 v2의 후보 항목.

## 6. 확장의 검수

확장 하나가 끝났다고 할 때 있어야 하는 것.

1. 모델 단위 테스트 (`node --test`): 알고리즘과 변환. 타일맵이면 채우기, gid 변환, 보존 키 왕복.
2. 픽스처 왕복: 엔진 저장소의 픽스처(맵은 `sample_v2.json`)를 열고 저장하면 동등.
3. 교차 인수: 확장이 만든 파일을 엔진이 헤드리스로 열어 골든과 대조. 타일맵이면 에디터가 칠한 맵을 `INITIAL2D_SCENE=tilemap INITIAL2D_MAP=... INITIAL2D_SCREENSHOT=...`으로 확인하는 엔진 3단계의 절차 그대로.
4. 브라우저 모드 Playwright 스모크: 오브젝트 추가, 도구 하나 사용, 저장, 파일 내용 확인.
