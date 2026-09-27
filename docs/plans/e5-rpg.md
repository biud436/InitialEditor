# E5: RPG 확장. 이벤트를 맵 위에 놓고 커맨드를 적는다

**권장 모델**: Claude Fable 5. 두 저장소가 함께 읽는 데이터 계약(`event-commands.json`)과, 타일맵 확장이 다른 확장에게 여는 자리(맵 레이어, 섹션, 실행 제공자)를
정하는 단계다. 한 번 굳으면 되돌리기 비싸고, 뒤의 확장이 전부 이 자리를 쓴다. 마일스톤 3(이전)과 마일스톤 5(인자 위젯)는 Opus 5 로 충분하다.

> 목표: **항구 마을 맵을 열어 NPC 를 한 칸에 놓고, 트리거와 외형을 고르고, 분기가 있는 대사를 적고, 저장한 뒤 "이 이벤트 앞에서 실행"을 누르면
> 게임에서 그 NPC 에게 말을 걸 수 있다. Lua 를 한 줄도 쓰지 않고.** 그리고 이것을 사람이 아니라 스크립트가 진짜 엔진으로 확인한다.

엔진 쪽 짝은 **M2(RPG 이벤트 데이터 계약과 이전)** 이다. 엔진 저장소 `docs/plans/m2-rpg-events.md` 로 따로 적고,
이 문서의 마일스톤 1 과 3 이 그 내용이다. 엔진 `docs/plans/12-editor-events.md` 는 이 단계의 출발점이며, 아래 조사로 달라진 곳을 고친다.

**계약의 정본은 엔진 저장소 [`docs/plans/m2-rpg-events.md`](https://github.com/biud436/Initial2D/blob/master/docs/plans/m2-rpg-events.md) 다** (R1 과 M1 의 선례: 엔진 문서가 정본이고 에디터 문서는 링크한다).
두 스키마 파일, 검증 경로와 검사 목록, 환경 변수와 trace 줄, 이전 규칙이 그 대상이다. 이 문서의 1절, 5.1절, 7절은 그 요약이다.
계약을 고칠 때는 M2 문서를 먼저 고친다. 커맨드 인자의 목록 자체는 `resources/schema/event-commands.json` 이 정본이라 어느 문서에도 표로 다시 적지 않는다.
엔진 쪽 두 PR 은 병합되었다: 계약(엔진 PR #49)과 데모 이벤트의 이전(엔진 PR #50). 에디터 작업은 병합된 엔진 master 를 기준으로 한다.

## 왜 지금, 무엇을 푸는가

E3 에서 저자가 정한 기준은 "텍스트 편집기로 못 하는 일을 먼저"다. RPG 이벤트에서 그 일은 셋이다.

- 이벤트가 **어디에** 있는지 보이지 않는다. 항구 마을의 이벤트 17개 중 16개는 `scripts/lua/maps/port_town.lua` 의 좌표 숫자이고, 맵 그림과 맞춰 보려면 게임을 돌려 걸어가야 한다
- 이벤트 본문은 이미 데이터(커맨드 목록)인데 중첩이 깊다. 창고 이벤트는 `if` 가 세 겹이고, 여관 주인은 `if` 안의 `choice` 안의 `if` 다. 괄호를 맞추며 고치는 일은 틀리기 쉽고, 틀리면 맵을 열 때 게임이 멈춘다
- 고친 대사를 확인하려면 그 NPC 까지 걸어가 말을 걸어야 한다

그래서 이 단계의 결과물은 맵 위의 이벤트 레이어, 트리 모양의 커맨드 편집기, 그리고 "이 이벤트 앞에서 실행"이다.

## 지금 어디까지 되어 있는가 (2026-09-27 조사)

### 엔진 (Initial2D, master `4bf2280`)

| 조각 | 상태 | 어디 |
|---|---|---|
| 이벤트 커맨드 17종 | ✅ 실행과 검증. `SPEC` 은 **필수 인자와 Lua 타입만**(`string`, `number`, `table`) 적은 지역 표이고 밖에 내보내지 않는다. 하위 목록의 자리(`NESTED`: `choice.branches`, `if.thenDo/elseDo`)도 지역 표다. 밖에 보이는 것은 `Commands.codes()` 뿐 | `scripts/lua/rpg/commands.lua` |
| 커맨드 이름 | `message`, `choice`, `wait`, `transfer`, `moveRoute`, `turn`, `setFlag`, `setVar`, `giveItem`, `takeItem`, `if`, `playSe`, `playBgm`, `showLocation`, `scene`, `script`, `comment`. 단위 테스트가 17종을 못 박는다 | `tests/lua/cases/rpg_commands_test.lua` |
| 조건 | `item`, `flag`, `var` 세 꼴. 판정 순서가 item, flag, var 이다 (키가 둘 이상이면 앞의 것). 비교 연산은 `==`, `~=`, `<`, `<=`, `>`, `>=` 와 별칭 `=`, `!=` | `Commands.test` |
| 검증 경로 | `Commands.validate` 가 `"[2].branches[1][3]: ..."` 꼴(1부터 세는 Lua 표기)을 낸다. `Event.new` 가 `event 'id'의 커맨드가 잘못되었다` 로 감싸 던진다 | `commands.lua`, `event.lua` |
| 검사하지 않는 것 | 커맨드 밖의 이벤트 칸은 `Event.new` 의 assert 두 개(id, trigger)뿐이다. `dir` 이 틀리면 외형이 있을 때 `Character.new` 가 assert 하고, 외형 번호가 0~7 밖이면 첫 프레임의 `Specs.charsetFrameIndex`, 얼굴 번호가 0~15 밖이면 대화 도중의 `Specs.facesetRect`(`message.lua` 의 `drawFace`)가 assert 한다. 앞의 것은 `spawnEvent` 의 `pcall` 이 잡아 **맵 전체가 "맵 로드 실패"** 가 되고, 뒤의 둘은 게임이 멈춘다 | `event.lua`, `character.lua`, `specs.lua`, `message.lua` |
| auto 트리거 | `Manager:onMapStart` 가 병합 순서의 **첫 auto 하나만** 돌린다 (`break`). 항구 마을과 여관과 오두막에 auto 가 하나씩 있다 (`arrival` 등) | `event.lua` |
| 맵 파일의 이벤트와 병합 | ✅ `MapData.merge`: 맵 파일 것이 먼저, 정의 파일에만 있는 것이 뒤. **같은 id 면 Lua 정의 파일이 이기고** 자리는 맵 파일 쪽을 지킨다 | `scripts/lua/rpg/mapdata.lua` |
| 맵 파일에 실린 이벤트 | `port_town.json` 의 `crates` 하나. 인수 시나리오가 `crateLine` 으로 확인한다 | `resources/maps/port_town.json` |
| Lua 에 있는 이벤트 | 31개. 항구 마을 16, 여관 6, 마을 6, 오두막 3. 전부 커맨드 목록이고 `script` 함수와 `scripts` 표는 **하나도 없다**. 데이터가 아닌 것은 외형과 얼굴의 파일 경로(`Assets.npcCharset()`, `Assets.faceset()` 호출)뿐이고, `wander` 는 이미 평범한 표다 | `scripts/lua/maps/*.lua` |
| 이벤트 칸 | `spawnEvent` 가 읽는 것: `id`, `x`, `y`, `dir`, `trigger`, `commands`, `charset`, `through`, `solid`, `speed`(기본 3), `wander`, `data`. `Event.new` 가 받는 `enabled` 는 넘기지 않는다 | `scripts/lua/games/rpgdemo/game.lua` |
| 맵 등록 | `MAPS` 지역 표(port_town, inn, village, room → 정의 모듈). `INITIAL2D_MAP` 으로 시작 맵을 고르고, `INITIAL2D_SCENE=rpg` 면 타이틀을 건너뛴다 (`main.lua` 가 씬을 고르는 허브다) | `game.lua`, `scripts/lua/main.lua` |
| 맵 파일 경로 | 정의 파일의 `map` 은 `"./resources/maps/port_town.json"` 꼴이고, 마을과 오두막은 `Assets.mapPath` 가 RTP 칩셋이 있으면 `_rtp.json` 을, 없으면 기본 판을 고른다 | `scripts/lua/maps/*.lua`, `assets.lua` |
| 아이템 표 | 4개(`warehouse_key`, `lamp_oil`, `silver`, `shell`), 칸은 `name`, `desc`, `order`. Lua 표 하나 | `scripts/lua/games/rpgdemo/items.lua` |
| 자산 고르기 | "RTP 가 있으면 RTP, 없으면 플레이스홀더". 후보 목록 `PLAYER_CHARSET`, `NPC_CHARSET`, `FACESET`. Ruby 판도 같은 목록 | `scripts/lua/rpg/assets.lua`, `scripts/ruby/rpg/assets.rb` |
| 시트 규격 | CharSet 288x256 에 8명(4열 2행), 프레임 24x32, 정면은 2행. FaceSet 48x48 16개. 서 있는 자세의 열(1)은 **칸이 없고** `walkPattern = { 0, 1, 2, 1 }` 의 주석에만 있다 | `scripts/lua/rpg/specs.lua`, `scripts/ruby/rpg/specs.rb` |
| Ruby | **이벤트 레이어가 없다.** `scripts/ruby/rpg/` 는 assets, choice, message, rng, specs, text, window 뿐이고 rpgdemo 도 Lua 에만 있다 | |
| 인수 시나리오 | `tests/engine/scenes/rpgdemo_scene.lua` 가 게임의 진짜 파일을 얹고 입력 재생기로 키를 눌러 심부름 사슬 전체를 돈다. stdout 줄(`captainLine:`, `crateLine:` 등)과 골든 세 장(`rpgdemo_title`, `rpgdemo_town`, `rpgdemo_bag`), 그리고 여관 문 앞의 픽셀 검사(`INITIAL2D_DEMO_STOP=wall`, 집 벽색과 머리색 픽셀 수)를 `tests/run_engine_tests.py` 가 본다. `INITIAL2D_NO_RTP=1` 로 고정 | |
| 씬 테스트의 작업 폴더 | `make_workdir` 는 `scripts/lua/main.lua` 를 지우고 테스트 씬을 그 자리에 넣는다. 진짜 허브(`main.lua`)로 게임을 띄우는 테스트는 아직 없다 | `tests/run_engine_tests.py` |
| 맵 저장 형식 | `tools/mapfile.py` 가 에디터 `serializeMap` 과 같은 바이트를 쓴다. 그런데 **`port_town.json`, `inn.json`, `village*.json`, `room*.json`, `sample.json` 은 그 형식이 아니다** (`mapfile.py check` 실패). 알데바란 두 장만 맞다 | |

조사에서 나온 문제 (M2 에서 고친다):

1. **`tools/generate_port_maps.py` 가 `json.dump` 로 직접 쓰고 `crates` 를 코드에 박아 둔다.** 생성기를 다시 돌리면 에디터가 놓은 이벤트가 전부 사라진다 (알데바란 생성기는 M1 에서 `write_map` 으로 바꿔 `objects` 를 이어받는다. 항구 쪽은 아직이다)
2. **`transfer` 의 `dir` 을 데모가 버린다.** 실행기는 넘기지만 `game.lua` 의 `requestTransfer(target, x, y)` 가 받지 않아 정의 파일의 `start.dir` 로 선다. 여관 문(`dir = "up"`)과 출구(`dir = "down"`)가 이미 이 값을 쓴다
3. **이벤트 오류가 stdout 에 나오지 않는다.** 틀린 커맨드는 `sceneError` 가 되어 화면에만 "맵 로드 실패"로 그려진다. 에디터 콘솔은 아무것도 못 본다
4. `charset` 에 `file` 이 없으면 `def.charset.file or charsetPath` 로 **플레이어의 CharSet** 이 조용히 쓰인다
5. `playBgm` 의 `fade` 도 호스트(`Bgm.play`)가 쓰지 않는다. 계약에는 남기되 에디터 칸 이름에 적는다
6. **auto 이벤트는 맵마다 첫 하나만 돈다.** 이전 뒤 항구 마을과 여관의 `arrival` 이 병합 순서의 앞에 있으므로, 에디터로 더한 auto 이벤트는 영영 돌지 않는다
7. **틀린 이벤트 하나가 맵을 통째로 막거나 게임을 멈춘다** (위 "검사하지 않는 것"). 맵 파일의 이벤트는 사람 손이 아니라 에디터와 도구가 쓰게 되므로, 엔진이 열 때 전부 검사해 알려야 한다

### 에디터 (InitialEditor, `feat/e4-play`)

E3 는 구현이 들어가 있지만 단계는 🟡 이고(e3 문서의 완료 기준이 아직 비어 있다), E4 는 `feat/e4-play` 에서 **커밋 안 된 변경과 함께 진행 중**이다.
아래 표의 "구현됨"은 코드가 있다는 뜻이지 단계가 끝났다는 뜻이 아니다.

| 조각 | 상태 | 어디 |
|---|---|---|
| 맵 v1, v2 읽기, v2 고정 형식 쓰기, `events` 보존 | 구현됨 (E3). 12 문서의 마일스톤 1("잃지 않기")은 이미 끝났다. `events` 는 `unknown[] \| null` 로 실어 나른다 | `packages/ext-tilemap/src/model/format.ts` |
| 맵 모델과 문서 | 구현됨 (E3). 타일, 통행, 오브젝트를 명령 객체로 고치고 한 되돌리기 스택(`MapDocument.undo`, 코어 `UndoStack`)에 넣는다. dirty 는 스택 위치로 | `ext-tilemap/src/model/mapModel.ts`, `mapDocument.ts` |
| 맵 뷰와 도구 | 구현됨 (E3). PIXI 8 렌더러(덩어리 텍스처), 도구 일곱(B, R, G, E, I, C, V), 팔레트와 레이어와 맵 오브젝트 패널. 뷰의 키는 `MapRenderer.onKeyDown` 이 `mapTools.keyDown` 에 먼저 주고, 처리했으면 전파를 막는다. 지금 `keyDown` 은 Ctrl 이 눌린 키를 받지 않는다 | `packages/app/src/editor/maps/`, `components/maps/` |
| 오브젝트 레이어 | 구현됨 (E3). `resources/schema/map-objects.json` 이 정한 타입으로 표식과 인스펙터 폼을 만든다. 폼 위젯은 앱 안에 있다. Delete 는 전역 단축키가 아니라 `mapTools.keyDown` 이 받는다 | `app/src/editor/maps/objectTools/fieldInputs.tsx`, `app/src/editor/scene/fields.tsx` |
| 스키마 저장소 | 구현됨 (E3). 프로젝트를 열면 비동기로 읽고, 파일이 바뀌면 다시 읽고, **이미 열린 맵 문서와 새로 열리는 맵 문서에 `setSchema` 를 넣는다** (문서가 스키마보다 먼저 열려도 된다) | `app/src/editor/maps/schemaStore.ts` |
| 편집 단축키 | `edit.copy`(Ctrl+C), `edit.paste`(Ctrl+V), `edit.duplicate`(Ctrl+D), `edit.delete`(Delete)는 전역 커맨드이고 씬 탭 전용이다 | `app/src/editor/scene/sceneCommands.ts`, `editor/shortcuts.ts` |
| 여기서 실행 | 구현됨 (E3). 스키마의 `play.env` 로 엔진을 띄운다. **그런데 `play` 가 프로젝트에 하나라 모든 맵에 걸린다.** 항구 마을에서 누르면 알데바란 씬에 `INITIAL2D_ALDEBARAN_STAGE=항구 마을` 을 넘기고, 알데바란은 모르는 스테이지라는 줄을 찍고 기본 스테이지를 연다 | `app/src/editor/maps/objectTools/playHere.ts`, `rules.ts` |
| 내장 실행 | 🟡 E4 (`feat/e4-play`, **병합 전**). WASM 엔진(Lua 만). 스테이징은 `resources/rtp/` 와 숨은 폴더를 뺀다. e4 완료 기준 셋째(두 모드의 화면 비교)와 새 로더 계약(`onExit`, `errorText`, `printErr`) 엔진 빌드의 동기화가 남았다 | `app/src/editor/gameView/` |
| 프로세스 실행 | Tauri 백엔드만 엔진을 띄운다. 브리지와 브라우저 폴더와 메모리 백엔드의 `run` 은 `unsupported` 이고, 그 백엔드에서는 실행이 늘 내장 모드다. 그래서 **Playwright 로는 프로세스 모드를 볼 수 없다** | `packages/backend-bridge/src/index.ts`, `RunnerStore.ts` 의 `mode` |
| 메모리 모드 샘플 프로젝트 | 코드로 만든다. 맵은 `sample.json`, `meadow.json` 과 `map-objects.json` 뿐이고 RPG 맵과 CharSet, FaceSet 은 없다 | `app/src/editor/sampleProject.ts` |
| 확장 API | `registerObjectType`, `registerPanel`, `registerTool`, `registerCommand`, `registerMenu`, `registerValidator` 등. **확장끼리 주고받는 길이 없고, 확장이 백엔드와 프로젝트를 볼 길도 없다.** 등록된 패널은 "확장 패널" 한 탭에 쌓인다. 맵 뷰와 맵 패널은 E3 에서 API 가 모자라 `packages/app` 에 들어갔다 | `packages/core/src/extensions.ts` |
| 실행기의 언어 검사 | `game.json` 의 `script` 만 본다. 덧씌운 `INITIAL2D_SCRIPT` 는 보지 않는다 (엔진 저장소의 로컬 `game.json` 은 `mruby` 다) | `app/src/editor/runner/RunnerStore.ts` |

### 12 문서와 달라진 점

| 12 문서 | 지금 |
|---|---|
| 마일스톤 1(잃지 않기)이 급하다 | E3 가 했다 |
| 스키마를 브리지 `/api/files` 로 받고, 논리 이름 목록은 `/api/project` 에 한 줄 더한다 | 백엔드가 넷(Tauri, 브리지, 브라우저 폴더, 메모리)이다. 서버에 기대지 않고 **프로젝트 파일**로 받는다 |
| 타일맵의 undo 스택(`TilemapHistory`) | 코어 `UndoStack` 이 맵 문서의 스택이다. 이벤트 명령도 `doc.apply(cmd)` 로 같은 스택에 |
| 폼 위젯 여덟 | 실제 인자를 다 적으면 타입이 열여섯 남짓이다 (1.2절) |
| 이전은 "데모의 이벤트 17종" | 커맨드가 17종이고, 이벤트는 Lua 에 31개다. 이 단계는 항구 마을과 여관의 22개를 옮긴다 (7절) |
| 데이터베이스 패널 | 넣지 않는다 (6절) |

## 결정 요약

| 질문 | 결정 | 절 |
|---|---|---|
| 커맨드 명세를 누가 아는가 | `resources/schema/event-commands.json` 한 장을 손으로 유지하고, 엔진 Lua 테스트가 `commands.lua` 와 양방향으로 대조한다. 생성기는 두지 않는다 (12 문서 3.1 그대로) | 1 |
| 게임마다 다른 것(맵 등록, 아이템 표, 실행 환경 변수) | `resources/data/rpg-game.json` 으로 가른다. 대조 상대가 다르다 (프레임워크 대 rpgdemo). rpgdemo 의 `MAPS` 표는 이 파일에서 만든다 (한 벌) | 1.3 |
| 외형과 얼굴의 RTP 문제 | JSON 에는 **논리 이름** `{ "set": "npc", "index": 6 }` 을 적는다. 후보 목록은 스키마의 `assets` 에 있고 `assets.lua` 가 풀며, 테스트가 두 목록을 대조한다. `{ "file", "index" }` 도 계속 된다 | 1.1 |
| 이벤트는 에디터 어디에 사는가 | 맵 뷰의 **이벤트 레이어**. `packages/ext-rpg` 가 타일맵 확장이 여는 자리에 붙인다. 코어와 앱에는 RPG 낱말이 들어가지 않는다 | 2 |
| 레이어가 붙는 맵 | `rpg-game.json` 에 `file` 이나 `alt` 로 등록된 맵만. 알데바란 맵과 `sample.json` 에는 레이어가 없다. `alt` 가 있는 맵(마을, 오두막)은 읽기 전용 | 2.2 |
| 스키마가 늦게 오거나 바뀔 때 | 레이어를 다시 붙이고(`refreshLayer`), 붙은 상태는 잠금과 문제를 다시 계산한다 (E3 `schemaStore` 와 같은 정책) | 2.2 |
| 되돌리기 | 타일과 같은 `MapDocument.undo` 하나 | 3 |
| 검증 경로 표기 | 엔진과 같은 1부터 세는 Lua 표기 `events[3].commands[2].branches[1][3]`. 검사 목록과 경로 꼴을 표로 못 박고, 두 저장소가 같은 픽스처로 같은 경로 집합을 내는지 대조한다 | 1.5 |
| 틀린 이벤트를 만난 엔진 | 맵 파일의 그 이벤트만 건너뛰고 문제마다 `rpg:error` 줄을 찍는다. 맵은 나머지로 열린다 | 1.5 |
| auto 가 여럿인 맵 | 엔진이 병합 순서대로 **전부** 하나씩 돌린다 (지금은 첫 하나만) | 5.1 |
| 데이터베이스 | 패널은 나중. 아이템 표만 JSON 으로 옮겨 아이템 칸이 목록에서 고르고 없는 id 를 경고한다 | 6 |
| 이전 | 항구 마을과 여관을 옮긴다. 마을과 오두막은 RTP 쌍둥이 맵이라 Lua 에 남긴다 | 7 |
| 교차 검증 | 에디터 모델의 명령으로만 이벤트를 만들어 저장하고, 진짜 엔진을 헤드리스로 띄워 그 이벤트의 대사와 플레이어가 선 자리가 stdout 에 나오는지 본다 (`yarn test:engine-events`). 모델이 생기는 마일스톤 2 끝부터 돈다 | 5 |
| 계약의 정본 | 엔진 `docs/plans/m2-rpg-events.md`. 커맨드 인자 목록은 `event-commands.json` 자체 | 머리말 |

## 1. 데이터 계약 (요약, 정본은 M2 문서)

이 문서 본문의 1.1 ~ 1.6 참조는 M2 문서의 해당 절을 가리킨다: 1.1 스키마는 M2 2.2, 1.2 인자 타입은 2.3, 1.3 게임 설정은 2.4, 1.4 키 순서는 2.6,
1.5 검증 경로와 검사 목록은 3절, 1.6 엔진의 대조 테스트는 4절. 5.1 은 M2 5절, 7 은 M2 6절이다.

- `resources/schema/event-commands.json`: 커맨드 17종(인자의 이름, 순서, 타입, 필수, 범위, `values`, `ref`), 조건 셋(`item`, `flag`, `var`, 판정 순서),
  이벤트 칸과 예약 id(`player`), 자산 이름(`assets`: 외형과 얼굴의 논리 이름 `{ "set", "index" }`), 시트 규격(`sheets`, `standPattern`), 이동 루트의 걸음,
  state 의 예약 이름(`state.reserved`: 깃발과 변수로 쓸 수 없는 `items`). 엔진 테스트가 `commands.lua` 의 인자 명세 표와 양방향으로 대조한다
- `resources/data/rpg-game.json`: 맵 등록(`name`, `file`, `alt`, `def`), 아이템 표 경로, 여기서 실행 변수(`play.env`, `play.probe`). 게임이 이 파일로 맵 목록을 만든다
- `resources/data/items.json`: 아이템 표 (`id`, `name`, `desc`, `order`)
- 키 순서와 저장 형식은 맵 고정 형식(`tools/mapfile.py`, 에디터 `serializeMap`)과 같은 규칙이고, 이벤트 안의 키 순서는 M2 문서 2.6절
- 검증 경로는 엔진처럼 1부터 세는 Lua 표기 `events[3].commands[2].branches[1][3]` 이다. 검사 목록 전부(JSON 의 `null` 칸, 배열 자리의 객체와 빈 `{}` 규칙, 인자 타입과 범위, 예약 이름)는
  M2 문서 3절의 표이고, 두 저장소가 같은 픽스처 `tests/fixtures/events/invalid_events.json` 과 `.paths.json` 으로 같은 경로 집합을 내는지 대조한다 (에디터는 `yarn sync:rpg` 로 복사한다)

## 2. 에디터 안의 자리: 확장 API

이벤트는 **맵 뷰의 한 레이어**다. 레이어 패널에 "이벤트" 줄이 오브젝트 줄 위에 생기고, 그 줄을 대상으로 고르면 이벤트 도구(N)가 된다.
이 레이어와 그 인스펙터와 목록 패널은 전부 `packages/ext-rpg` 가 가진다. 코어는 RPG 를 모르고, 타일맵 확장은 "다른 확장이 맵에 레이어를 붙이는 자리"만 연다.

### 2.1 코어에 더하는 것 (`packages/core/src/extensions.ts`)

장르와 무관한 배관 두 가지다.

| 더하는 것 | 모양 | 왜 |
|---|---|---|
| 확장의 내보내기 | `activate(api)` 가 값을 돌려주면 호스트가 `exports` 로 들고, `api.exportsOf<T>(id)` 가 그 값을 준다. `dependsOn` 에 적은 확장만 (아니면 오류) | ext-rpg 가 타일맵 확장의 자리에 붙으려면 둘이 말할 길이 필요하다. VS Code 의 `getExtension(id).exports` 와 같은 방식 |
| 작업 공간 | `api.workspace`: `backend()`, `project`(열린 프로젝트, `onOpened`, `onClosed`, 파일 변경), `documents`, `log`, `toasts` 의 읽기 전용 손잡이. 앱이 `ExtensionHostDeps` 로 넘긴다 | 확장이 `resources/schema/event-commands.json` 을 읽고 그 파일이 바뀌면 다시 읽어야 한다. 지금은 E3 의 스키마 저장소도 앱에 있어 확장이 파일을 볼 길이 없다 |

그리고 앱 쪽 한 가지: **`registerPanel` 로 등록한 패널이 제 도킹 탭이 된다.** `PanelSpec` 에 `presets?: string[]`(어느 레이아웃 프리셋에 넣을지)을 더하고,
`layoutPresets.ts` 의 `PanelId` 를 `ext:<id>` 까지 넓히고, 창 메뉴에 이름이 뜨고, 레이아웃 저장이 그 id 를 기억한다 (확장이 없으면 건너뛴다).
지금처럼 "확장 패널" 한 탭에 쌓는 방식은 목록 패널 하나만 더해도 못 쓴다.

### 2.2 타일맵 확장이 여는 자리 (`packages/ext-tilemap/src/contrib.ts`, 새 파일)

`tilemapExtension.activate` 가 `TilemapApi` 를 돌려준다. 타입은 DOM 을 모르게 두고 UI 는 코어처럼 `unknown` 으로 적는다 (앱이 좁혀 쓴다).

```ts
export interface TilemapApi {
  registerMapLayer(spec: MapLayerSpec): () => void;
  registerPlayProvider(spec: PlayProviderSpec): () => void;
  /** 열린 맵 문서마다: 상태가 없으면 attach 를 다시 부르고, 있으면 state.refresh() */
  refreshLayer(id: string): void;
  readonly layers: ReadonlyMap<string, MapLayerSpec>;      // 관찰 가능
  readonly playProviders: readonly PlayProviderSpec[];
}

export interface MapLayerSpec {
  id: string;                 // "rpg.events"
  label: string;              // "이벤트"
  section: string;            // 이 레이어가 읽고 쓰는 맵 파일의 최상위 키: "events"
  order?: number;             // 그리는 순서 (오브젝트 위)
  toolKey?: string;           // "N"
  /** 문서가 열릴 때, 그리고 refreshLayer 때 (상태가 아직 없는 문서만). 이 맵에 붙지 않으면 null */
  attach(doc: MapDocument): MapLayerState | null;
  /** attach 가 null 일 때 레이어 패널 아래에 옅게 보일 한 줄. undefined 면 아무것도 안 보인다 */
  hint?(doc: MapDocument): string | undefined;
  createView?: (ctx: unknown) => unknown;   // PIXI 뷰. 앱의 MapRenderer 가 붙인다
  createTool?: (ctx: unknown) => unknown;   // 대상이 이 레이어일 때의 포인터와 키 (Ctrl 조합 포함)
  Inspector?: unknown;                      // 대상이 이 레이어일 때 인스펙터 자리
}

export interface MapLayerState {
  readonly locked: string | null;           // 편집을 막는 이유 (스키마 버전, RTP 쌍둥이 맵 등). 관찰 가능
  serialize(): unknown;                     // 저장할 값. undefined 면 키를 쓰지 않는다
  problems(): ObjectProblem[];              // 문제 목록. severity error 는 저장 전에 묻는다
  reset(raw: unknown): void;                // 파일을 다시 읽었다
  /** 스키마나 게임 설정이 바뀌었다. 데이터는 그대로 두고 locked 와 problems 를 다시 계산한다 */
  refresh(): void;
  dispose(): void;
}

export interface PlayProviderSpec {
  id: string;
  priority: number;                         // 높은 것부터 묻는다. 기본 제공자(map-objects.json)는 0
  applies(doc: MapDocument): boolean;
  hint?(doc: MapDocument): string | undefined;
  plan(doc: MapDocument, ctx: { cursor: Point | null; viewCenter: Point | null }): PlayPlan | null;
}

export interface PlayPlan {
  env: Record<string, string>;              // 러너의 기본 변수 뒤에 덧씌운다
  at: Point | null;                         // 로그와 상태 바에 보일 위치 (칸이든 픽셀이든 제공자가 정한다)
  note?: string;                            // "이벤트 captain 앞" 같은 설명
}
```

**붙는 때와 다시 붙는 때.** 이벤트 레이어는 스키마 둘(`event-commands.json`, `rpg-game.json`)이 있어야 붙는데, ext-rpg 는 프로젝트가 열린 뒤 그 파일들을 **비동기로** 읽는다.
그래서 맵 문서가 스키마보다 먼저 열릴 수 있다 (프로젝트를 열자마자 맵을 열거나, 레이아웃이 문서 탭을 되살리는 경우). 스키마 파일이 나중에 생기거나 지워지거나 버전이 바뀌는 경우도 같다.
E3 의 `schemaStore` 가 열린 문서와 새로 열리는 문서에 `setSchema` 를 넣어 푼 문제이고, 레이어 자리는 그것을 일반형으로 푼다.

- 문서가 열릴 때 `attach`. null 이면 상태 없이 두고 `hint` 를 보인다
- ext-rpg 는 두 스키마 중 하나라도 읽기가 끝나거나 바뀌면 `refreshLayer("rpg.events")` 를 부른다. 상태가 없던 문서는 `attach` 를 다시 받고, 상태가 있는 문서는 `refresh()` 로 잠금과 문제를 다시 계산한다
- **이미 붙은 상태는 떼지 않는다.** 스키마가 지워졌거나 맵이 `rpg-game.json` 에서 빠졌으면 레이어를 없애지 않고 `locked` 에 이유를 둔다. 편집 중인 값은 되돌리기 스택과 함께 남고 저장하면 그대로 쓰인다 (모르는 것을 지우지 않는다는 E3 규칙)
- 단위 테스트(ext-tilemap `contrib.test.ts`, ext-rpg `layer.test.ts`): "문서가 먼저 열리고 스키마가 나중에 온다"(레이어가 생긴다), "스키마 버전이 바뀐다"(잠긴다), "스키마 파일이 지워진다"(편집 값을 잃지 않고 잠긴다), "등록되지 않은 맵"(null 과 hint)

**어느 맵에 붙는가.** ext-rpg 의 `attach` 는 `game.ts` 의 `mapEntryFor(doc.path)` 를 부른다 (실행 제공자의 `applies` 와 같은 함수, 1.3).

| 맵 | 결과 |
|---|---|
| `rpg-game.json` 의 `file` 이고 `alt` 가 없다 (항구 마을, 여관) | 편집할 수 있는 레이어 |
| `alt` 가 있는 항목의 `file` 이나 `alt` (마을, 오두막 네 파일) | 읽기 전용 레이어. `locked` = "RTP 판과 기본 판 두 파일이라 이벤트를 두 벌 둬야 한다. 이전 전에는 Lua 정의 파일에서 고친다" |
| 등록되지 않은 맵 (알데바란 둘, `sample.json`, 메모리 샘플의 `meadow.json`) | null. 스키마가 있는 프로젝트면 `hint` 가 "이벤트 레이어는 rpg-game.json 에 등록된 맵에만 있다" |
| 스키마가 없는 프로젝트 (플래피) | null, `hint` 도 없다 |

맵 모델과 문서에 더하는 것:

- `MapModel.rawSection(key)`: `events` 나 `extra[key]` 의 원본 (읽기 전용 사본). `format.ts` 에서 `events` 는 **고정 형식의 키 순서 자리만** 지키고 해석하지 않는다 (주석을 "섹션: 확장이 맡는다"로)
- `MapDocument.layerStates`: 열 때 등록된 레이어마다 `attach`, 그리고 `refreshLayer` 가 채우거나 새로 고친다. `text()` 는 상태가 있는 섹션을 `serialize()` 값으로 바꿔 쓴다. 다시 읽기(`reload`, "reset" 이벤트)는 `reset(raw)`
- `MapTarget` 에 `{ kind: "ext"; id: string }`, `MapTool` 에 `"ext"`
- `problems` 가 레이어의 문제까지 합친다
- 기본 실행 제공자: 지금의 `map-objects.json` `play` 에 선택 칸 `maps`(맵 파일 이름 글롭, 예: `["aldebaran_*"]`)를 더한다. 없으면 지금처럼 모든 맵. 알데바란 스키마에는 `["aldebaran_*"]` 를 적는다 (엔진 M2)

### 2.3 앱이 하는 일 (`packages/app`)

| 파일 | 할 것 |
|---|---|
| `editor/Editor.ts` | `activateAll([tilemapExtension, rpgExtension])`, `workspace` 손잡이를 호스트에 넘긴다 |
| `editor/maps/MapRenderer.ts` | 레이어마다 `createView` 결과를 `objectsG` 와 `labelRoot` 위 컨테이너에 순서대로 붙이고, 변환(줌, 팬)과 테마와 `textures.load` 를 컨텍스트로 준다 |
| `editor/maps/mapTools.ts` | 대상이 `ext` 면 포인터와 키를 그 레이어의 도구에 넘긴다 (월드 좌표와 칸 좌표 둘 다). 키는 지금의 `if (k.mod \|\| k.alt ...) return false` **앞에서** 넘겨 Ctrl+C, Ctrl+V, Ctrl+D 도 레이어 도구가 받는다. 도구가 처리하면 `MapRenderer.onKeyDown` 이 전파를 막으므로 전역 `edit.*`(씬 전용)에 닿지 않는다 |
| `editor/maps/mapCommands.ts` | 레이어의 `toolKey` 를 도구 단축키로 |
| `components/maps/LayersPanel.tsx` | 상태가 있는 레이어마다 줄(눈, 대상 고르기). 상태가 잠겨 있으면 자물쇠와 이유. 상태가 없는 레이어는 줄 대신 `hint` 를 패널 아래 한 줄로 |
| `components/maps/MapObjectInspector.tsx` | 대상이 `ext` 면 그 레이어의 `Inspector` 를 그린다 |
| `editor/maps/objectTools/playHere.ts`, `rules.ts` | 제공자를 `priority` 순으로 물어 첫 `applies` 의 `plan` 으로 실행한다 |
| `editor/runner/RunnerStore.ts` | 언어 검사를 **덧씌운 뒤의** `INITIAL2D_SCRIPT` 로 한다 (엔진 저장소의 로컬 `game.json` 이 mruby 여도 RPG 실행은 Lua 다) |
| 맵 저장 | 레이어 상태에 error 문제가 있으면 목록을 보이고 "그래도 저장"을 묻는다. 에디터가 만든 편집은 애초에 그런 상태를 만들지 않으므로(3절), 이 질문은 밖에서 고친 파일에서만 나온다 |
| `editor/layoutPresets.ts`, `layout.ts`, `layoutPersistence.ts` | 확장 패널을 제 탭으로 (2.1). 타일맵 프리셋에 "이벤트" 목록 탭 |

폼 위젯 공유: `app/src/editor/scene/fields.tsx` 와 `app/src/editor/maps/objectTools/fieldInputs.tsx` 를 **`packages/ui`**(새 패키지, React 입력 부품)로 옮기고
앱과 ext-rpg 가 함께 쓴다. 타이핑 한 번이 되돌리기 한 단계가 되는 세션 규칙(`newSession`)이 여기에 있어 두 벌로 만들면 어긋난다.
새 패키지 둘(`ui`, `ext-rpg`)은 저장소 배관에 등록해야 돈다: 루트 `package.json` 의 `typecheck`(`tsc -b` 목록), `eslint.config.mjs`(지금 `react-hooks` 규칙은 `packages/app/src/**` 에만 걸려 있어 `packages/ui/src/**` 와 `packages/ext-rpg/src/ui/**` 를 더하고, `packages/ext-rpg/src/model/**` 에는 코어와 같은 DOM, React, PIXI 금지 규칙), 앱의 `package.json` 의존과 워크스페이스 링크(E4 가 `backend-fsaccess` 를 등록한 커밋 `53b74c3` 과 같은 일. 패키지는 `exports` 로 `src` 를 바로 내보낸다). Vitest 의 `include`(`packages/*/src/**/*.test.ts(x)`, `packages/*/test/**/*.test.ts`)와 색 리터럴 검사(`packages` 전체)는 이미 잡는다.

### 2.4 `packages/ext-rpg`

```
packages/ext-rpg/
  package.json                 의존: core, ext-tilemap, ui, mobx. peer: react, mobx-react-lite, pixi.js
  src/index.ts                 rpgExtension { id: "rpg", dependsOn: ["tilemap"] }
  src/model/                   DOM 도 PIXI 도 모른다 (Vitest, node)
    schema.ts                  event-commands.json 해석, 버전 잠금
    game.ts                    rpg-game.json 해석 (맵, 아이템 표 경로, 실행 변수), mapEntryFor(path)
    events.ts                  섹션 해석과 쓰기 (모르는 키 보존, 1.4절의 키 순서)
    tree.ts                    커맨드 경로(목록 이름, 가지 번호, 위치)와 엔진 표기, 걷기, 넣기, 빼기, 옮기기
    commands.ts                되돌릴 수 있는 명령 (3절, 4절)
    validate.ts                엔진과 같은 검사(경로 대조 대상) + 에디터만의 검사
    assets.ts                  논리 이름 → 파일 (후보 중 있는 것), CharSet 정면 프레임과 FaceSet 칸의 사각형, 발 기준 그리기 위치
    refs.ts                    제안 목록 (맵, 아이템, 이 맵의 이벤트, 쓰인 깃발과 변수)
    play.ts                    "앞에 서기" 칸과 가장 가까운 설 수 있는 칸 고르기, 자동 재생 경로, 시작 상태 글, 실행 변수 채우기
  src/ui/                      React 와 PIXI
    EventsLayerView.ts         아이콘, 표식, 선택 테두리, 배회 구역
    eventsTool.ts              놓기, 끌기, 방향키, 그리고 뷰의 키: Delete, Ctrl+C, Ctrl+V, Ctrl+D (전역 커맨드가 아니다)
    EventInspector.tsx         이벤트 칸 폼 + CommandListEditor
    CommandListEditor.tsx      트리 (4절)
    argWidgets/                1.2절의 위젯 (face, charset, options, route, condition, ref, file, json 등)
    EventsPanel.tsx            이 맵의 이벤트 목록, 찾기, 문제 수
  test/fixtures/               엔진에서 복사한 스키마와 맵과 픽스처 (MANIFEST.json 에 엔진 커밋과 sha256)
  test/engine/                 진짜 엔진 교차 검사 (5절, 별도 설정)
```

`activate` 가 하는 일: 타일맵의 `exportsOf` 로 `registerMapLayer(eventsLayer)` 와 `registerPlayProvider(rpgPlay, priority 10)`,
`registerPanel`(이벤트 목록), `registerCommand`(새 이벤트, 이 이벤트 앞에서 실행, 이 이벤트 자동 재생),
`workspace` 로 두 스키마와 아이템 표를 읽고 바뀌면 다시 읽는다 (E3 `schemaStore.ts` 와 같은 정책: 실패는 오류 문구로 남기고 던지지 않는다).
읽기가 끝날 때마다(성공이든 실패든, 파일이 사라졌든) `refreshLayer("rpg.events")` 를 부른다 (2.2).

**복사, 붙여넣기, 복제, 지우기는 커맨드로 등록하지 않는다.** Ctrl+C, Ctrl+V, Ctrl+D, Delete 는 이미 전역 `edit.copy`, `edit.paste`, `edit.duplicate`, `edit.delete`(씬 탭 전용, `sceneCommands.ts`)에 묶여 있어,
같은 단축키로 커맨드를 하나 더 등록하면 `findByKey` 는 등록 순서로 첫 활성 커맨드를 고른다. 활성 조건이 조금만 겹쳐도 엉뚱한 쪽이 돌고,
맵 탭이 활성인 채 인스펙터의 커맨드 트리에서 누른 Ctrl+C 가 커맨드가 아니라 이벤트를 복사하는 일이 생긴다. 그래서 E3 의 오브젝트 Delete 처럼 **레이어 도구의 키 처리**(`eventsTool.keyDown`)가 맵 뷰에 초점이 있을 때 받고,
처리하면 `MapRenderer` 가 전파를 막는다. 커맨드 목록 편집기(4절)의 같은 키는 트리 요소의 keydown 이 받고 전파를 막는다. 메뉴와 우클릭 메뉴의 "복사" 항목은 도구의 같은 함수를 부르는 단축키 없는 항목이다.
클립보드는 확장 안에 따로 둔다 (씬의 `tools.clipboard` 와 섞이지 않는다). 전역 `edit.*` 를 활성 문서에 보내는 일반화는 나중 후보다.

### 2.5 플래피버드 점검

- 코어에 더한 것(내보내기, 작업 공간, 패널 탭)은 어느 장르에도 말이 된다
- 타일맵의 레이어 자리는 플랫포머의 "경로" 레이어나 퍼즐의 "스위치" 레이어도 쓸 수 있다. RPG 낱말이 없다
- 플래피 프로젝트를 열면 ext-rpg 는 활성이지만 `event-commands.json` 이 없어 레이어 줄도 메뉴도 나오지 않는다 (명령의 `enabled` 가 거짓)
- **섞인 프로젝트**(엔진 저장소: 플랫포머 알데바란과 RPG 데모가 함께 있다)에서 `aldebaran_forest.json` 을 열면 이벤트 줄도 N 도구도 없다. 알데바란 씬은 `events` 를 읽지 않으므로, 거기에 놓은 이벤트는 조용히 아무것도 하지 않았을 것이다. `rpg-game.json` 에 등록된 맵에만 붙는 규칙(2.2)이 이것을 막는다. e2e 와 단위 테스트가 확인한다: 스키마가 있는 프로젝트에서 등록되지 않은 맵을 열면 이벤트 줄이 없고 힌트 한 줄만 있다

## 3. 이벤트 놓기

맵 뷰에서 레이어 대상을 "이벤트"로 고르거나 N 을 누른다. 레이어가 잠겨 있으면(스키마 버전, RTP 쌍둥이 맵) 고르고 보는 것만 되고 아래 편집 동작은 도구가 이유를 띄우며 거절한다.

| 동작 | 결과 |
|---|---|
| 빈 칸 더블클릭 | 새 이벤트: id 는 `event_1` 꼴의 겹치지 않는 이름, `trigger` action, 외형 없음, 커맨드 없음. 선택되고 인스펙터의 id 칸에 초점 |
| 클릭 | 고르기 (Shift 는 더하고 빼기). 빈 곳 끌기는 상자 선택 |
| 끌기 | 칸 단위로 옮기기. 한 번의 끌기가 되돌리기 한 단계. 놓을 수 없는 칸이면 미리보기가 `--danger` 이고 놓아도 제자리. 배회 구역이 있는 이벤트는 **구역도 같은 만큼 함께 옮긴다** (같은 명령). Alt 를 누르고 끌면 구역은 두고 이벤트만 |
| 방향키 | 한 칸 옮기기 (구역 규칙은 끌기와 같다) |
| Delete | 지우기 (레이어 도구가 받는다, 2.4) |
| Ctrl+C, Ctrl+V, Ctrl+D | 복사, 붙여넣기, 복제. 확장의 클립보드에 이벤트 JSON 을 둔다. 붙이면 커서 칸에, id 는 겹치지 않게. 레이어 도구가 받고 전파를 막으므로 씬의 `edit.copy` 는 돌지 않는다 |
| Enter | 커맨드 편집기의 첫 줄로 초점 |

그리기 (`EventsLayerView.ts`):

- 외형이 있으면 **CharSet 의 정면 서기 프레임**(`dirRows.down` 행, `standPattern` 열). 이벤트의 `dir` 이 있으면 그 방향 행. 자리는 게임과 같은 규칙이다: 가로는 칸 가운데, 발이 칸 아래 변 (`character.lua` 의 `pixelPos`, 24x32 프레임이 윗 칸으로 올라간다)
- 논리 이름은 스키마 `assets` 의 후보 중 **프로젝트에 있는 첫 파일**로 푼다 (엔진 `Assets.pick` 과 같은 규칙). 그래서 RTP 가 있는 기계에서는 RTP 그림이 보인다
- 외형이 없으면 칸 크기의 표식과 트리거 글자 (말, 밟, 자, 병). 색은 테마 토큰(`--accent`, `--warning`, `--success`, `--fg-muted`)
- 고른 이벤트는 테두리, 배회가 있으면 구역 사각형을 옅게 그리고 가장자리를 끌어 고친다 (구역도 되돌리기 한 단계)
- 레이어 눈을 끄면 숨고, 대상이 다른 레이어면 반투명

인스펙터 (`EventInspector.tsx`): 스키마 `event.fields` 로 폼을 만든다. id 를 바꾸면 이 맵의 `moveRoute.target`, `turn.target` 도 함께 바꾼다
(명령 하나, 되돌리기 한 단계). 외형 칸은 논리 이름(고르기)과 파일(프로젝트 파일 고르기) 둘 중 하나이고 8명 격자를 눌러 번호를 고른다.

막는 것 (편집 명령이 거절하고 도구가 알린다. 그래서 에디터는 이런 파일을 만들지 않는다):

- 1.5절 표의 모든 검사 (엔진이 같은 것을 오류로 보고 그 이벤트를 건너뛴다). 위젯이 애초에 범위 밖 값을 만들지 않는다: 외형 번호는 8명 격자, 얼굴 번호는 16칸 격자, 방향과 트리거는 고르기다. 밖에서 고친 파일의 틀린 값(외형 번호 9, 모르는 방향 등)은 **오류**로 보이고 저장 전에 묻는다 (엔진이 그 이벤트를 건너뛰는 값이고, 몇몇은 지금 엔진에서 게임을 멈추는 값이라 경고가 아니다)
- id 가 비었거나, 이 맵에서 겹치거나, `player`(예약)다
- 맵 밖 칸
- action 이벤트 둘이 같은 칸, touch 이벤트 둘이 같은 칸 (엔진의 `Manager:at` 은 먼저 등록된 하나만 집는다). auto 와 parallel 은 칸과 상관없이 돌므로 겹쳐도 된다
- 읽기 전용 레이어(RTP 쌍둥이 맵, 모르는 스키마 버전)의 모든 편집

경고 (저장은 된다):

- touch 이벤트가 막힌 칸(통행 1)에 있다 (밟을 수 없다)
- 배회 구역이 맵 밖, 또는 이벤트가 **제 배회 구역 밖**에 있다 (엔진의 배회는 구역 안의 칸으로만 걸으므로 구역 밖의 NPC 는 거의 움직이지 못한다). 외형 없이 배회가 있다 (`spawnEvent` 는 외형이 있을 때만 배회를 건다)
- 정의 파일(`rpg-game.json` 의 `def`)에 같은 id 가 있다: "게임에서는 Lua 정의가 이긴다". 정의 파일을 글로 읽어 `id = "..."` 꼴만 찾는 어림이며, 확실한 확인은 실행할 때 엔진이 찍는 `rpg:override:<id>` 줄이다

정보 (표식 없이 인스펙터에만):

- auto 이벤트: "맵에 들어올 때 병합 순서대로 하나씩 돈다. 이 맵의 auto 중 N번째". 엔진이 지금은 첫 auto 하나만 돌리므로 M2 가 전부 돌게 고친다 (5.1). 그 전의 엔진으로는 두 번째부터 돌지 않는다

RTP 쌍둥이 맵(마을, 오두막): `rpg-game.json` 의 항목에 `alt` 가 있으면 레이어가 읽기 전용이다 (2.2). `Assets.mapPath` 가 RTP 칩셋이 있는 기계에서는 `_rtp.json` 을, 없는 기계와 CI(`INITIAL2D_NO_RTP=1`)에서는 기본 판을 열기 때문에,
한 파일에만 더한 이벤트는 저자의 기계나 CI 중 한쪽에서 사라진다. 두 파일에 한 명령으로 쓰는 길도 있지만 이 단계는 이벤트를 Lua 에 남기므로(7절) 편집할 일이 없다. 두 파일 쓰기는 "마을과 오두막의 이전" 후보와 함께 한다.

## 4. 커맨드 목록 편집기

인스펙터의 아래 절반이다. 12 문서 마일스톤 3 을 스키마 기반으로 만든다.

- **트리.** 한 줄이 커맨드 하나이고 스키마의 `summary`(없으면 label 과 첫 필수 인자)로 요약한다. 하위 목록은 들여 쓴 머리줄로 보인다: `if` 는 "참이면", "아니면", `choice` 는 "1. 떠난다", "2. 더 둘러본다". 머리줄을 접을 수 있다
- **편집.** 줄을 고르면 그 아래에 인자 폼이 펼쳐진다 (1.2절 위젯). 추가는 스키마 `group` 으로 묶은 팔레트(찾기 입력 포함). 위에 넣기, 아래에 넣기, 지우기, 위로, 아래로, 복사와 붙여넣기(여러 줄, JSON), 하위 목록 안으로 넣기
- **키보드.** 위아래로 줄 이동, Enter 로 폼, Delete, Ctrl+위아래로 옮기기, Ctrl+C/V, Insert 로 팔레트. 이 키들은 트리 요소의 keydown 이 받고 전파를 막는다 (전역 `edit.*` 와 맵 뷰의 이벤트 복사에 닿지 않는다, 2.4)
- **항목과 가지.** `choice` 의 항목을 더하면 빈 가지가 생기고, 빼면 그 가지도 빠진다 (가지에 커맨드가 있으면 묻는다). `cancel` 은 번호를 따라간다
- **맵 이동의 대상 고르기.** `transfer` 폼의 "맵에서 고르기"가 대상 맵(`rpg-game.json` 의 `file`)을 탭으로 열고 "칸을 누르면 이동 대상이 된다 (Esc 취소)" 띠를 띄운다. 칸을 누르면 원래 맵으로 돌아와 x, y 를 한 명령으로 넣는다 (원래 맵의 되돌리기 스택). "대상 보기"는 그 칸으로 뷰를 옮긴다
- **문제 표시.** 줄 옆에 표식, 인스펙터 머리에 문제 수, 누르면 그 줄로. 위치는 1.5절 표기
- **되돌리기.** 모든 편집이 `doc.apply` 로 맵 문서의 스택에 들어간다. 타이핑은 초점 한 번이 한 단계 (합치기 키). 명령은 이벤트 하나의 `commands` 전후를 통째로 들고 있어도 된다 (가장 긴 여관 주인이 커맨드 30개 안팎)

커맨드 검사는 두 무리다.

- **엔진과 같은 검사** (오류, 1.5절 표의 커맨드 줄): 모르는 `code`, 필수 인자와 타입, `choice` 항목 0개, 얼굴의 모양과 번호, `transfer.dir` 과 `turn.dir`. 엔진과 같은 경로를 내고 1.5절 픽스처로 대조한다
- **에디터만의 검사** (경고, 픽스처 밖):
  - `cancel` 이 항목 번호 밖, `ends` 뒤의 커맨드
  - 없는 참조: 아이템 표에 없는 id, 등록되지 않은 맵, 이 맵에 없는 이벤트 id
  - `moveRoute.target`, `turn.target` 이 **외형 없는 이벤트**를 가리킨다. 엔진의 `Interp:resolve` 가 nil 을 받아 아무것도 하지 않는다
  - **비어 있는 조건**: `cond` 에 `item`, `flag`, `var` 가 하나도 없다. `Commands.test` 가 늘 참을 돌려 `elseDo` 가 영영 돌지 않는다
  - 키가 둘 이상인 조건 (앞의 것만 본다, 1.1)
  - `transfer` 에 `x` 와 `y` 중 하나만 있다 (다른 하나는 정의 파일의 시작 값을 쓴다)
- **정보**: `script` 커맨드 ("엔진만 이름을 확인할 수 있다". 정의 파일의 `scripts` 표를 볼 수 없어서다)

## 5. 여기서 실행과 자동 재생, 그리고 교차 검사

### 5.1 엔진 쪽 장치 (요약, 정본은 M2 문서 5절)

- 환경 변수: `INITIAL2D_RPG_AT=x,y,dir`(그 칸에 그 방향으로 선다), `INITIAL2D_RPG_STATE`(쉼표 목록의 깃발, 변수, `item:<id>=<수>`),
  `INITIAL2D_RPG_ROUTE`(한 번만 걷는 입력, 끝나면 `rpg:route:done` 을 찍고 스스로 끝난다), `INITIAL2D_RPG_TRACE`(아래 줄들)
- trace 줄: `rpg:map:<맵> events:<수> skipped:<수>`, `rpg:player:<맵>,<x>,<y>,<방향>`(맵을 열 때마다), `rpg:event:<id>`, `rpg:message:<이름>|<글>`,
  `rpg:choice:`, `rpg:transfer:`, `rpg:override:<id>`. 오류는 늘 한 줄 `rpg:error:<자리>: <이유>` 이고 맵 파일의 틀린 이벤트만 건너뛴다
- auto 이벤트는 병합 순서대로 전부 돌고 그 사이에도 조작이 잠긴다

### 5.2 에디터의 실행 명령

| 명령 | 위치와 방향 | 더하는 변수 |
|---|---|---|
| 여기서 실행 (Ctrl+F5, 맵 탭) | 고른 이벤트가 있으면 그 앞, 없으면 커서 칸, 없으면 뷰 가운데. 커서와 뷰 가운데는 **가장 가까운 설 수 있는 칸**으로 옮기고 아래를 본다 | `play.env` |
| 이 이벤트 앞에서 실행 (이벤트 우클릭, 목록) | 이벤트 앞 칸 | `play.env` |
| 이 이벤트 자동 재생 | 이벤트 앞 칸. action 은 경로 `talk`, touch 는 이벤트 쪽으로 한 걸음, auto 는 위치 없이 빈 경로 (맵에 들어올 때 auto 가 병합 순서대로 돌고 끝나면 `rpg:route:done`, 5.1). parallel 은 끄고 이유를 띄운다 ("parallel 은 끝나지 않는다"). auto 가 전부 도는 것은 M2 의 엔진 고치기에 기댄다 (에디터 작업보다 먼저 들어간다, 의존 관계) | `play.env` + `play.probe` |

- **"앞 칸"** 은 `play.ts` 가 고른다: 외형이 있고 `dir` 이 있으면 그 이벤트가 바라보는 칸, 아니면 아래, 왼쪽, 오른쪽, 위 순서로
  맵 안이고 통행 0 이고 막는 이벤트가 없는 첫 칸. 플레이어는 이벤트 쪽을 본다. 네 칸이 다 막혔으면 아래의 "가장 가까운 칸" 규칙으로 넘어간다
- **"가장 가까운 설 수 있는 칸"**: 같은 조건(맵 안, 통행 0, 막는 이벤트 없음)을 만족하는 칸을 시작 칸에서 넓이 우선으로 찾는다 (맨해튼 거리, 같은 거리면 아래, 왼쪽, 오른쪽, 위 순서). 옮겼으면 상태 띠에 "15,40 → 15,41 (막힌 칸이라 옮겼다)" 를 남긴다. 앞 칸 고르기와 같은 함수다
- **시작 상태.** 실행은 늘 새 게임이라, 항구 마을에서는 `arrival` 의 선장 인사가 먼저 나오고 깃발이나 아이템에 따라 갈리는 대사(데모 대사의 대부분)에 닿지 못한다.
  그래서 이벤트 목록 패널 머리에 **"시작 상태"** 한 줄 입력을 둔다 (`INITIAL2D_RPG_STATE` 꼴, 예: `arrived,heardWarehouse,item:warehouse_key=1`). 맵마다 기억하고(`.initial-editor/rpg-play.json`), 세 실행 명령이 모두 `{state}` 로 넘긴다.
  입력 칸 옆의 제안 목록은 refs.ts 의 깃발, 변수, 아이템이다. 비우면 변수를 넘기지 않는다
- 자동 재생은 대화를 700ms 마다 넘기고 선택지는 첫 항목을 고른다 (데모의 자동 시연 규칙 그대로). 콘솔에 대사 줄이 남아, 걸어가지 않고 대사와 분기를 읽어 볼 수 있다. 다른 항목의 가지는 시작 상태와 손으로 하는 실행으로 본다
- 프로세스 실행과 내장 실행(E4, 웹판 포함) 모두 같은 변수다. 내장 실행은 Lua 만 돌지만 RPG 는 Lua 라 막히지 않는다. 환경 변수를 만드는 함수(`planEnv`, `probeEnv`)는 모델(`play.ts`)에 있어 교차 검사(5.3)가 그대로 부른다

### 5.3 교차 검사: `yarn test:engine-events`

`packages/ext-rpg/test/engine/events.engine.test.ts` 를 별도 설정(`vitest.engine.config.ts`, 브리지 적합성 테스트와 같은 방식)으로 돈다.
루트 `vitest.config.ts` 의 `include` 가 `packages/*/test/**/*.test.ts` 를 잡으므로 `exclude` 에 `packages/ext-rpg/test/engine/**` 를 더한다.
**마일스톤 2 끝에 들어간다** (엔진 M2 계약과 이벤트 모델만 있으면 된다). 그래야 마일스톤 3 ~ 6 의 자율 검증 루프가 내내 진짜 엔진으로 확인한다.

**건너뛰기와 기능 확인.** E2 의 `test:engine-scene` 처럼 건너뛸 때는 종료 코드 0 이지만, 이유를 `SKIP: <이유>` 한 줄로 분명히 찍는다.

- 엔진 실행 파일이 없다 (`INITIAL2D_DIR` 또는 형제 저장소의 `build/Initial2D`): `SKIP: 엔진 실행 파일이 없다 ...`
- `--features` 에 `lua` 가 없다: `SKIP: ...`
- 엔진이 M2 전이다: 엔진 저장소에 `resources/schema/event-commands.json` 이 없거나 `scripts/lua/games/rpgdemo/game.lua` 에 `INITIAL2D_RPG_TRACE` 가 없으면 `SKIP: 엔진이 M2(RPG 이벤트 계약) 전이다. Initial2D 의 74febb4 이후가 필요하다`. 옛 엔진으로 돌려 알아보기 힘든 실패를 내지 않는다. 병합 커밋(`74febb4`, 엔진 PR #49)은 스크립트와 README 에 적었다
- **완료 기준은 건너뛰지 않은 실행 기록을 요구한다**: 통과한 검사 수와 엔진 커밋이 찍힌 로그를 이 문서의 구현 노트에 남긴다

1. 임시 작업 폴더: 엔진의 `scripts/` 를 복사하고 `resources/` 는 하위 폴더마다 심링크, 단 `resources/maps/` 는 복사한다 (엔진 저장소를 건드리지 않는다)
2. 그 폴더의 `port_town.json` 을 연다. 마일스톤 2 에서는 모델만으로(ext-tilemap `format.ts` 로 읽고, ext-rpg `events.ts` 로 섹션을 풀고, 되돌아갈 때 `serializeMap`), 마일스톤 4 에서 **앱과 같은 길**(`MapDocument` + `eventsLayer.attach(doc)`, 저장은 `doc.text()`)로 바꾼다
3. **ext-rpg 모델의 명령만으로** 이벤트를 만든다 (UI 가 부르는 것과 같은 팩토리): 플레이어 시작 근처의 놓을 수 있는 칸에 `e2e_sign`, action, 외형 `{ set: "npc", index: 2 }`, 커맨드는
   `message`(이름, 얼굴, 줄바꿈과 따옴표가 든 한글 대사) → `giveItem shell` → `if item shell` 참이면 `message "A"` 아니면 `message "B"` →
   `choice ["예", "아니요"]` 의 1번 가지에 `setFlag e2e` → `if flag e2e` 참이면 `message "C"`. 검사에 문제가 없고, 저장한다
4. 자동 재생과 **같은 함수**(`probeEnv`)로 변수를 만들고 `INITIAL2D_NO_RTP=1`, `SDL_VIDEODRIVER=dummy`, 넉넉한 `INITIAL2D_EXIT_AFTER`(안전장치)를 더해 엔진을 **프로세스로** 띄운다. 이것이 에디터의 프로세스 모드가 넘기는 것과 같은 변수다 (Playwright 는 프로세스 모드를 볼 수 없다, "지금 어디까지")
5. 본다: 종료 코드 0, `rpg:error` 없음, `rpg:player:port_town,<x>,<y>,<dir>` 가 `play.ts` 가 고른 앞 칸과 이벤트 쪽 방향과 같다, `rpg:event:e2e_sign`, 대사 줄이 순서대로(첫 대사, A, C), `rpg:route:done`
6. 두 번째 판: touch 이벤트에 `playSe` 와 `transfer inn 10,12,up` 을 적는다. `rpg:transfer:inn,10,12,up`, `rpg:map:inn`, 그리고 **`rpg:player:inn,10,12,up`** 을 본다. 방향이 정말 적용되었는지(문제 2)는 마지막 줄만 증명한다. `rpg:transfer:` 줄은 커맨드 인자의 되풀이다
7. 세 번째 판: auto 이벤트 `e2e_auto`(`message "D"`)를 더하고 빈 경로로 띄운다. `rpg:event:arrival` 뒤에 `rpg:event:e2e_auto` 와 `rpg:message:|D` 가 나오고 `rpg:route:done` 으로 끝나는지 본다 (문제 6)
8. 네 번째 판: 시작 상태 `arrived` 로 첫 판을 되풀이해 선장 인사(`rpg:message:선장|`)가 **없는지** 본다 (`INITIAL2D_RPG_STATE`)

엔진 저장소에도 같은 장치의 테스트를 둔다 (`tests/run_engine_tests.py` 의 `test_rpg_play_here`): 맵 파일의 `crates`(14,40) 옆 15,40 에 왼쪽을 보고 세우고 (아래와 왼쪽 칸은 막혀 있다. 5.2절의 앞 칸 순서가 고르는 칸이다) `talk` 한 번으로 `rpg:message:누군가의 짐이다.` 를 본다.
`rpg:player:port_town,15,40,left` 도 보고, `INITIAL2D_RPG_STATE=arrived` 를 준 판에서는 `rpg:message:선장|` 이 없는 것을 본다. 이 테스트는 테스트 씬이 아니라 **진짜 허브 `scripts/lua/main.lua`** 로 띄워야 하므로(`INITIAL2D_SCENE=rpg`), `main.lua` 를 지우는 `make_workdir` 대신 `scripts/` 를 그대로 복사하는 작업 폴더 함수(`make_game_workdir`)를 더한다.
에디터 없이도 장치가 맞는지 엔진이 먼저 보장한다.

## 6. 데이터베이스

엔진 RPG 레이어가 실제로 가진 "데이터베이스"성 데이터를 세었다.

| 데이터 | 있는가 | 어디 |
|---|---|---|
| 아이템 | 4개, 칸 셋(`name`, `desc`, `order`) | `scripts/lua/games/rpgdemo/items.lua` |
| 깃발, 변수 | 이름표가 없다. `ctx.state` 의 아무 키 | |
| 배우, 직업, 기술, 적, 부대, 상태, 애니메이션 | 없다 | |
| 몬스터 종 | 알데바란의 것이고 RPG 레이어 밖이다. 이미 `map-objects.json` 과 대조된다 | `scripts/lua/games/aldebaran/data/monsters.lua` |

**결정: 데이터베이스 패널은 이 단계에 넣지 않는다.** 네 줄짜리 표를 폼으로 고치는 것은 텍스트 편집기보다 낫지 않다.
대신 아이템 표를 `resources/data/items.json` 으로 옮기고(`items.lua` 는 그 파일을 읽는 한 줄이 된다) `rpg-game.json` 이 가리키게 한다.
그러면 커맨드 편집기의 아이템 칸이 목록에서 이름과 함께 고르고, 없는 id 를 경고한다 (이 쪽이 실제 쓸모다: `lamp_oil` 을 `lamp_oill` 로 적는 실수).
표 자체는 Monaco 의 JSON 편집으로 고친다. 패널은 아이템에 폼이 값을 하는 칸(아이콘, 값, 쓰임)이 생기거나 배우와 적이 생길 때 나중 후보 1순위다.

## 7. 데모 이벤트의 이전 (엔진 PR #50 으로 끝났다)

`tools/export_events.py` 가 항구 마을 16개와 여관 6개의 이벤트를 맵 파일로 옮겼다. 정의 파일에는 맵 속성만 남았고, 인수 시나리오와 골든 세 장과
벽 앞 검사의 stdout 이 옮기기 전과 바이트까지 같다. 마을과 오두막은 RTP 쌍둥이 맵이라 Lua 에 남았다 (에디터에서 읽기 전용). 자세한 규칙은 M2 문서 6절.

## 작업 항목

PR 은 넷으로 나눈다 (저자의 "큰 작업은 PR 둘로" 규칙을 두 저장소에 하나씩 겹친 모양). 각 PR 이 따로 병합되어도 두 저장소가 깨지지 않는 순서다.

| PR | 저장소 | 마일스톤 | 내용 |
|---|---|---|---|
| 1. M2 계약 | 엔진 | 1 | 스키마 둘, 검사와 trace, auto 고치기, 테스트. 게임의 겉모습은 그대로 |
| 2. M2 이전 | 엔진 | 3 | 이전 도구와 항구 마을, 여관의 이벤트를 맵 파일로 |
| 3. 확장 API 와 이벤트 레이어 | 에디터 | 2, 4 | ext-rpg 모델, 교차 검사, 코어와 타일맵의 자리, `packages/ui`, 레이어 |
| 4. 커맨드 편집기와 실행 | 에디터 | 5, 6 | 편집기, 실행 명령, e2e |

### 마일스톤 1: 계약 (엔진 M2 전반, PR 1)

- [x] 엔진 PR #49 로 병합 (2026-09-27). 항목별 체크리스트는 M2 문서의 "마일스톤 1". 적대 검수 세 번의 결과(선택 인자 타입, `null` 칸, 예약 이름 등)도 그 문서에 있다

### 마일스톤 2: 이벤트 모델과 교차 검사 (`packages/ext-rpg/src/model`, DOM 없음, PR 3 의 앞)

- [x] 패키지 뼈대: `package.json`, `tsconfig.json`, 루트 `typecheck` 목록, `eslint.config.mjs` 의 모델 금지 규칙 (2.3). Vitest 는 기존 `include` 가 잡는다
- [x] `schema.ts`, `game.ts`(`mapEntryFor` 포함): 해석과 버전 잠금, 오류는 위치와 함께
- [x] `events.ts`: 섹션 읽기와 쓰기, 모르는 키 보존, 1.4절 키 순서 (중첩 값과 `file` 꼴까지)
- [x] `tree.ts`: 경로, 엔진 표기, 걷기, 넣기, 빼기, 옮기기, 복사, 같은 하위 목록 찾기
- [x] `commands.ts`: 이벤트 추가, 삭제, 이동(합치기, 배회 구역 함께), 칸 바꾸기(합치기), 이름 바꾸기(참조 함께), 커맨드 넣기, 빼기, 옮기기, 인자 바꾸기(합치기), 항목 바꾸기(가지와 cancel 함께), 배회 구역
- [x] `validate.ts`: 1.5 표의 검사(오류)와 에디터만의 검사(3절, 4절)
- [x] `assets.ts`, `refs.ts`, `play.ts`(앞 칸, 가장 가까운 설 수 있는 칸, 시작 상태 글, `planEnv`, `probeEnv`)
- [x] 픽스처 동기화 `scripts/sync-engine-rpg.mjs`(`yarn sync:rpg`): 두 스키마, 아이템 표, `port_town.json`, `inn.json`, 경로 픽스처, 플레이스홀더 CharSet 과 FaceSet 과 `port16.png`. **`resources/rtp/` 는 복사하지 않는다.** MANIFEST 에 엔진 커밋과 sha256
- [x] 테스트: 엔진의 모든 맵(`INITIAL2D_DIR` 이 있으면) 읽고 쓰기가 바이트 같음과 이벤트가 모두 스키마로 읽힘, 경로 픽스처 대조, 줄바꿈과 따옴표와 한글 대사 왕복, 되돌리기와 합치기, 막는 규칙, 앞 칸과 가장 가까운 칸 고르기, `mapEntryFor`(등록, `alt`, 등록 안 됨)
- [x] **`yarn test:engine-events`** (5.3, 모델만의 길. 판 넷). 건너뛰기와 M2 기능 확인. 이 뒤의 마일스톤은 이 검사를 자율 검증 루프에 넣는다. 건너뛰지 않은 실행 기록은 구현 노트에 있다

### 마일스톤 3: 이전 (엔진 M2 후반, PR 2)

- [x] 엔진 PR #50 으로 병합 (2026-09-27): `tools/export_events.py`, 항구 마을과 여관의 이벤트를 맵 파일로, 인수 시나리오와 골든 무변경
- [x] 에디터 픽스처를 다시 동기화한다 (`yarn sync:rpg`). `yarn test:engine-events` 가 이전한 항구 마을로 통과한다 (마일스톤 2 에서. 픽스처는 이전 뒤의 엔진 master `fab4710` 에서 복사했다)
- [ ] 에디터로 옮긴 맵을 열어 저장하면 바이트가 같다 (마일스톤 2 의 왕복 테스트), 사람이 브리지 왕복 한 번. 모델의 왕복은 테스트가 확인한다 (엔진의 모든 맵). 남은 것은 사람의 브리지 왕복이다

### 마일스톤 4: 확장 API 와 이벤트 레이어 (PR 3)

- [ ] 코어: `exportsOf`, `workspace` (2.1), `extensions.test.ts`
- [ ] 타일맵: `contrib.ts`(2.2: `registerMapLayer`, `refreshLayer`, `hint`, `MapLayerState.refresh`), `MapModel.rawSection`, `MapDocument` 의 레이어 상태와 `text()` 와 `problems`, `MapTarget` 의 `ext`, `play.maps`, 기본 실행 제공자. 모델 테스트와 "문서가 먼저, 스키마가 나중" 테스트
- [ ] `packages/ui`: 입력 부품 이전, 앱이 그것을 쓴다 (기존 테스트 그대로 통과). 저장소 배관 등록: 루트 `typecheck`, `eslint.config.mjs` 의 `react-hooks` 대상, 앱의 의존 (2.3)
- [ ] 앱: 렌더러의 레이어 컨테이너, 도구 넘기기(Ctrl 조합 포함, 전파 막기), 레이어 패널 줄과 힌트, 인스펙터 자리, 도구 단축키, 확장 패널 탭, 저장 전 질문 (2.3)
- [ ] ext-rpg: `EventsLayerView`, `eventsTool`(복사, 붙여넣기, 복제, 지우기를 도구의 키로), `EventInspector`(이벤트 칸), `EventsPanel`(시작 상태 칸 포함), 잠금 표시와 RTP 쌍둥이 맵의 읽기 전용 (3절), 스키마를 읽을 때마다 `refreshLayer`
- [ ] `yarn test:engine-events` 의 2단계를 앱과 같은 길(`MapDocument` + `attach`)로 바꾼다

### 마일스톤 5: 커맨드 편집기 (PR 4)

- [ ] `CommandListEditor`: 트리, 요약, 하위 목록 머리줄, 접기
- [ ] 팔레트, 넣기, 빼기, 옮기기, 복사와 붙여넣기, 키보드 (트리 요소가 받고 전파를 막는다)
- [ ] 인자 위젯 (1.2절 표 전부. `file` 은 `./` 꼴)
- [ ] 항목, 가지, cancel 맞추기
- [ ] 문제 표시와 줄로 가기
- [ ] 맵 이동의 대상 고르기 (4절. 넘치면 나중 후보로 미룬다)

### 마일스톤 6: 실행과 e2e (PR 4)

- [ ] 실행 제공자 `rpgPlay`(`rpg-game.json` 의 `play`, `applies` 는 `mapEntryFor`), 기본 제공자의 `maps` 거르기, 실행기의 언어 검사가 덧씌운 값을 본다
- [ ] 명령: 이 이벤트 앞에서 실행, 이 이벤트 자동 재생 (5.2), 시작 상태
- [ ] `RunnerStore` 단위 테스트: 프로세스 모드에서 제공자의 `plan.env` 가 `RunSpec.env` 에 그대로 실린다 (가짜 백엔드). Playwright 가 프로세스 모드를 볼 수 없어 이 테스트와 `yarn test:engine-events` 가 그 자리를 맡는다
- [ ] Playwright `tests/e2e/rpg-events.spec.ts`. 메모리 모드는 샘플 프로젝트에 RPG 파일이 없으므로, 프로젝트를 연 뒤 `withEditor` 로 메모리 백엔드에 `packages/ext-rpg/test/fixtures/` 의 파일(두 스키마, 아이템 표, `port_town.json`, `port16.png`, 플레이스홀더 CharSet 과 FaceSet)을 쓰고 ext-rpg 가 다시 읽기를 기다린다 (샘플 프로젝트 자체는 늘리지 않는다: 앱 번들에 실리기 때문이다). 본다: 표식 17개, `meadow.json` 에는 이벤트 줄이 없고 힌트만, 놓기, 끌기, 인스펙터, 커맨드 넣기와 되돌리기, 맵 뷰의 Ctrl+C 가 씬 복사를 부르지 않는다(씬 클립보드가 비어 있고 이벤트가 붙여진다), 저장한 파일 내용과 키 순서. 브리지 모드는 엔진 사본을 열고 내장 게임 뷰로 자동 재생해 콘솔의 `rpg:player:` 줄(자리와 방향)과 `rpg:message:` 줄과 `rpg:route:done` 을 본다
- [ ] README 두 저장소 (이벤트 레이어 사용법, 이 이벤트 앞에서 실행과 자동 재생과 시작 상태, `yarn test:engine-events`, `yarn sync:rpg`, 새 환경 변수), 두 `index.md` 진행 표, 이 문서의 구현 노트 (`test:engine-events` 의 건너뛰지 않은 실행 기록 포함)

## 완료 기준

- [ ] Tauri 앱과 웹판에서 엔진 저장소를 열고 `port_town.json` 을 열면 이벤트 17개가 게임과 같은 자리에 보인다 (외형은 CharSet 정면, 나머지는 트리거 표식). 같은 프로젝트의 `aldebaran_forest.json` 에는 이벤트 레이어가 없다
- [ ] **에디터로만 만든 이벤트가 게임에서 돈다.** 맵에 놓고, 트리거와 외형을 고르고, 분기가 있는 커맨드를 적어 저장한 이벤트를 `yarn test:engine-events` 가 진짜 엔진으로 띄워 대사와 분기 결과와 플레이어가 선 자리를 stdout 으로 확인한다. Lua 는 한 줄도 고치지 않는다. **건너뛴(SKIP) 실행은 치지 않는다**: 건너뛰지 않은 실행 기록이 구현 노트에 있어야 한다
- [ ] 같은 이벤트를 "이 이벤트 앞에서 실행"으로 띄우면 플레이어가 그 앞에서 그 쪽을 보고 선다 (`rpg:player:` 줄). 내장 모드는 e2e(브리지 모드의 게임 뷰)가, 프로세스 모드는 같은 `planEnv` 와 `probeEnv` 로 엔진 프로세스를 띄우는 `yarn test:engine-events` 와 `RunnerStore` 단위 테스트가 확인한다. 자동 재생은 대사를 콘솔에 남기고 스스로 끝난다. Tauri 앱에서의 프로세스 모드는 저자가 한 번 눌러 본다
- [ ] 스키마와 `commands.lua` 가 어긋나면 엔진 테스트가 깨진다 (커맨드를 하나 더해 깨지는 것을 보고 되돌린다). 경로 픽스처가 두 저장소에서 같은 경로 집합을 낸다
- [ ] 항구 마을과 여관의 이벤트가 전부 맵 파일에 있고, 인수 시나리오가 한 줄도 안 고치고 통과하며 골든 세 장(title, town, bag)과 벽 앞 픽셀 검사(wall)가 그대로다
- [ ] 이전한 맵을 에디터로 열어 저장하면 바이트가 같고, 이벤트 하나를 옮기면 diff 는 그 이벤트의 `x`, `y` 줄뿐이다
- [ ] 두 저장소의 README 에 사용법이 있다

## 의존 관계

- 선행: E3 (맵 문서, 맵 뷰, 오브젝트 레이어, 여기서 실행), 엔진 M1 (맵 고정 형식과 `mapfile.py`), **E4 의 병합**
- **E4 가 병합된 뒤에 시작한다.** E4 는 아직 `feat/e4-play` 에 커밋 안 된 변경이 있고 완료 기준 셋째와 새 로더 계약 엔진의 동기화가 남았다. E5 는 E4 가 고친 파일(`Editor.ts`, `RunnerStore.ts`, 그리고 확장 패널 탭이 닿을 수 있는 `documentDock.ts`)을 함께 고치므로 먼저 시작하면 부딪힌다 (E4 는 레이아웃 파일 셋은 건드리지 않았다). 완료 기준 셋째와 내장 모드 e2e 도 E4 의 게임 뷰에 기댄다. 엔진 PR 1(M2 계약)은 에디터 파일을 건드리지 않으므로 E4 와 나란히 해도 된다
- E3 는 아직 🟡 이고 마무리용 브랜치(`feat/e3-finish`)가 있다. 그 작업이 맵 뷰 코드(`MapRenderer.ts`, `mapTools.ts`, `LayersPanel.tsx`, `MapObjectInspector.tsx`)를 고치면 E5 마일스톤 4 와 부딪히므로, E3 를 먼저 닫거나 적어도 그 변경이 병합된 뒤에 마일스톤 4 를 시작한다. 마일스톤 2(모델, DOM 없음)는 E3 와 겹치지 않는다
- 엔진 짝: M2. 마일스톤 1(PR 1)이 에디터 작업보다 먼저, 마일스톤 3(이전, PR 2)은 에디터 마일스톤 2(모델과 교차 검사) 뒤
- 후행: E6 (배포), 나중 후보의 데이터베이스 패널과 새 RPG 프로젝트 템플릿

## 위험

1. **확장 API 가 앱의 맵 코드에 비집고 들어간다.** 맵 뷰가 앱에 있어서 레이어 자리를 여는 일은 앱의 렌더러와 도구와 패널을 함께 고친다. 대응: 타입은 ext-tilemap 의 `contrib.ts` 에 모으고 PIXI 와 React 는 `unknown` 으로 흘린다 (코어의 `UiComponent` 와 같은 규칙). 오브젝트 레이어를 이 자리로 옮기는 일은 하지 않는다 (나중에 해도 되는지 보는 시험대가 이벤트 레이어다)
2. **Lua 정의가 에디터의 편집을 가린다.** 같은 id 면 Lua 가 이긴다. 대응: 이전에서 옮긴 것은 Lua 에서 지우고, 엔진이 `rpg:override` 를 찍고, 에디터가 정의 파일을 어림으로 훑어 경고한다
3. **키 순서와 바이트.** 이전 도구(Lua 인코더 + 파이썬)와 에디터(TS)가 같은 순서를 써야 왕복이 빈 diff 다. 대응: 1.4절 규칙을 두 쪽 테스트가 같은 맵으로 확인한다 (M1 의 `mapfile.py selftest` 와 같은 방식)
4. **대사 텍스트.** 줄바꿈, 따옴표, 한글이 JSON 과 입력 칸을 오간다. 대응: 모델 테스트와 교차 검사의 대사에 셋 다 넣는다 (12 문서 위험 1)
5. **RTP 화면 차이.** 에디터는 로컬 RTP 가 있으면 RTP 로 그리고, 내장 실행은 스테이징이 RTP 를 빼서 플레이스홀더로 돈다. 자동 검사는 `INITIAL2D_NO_RTP=1`. 대응: 레이어 머리에 "RTP 그림" 표시. RTP 와 그 변환물은 에디터의 픽스처에도 넣지 않는다
6. **transfer 방향 고치기가 인수 시나리오를 흔든다.** 방향만 바뀌지만 R2K3식 "정지 중 짧은 누름은 방향만" 규칙과 얽힐 수 있다. 대응: 마일스톤 1 의 첫 커밋으로 따로 하고, 시나리오가 달라지면 멈추고 보고한다 (시나리오를 고쳐 통과시키지 않는다)
7. **범위.** 이벤트 페이지, 공통 이벤트, 데이터베이스, 대사 미리보기가 모두 그럴듯하다. 대응: 전부 나중 후보로 적어 두고, 이 단계는 17종 커맨드와 지금 엔진의 이벤트 칸만 다룬다. 마일스톤 4 까지만으로도 "배치는 에디터, 대사는 JSON" 이 성립한다
8. **같은 맵을 밖에서 고친다.** 이전 도구나 생성기가 도는 동안 에디터가 그 맵을 열고 있으면 외부 변경이다. E1 과 E3 의 정책(수정 전이면 다시 읽기, 수정 중이면 띠)을 레이어 상태의 `reset` 이 따른다
9. **RTP 쌍둥이 맵에 놓은 이벤트가 한쪽 기계에서 사라진다.** 마을과 오두막은 `Assets.mapPath` 가 RTP 칩셋이 있으면 `_rtp.json`, 없으면 기본 판을 연다. 저자의 기계(RTP 있음)와 CI(`INITIAL2D_NO_RTP=1`)가 서로 다른 파일을 읽으므로 한 파일에만 더한 이벤트는 어느 한쪽에서 보이지 않는다. 대응: `alt` 가 있는 항목은 레이어를 읽기 전용으로 잠그고 이유를 띄운다 (2.2, 3절). 두 파일에 한 명령으로 쓰는 길은 "마을과 오두막의 이전" 후보에서
10. **틀린 맵 파일 이벤트를 건너뛰는 것이 조용한 누락이 된다.** 대응: 건너뛸 때마다 `rpg:error` 를 TRACE 없이 찍고, 엔진 테스트 러너의 rpgdemo 검사와 `yarn test:engine-events` 가 `rpg:error` 가 없음을 본다. 에디터는 같은 검사를 저장 전에 오류로 보인다
11. **auto 를 전부 돌리는 것이 기존 게임을 흔든다.** 지금은 모든 맵에 auto 가 하나라 달라질 것이 없어야 한다. 대응: 인수 시나리오와 `rpg_event_scene` 무변경을 PR 1 의 조건으로 두고, 달라지면 멈추고 보고한다
12. **E4 와 같은 파일을 고친다.** 대응: E4 병합 뒤에 시작한다 (의존 관계). 엔진 PR 1 만 먼저 해도 된다
13. **교차 검사가 늘 건너뛰어 아무것도 보지 않는다.** 엔진 실행 파일이 없는 기계나 M2 전 엔진에서는 `yarn test:engine-events` 가 0 으로 끝난다. 대응: `SKIP:` 줄을 분명히 찍고, 완료 기준이 건너뛰지 않은 실행 기록을 요구한다 (5.3)

## 나중 후보

| 후보 | 언제 필요해지는가 |
|---|---|
| 데이터베이스 패널 (아이템 표 폼, 이후 배우와 적) | 아이템에 아이콘이나 값이나 쓰임이 생길 때, 표가 스무 줄을 넘을 때 |
| 공통 이벤트 또는 `call` 커맨드 | 같은 흐름을 두 곳 이상에서 쓸 때 (`departure()` 와 `handKey()` 가 첫 예) |
| 이벤트 페이지 (나타나는 조건, 외형 바꾸기) | 같은 자리의 NPC 가 이야기 진행에 따라 달라져야 할 때. 엔진에 개념부터 필요하다 |
| 깃발과 변수의 이름표 | 깃발이 서른 개를 넘어 이름을 기억하기 어려울 때 |
| 대사 미리보기 | BMFont(`hangul16.fnt`)의 폭으로 게임 대화창의 줄바꿈과 쪽 넘김을 그대로 보인다 |
| 이동 루트를 맵 위에 그리기 | 순찰과 연출이 늘 때 |
| 맵 속성(bgm, start, groundLayers, autoRoute)의 데이터화 | 새 RPG 맵을 에디터만으로 만들고 싶을 때 (등록은 `rpg-game.json` 한 줄이지만 정의 파일 하나가 아직 필요하다) |
| 마을과 오두막의 이전 | RTP 판과 기본 판이 이벤트를 나눠 쓰는 길(예: 타일셋만 바꾸는 맵)이 생기거나, 두 파일에 한 명령으로 쓰는 편집이 생길 때. 그때 읽기 전용 잠금을 푼다 |
| Ruby 이벤트 레이어와 스키마 대조 | Ruby 로 RPG 를 만들 때 |
| 콘솔의 `rpg:error` 줄을 눌러 그 커맨드로 | 이벤트 오류를 자주 볼 때 (코어 `errorLinks` 에 확장이 링크 규칙을 더하는 자리) |
| 새 RPG 프로젝트 템플릿 | 알데바란과 항구 마을 밖의 RPG 를 시작할 때 (E2 템플릿 방식) |
| 맵 사이 문 짝 만들기 | 맵 이동 이벤트를 놓을 때 반대편 문을 함께 |
| 전역 `edit.*` 를 활성 문서로 보내기 | 씬, 맵 오브젝트, 이벤트가 저마다 복사와 붙여넣기를 따로 받는 것이 셋을 넘을 때 (지금은 레이어 도구의 키가 받는다, 2.4) |
| 자동 재생에서 선택지 항목 고르기 (`INITIAL2D_RPG_ROUTE` 의 `pick:<n>`) | 첫 항목이 아닌 가지를 손 없이 확인하고 싶을 때. 지금은 시작 상태와 손으로 하는 실행으로 본다 |

## 결정 기록 (2026-09-27)

초안의 물음 열한 개는 저자가 자리에 없는 동안 리드가 아래처럼 정했다. 저자가 바꾸면 이 표와 해당 절을 함께 고친다.

| 물음 | 결정 |
|---|---|
| 아이템 표를 JSON 으로 | 옮긴다. `resources/data/items.json`, `items.lua` 는 그 파일을 읽는다 (6절) |
| 마을과 오두막 | Lua 에 남기고 에디터에서는 읽기 전용이다 (7절). 옮기는 일은 나중 후보 |
| `departure()`, `handKey()` | JSON 에서 두 벌로 펼친다. `call` 커맨드(공통 이벤트)는 나중 후보 |
| 경로 표기 | 이벤트는 엔진과 같은 1부터 세는 표기, E3 오브젝트는 0부터 그대로 둔다. 사람이 보는 이벤트 오류가 엔진 콘솔과 같은 글이어야 하기 때문이다 |
| 검사용 장치 | `INITIAL2D_RPG_ROUTE`, `INITIAL2D_RPG_TRACE`, `INITIAL2D_RPG_AT`, `INITIAL2D_RPG_STATE` 를 둔다 (선례 `INITIAL2D_AUTOPLAY`) |
| 한 줄 설명을 `comment` 커맨드로 | 하지 않는다. 설명 글 읽기 과정을 빼고, 이벤트마다의 설명은 이전 보고와 `docs/design/port-town.md` 에만 남긴다 |
| `map-objects.json` 의 `play.maps` | 더한다 (선택 칸 하나) |
| auto 이벤트 | 병합 순서대로 전부 돌린다. 인수 시나리오와 `rpg_event_scene` 이 달라지면 멈추고 보고한다 |
| 틀린 맵 파일 이벤트 | 그 이벤트만 건너뛰고 `rpg:error` 를 찍는다 |
| 게임 설정 파일의 자리 | `resources/data/rpg-game.json`. 게임이 읽는 데이터이므로 스키마(`resources/schema/`, 형식의 설명)와 가른다 |
| `INITIAL2D_RPG_STATE` 의 꼴 | 쉼표 목록 그대로 |

## 구현 노트

### 마일스톤 2: 이벤트 모델과 교차 검사 (2026-09-27, `feat/e5-rpg`)

만든 것: `packages/ext-rpg`(의존은 core, ext-tilemap, mobx. `src/index.ts` 는 모델만 내보내고 확장 등록은 마일스톤 4),
`src/model/` 의 `json.ts`, `schema.ts`, `game.ts`, `events.ts`, `tree.ts`, `validate.ts`, `commands.ts`, `assets.ts`, `refs.ts`, `play.ts`,
`scripts/sync-engine-rpg.mjs`(`yarn sync:rpg`)와 `test/fixtures/`, `test/engine/events.engine.test.ts`(`yarn test:engine-events`, 별도 설정
`vitest.engine.config.ts`, 루트 `vitest.config.ts` 의 `exclude`, 타입 검사는 `test/tsconfig.json` 을 루트 `typecheck` 에 더했다).

구현하면서 정한 것:

| 물음 | 결정 |
|---|---|
| JSON 의 null | `Json.Load` 가 null 을 칸에서 지우므로 키의 null 은 없는 키, 값이 전부 null 인 객체는 배열 자리의 빈 배열, 끝까지 null 뿐인 배열은 객체 자리의 빈 객체로 본다 (`json.ts`). M2 3.1 의 빈 `{}` 와 `[]` 규칙을 일반화한 것이다 |
| 경로 픽스처의 크기 | 엔진 `invalid_events.paths.json` 은 경로 104개다 (M2 3.4 는 100개라고 적었다). 테스트는 개수를 박지 않고 집합을 대조한다 |
| 막는 규칙의 구현 | 이벤트 칸의 편집은 편집 앞뒤의 오류(자리와 이유)를 견주어 새 오류가 생기면 `EditRefused` 를 던진다. 밖에서 고친 파일의 원래 오류는 막지 않고, 고치는 편집은 된다. 커맨드 넣기와 인자 바꾸기는 새 커맨드와 그 인자 자리만 따로 검사한다 (하위 목록의 옛 오류는 막지 않는다) |
| 키 순서 | 고친 객체만 정해진 순서로 다시 쓴다. 그 객체를 품은 조상은 키 자리를 지키고 값만 갈아 끼운다. 조상에 없던 하위 목록 키가 생기면 그 조상도 정해진 순서로 쓴다. 엔진의 모든 맵에서 `canonicalEvent` 가 원래 글과 같아, 이전 도구와 순서가 같음을 확인했다 |
| 키 순서의 한계 | JS 객체는 정수처럼 생긴 키(`"1"`)를 늘 앞에 두므로 그런 모르는 키는 원래 자리를 잃는다. 지금 데이터에는 없다 |
| 같은 커맨드 묶음 | 하위 목록 전체(커맨드 둘 이상)와 하위 목록을 품은 커맨드 하나(내용 있음)를 키 순서와 상관없이 견주고, 묶음 안의 묶음은 바깥 것만 알린다. 항구 마을의 배(`departure()`, 가지 두 목록, 커맨드 9개)와 여관 주인(`handKey()`, if 커맨드 둘, 8개)을 찾는다 |
| 새 커맨드 | `newCommand` 가 스키마 기본값으로 필수 인자를 채운다. `file` 은 기본값이 없어 파일 없이 넣으면 거절된다 (파일 위젯이 먼저 묻는다) |
| 앞 칸의 방향 | 엔진 `turnToward` 와 같다. 대각선이면 세로가 먼저다 |
| 엔진 빌드 | `build/Initial2D` 는 master 보다 앞선 커밋의 빌드지만, 게임 스크립트는 작업 폴더의 사본에서 읽으므로 다시 빌드하지 않았다 |
| 교차 검사의 작업 폴더 | `os.tmpdir()` 아래에 만들고 끝나면 지운다 (`KEEP_WORKDIR=1` 이면 남기고 경로를 찍는다). 엔진이 받는 환경 변수는 `INITIAL2D_` 로 시작하는 바깥 값을 빼고 채운다 |

검수: `yarn typecheck`, `yarn lint`, `node scripts/check-color-literals.mjs` 통과. Vitest 전체 817건 통과(85 파일, ext-rpg 107건).
테스트가 깨지는 것을 보았다: 배열 끝의 null 을 칸 수에 넣으면(3건), 소지품 자리 검사를 끄면(3건), 편집 거절을 끄면(6건),
외형과 얼굴의 set 이름 검사를 끄면(5건), 정해진 키 순서를 끄면(22건), 커맨드를 제 안으로 옮기는 검사를 끄면(2건),
바라보는 칸을 앞 칸 후보에서 빼면(2건), 항목을 더할 때 취소 번호를 안 옮기면(1건), 저장할 때 빈 `{}` 를 고치지 않으면(1건).
`yarn test:engine-events` 의 건너뛰기는 엔진 실행 파일이 없는 경우와 M2 전 엔진(스키마 없는 폴더에 실행 파일만 둔 경우) 둘 다 `SKIP:` 한 줄과 종료 코드 0 이다.

`yarn test:engine-events` 의 건너뛰지 않은 실행 (엔진 master `fab471059ac20b6aedcbee0f3a743eaddec796b4`, 판 넷, 검사 50개):

```
[1] rc=0
  rpg:map:port_town events:18 skipped:0
  rpg:player:port_town,15,44,up
  rpg:event:arrival
  rpg:message:선장|짐은 다 내렸네. 저녁 물때에 배가 다시 뜨니, 그때까지는 자네 시간이야.
  rpg:message:선장|급할 것 없으면 마을을 좀 둘러보게. 여긴 떠나는 사람을 붙잡지 않는 대신, 남는 사람도 서운하게 하지 않거든.
  rpg:event:e2e_sign
  rpg:message:표지판|표지판에 글씨가 적혀 있다.\n"항구에 온 것을 환영한다" 라고 쓰여 있다.
  rpg:message:|A
  rpg:choice:예|아니요
  rpg:message:|C
  rpg:route:done
[2] rc=0
  rpg:map:port_town events:19 skipped:0
  rpg:player:port_town,17,44,up
  rpg:event:arrival
  rpg:message:선장|짐은 다 내렸네. 저녁 물때에 배가 다시 뜨니, 그때까지는 자네 시간이야.
  rpg:message:선장|급할 것 없으면 마을을 좀 둘러보게. 여긴 떠나는 사람을 붙잡지 않는 대신, 남는 사람도 서운하게 하지 않거든.
  rpg:event:e2e_door
  rpg:transfer:inn,10,12,up
  rpg:map:inn events:6 skipped:0
  rpg:player:inn,10,12,up
  rpg:event:arrival
  rpg:route:done
[3] rc=0
  rpg:map:port_town events:20 skipped:0
  rpg:player:port_town,16,43,up
  rpg:event:arrival
  rpg:message:선장|짐은 다 내렸네. 저녁 물때에 배가 다시 뜨니, 그때까지는 자네 시간이야.
  rpg:message:선장|급할 것 없으면 마을을 좀 둘러보게. 여긴 떠나는 사람을 붙잡지 않는 대신, 남는 사람도 서운하게 하지 않거든.
  rpg:event:e2e_auto
  rpg:message:|D
  rpg:route:done
[4] rc=0
  rpg:map:port_town events:18 skipped:0
  rpg:player:port_town,15,44,up
  rpg:event:arrival
  rpg:event:e2e_sign
  rpg:message:표지판|표지판에 글씨가 적혀 있다.\n"항구에 온 것을 환영한다" 라고 쓰여 있다.
  rpg:message:|A
  rpg:choice:예|아니요
  rpg:message:|C
  rpg:route:done
engine-events: 판 4, 검사 50개 통과, 엔진 fab471059ac20b6aedcbee0f3a743eaddec796b4 (/Users/u/Initial2D/build/Initial2D)
 ✓ test/engine/events.engine.test.ts (4 tests) 16591ms
      Tests  4 passed (4)
```

판마다 본 것: [1] 표지판(`e2e_sign`, action, 외형 `npc` 2번)을 시작 칸 옆 15,43 에 놓고 `play.ts` 가 고른 앞 칸 15,44 에 위를 보고 선다.
타이핑 두 번이 되돌리기 한 단계로 합쳐지고, 저장한 이벤트의 키 순서가 정해진 순서다. 대사는 첫 대사(이름, 얼굴, 줄바꿈과 따옴표가 든 한글),
아이템을 얻은 참 가지의 A, 선택지, 첫 항목의 가지가 세운 깃발의 C 순서이고 B 는 없다. [2] touch 문(`e2e_door`)을 17,43 에 놓고 한 걸음 밟으면
`playSe` 뒤에 여관 10,12 에 위를 보고 선다 (`rpg:player:inn,10,12,up`). [3] auto 둘째(`e2e_auto`)가 `arrival` 뒤에 돌고 스스로 끝난다.
[4] 되돌리기로 첫 판의 맵으로 돌아가면 저장한 글이 첫 판과 바이트까지 같고, 시작 상태 `arrived` 로 띄우면 선장의 인사가 없다.
