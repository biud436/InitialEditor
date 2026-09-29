# 비주얼 스크립팅: 그래프에서 Lua와 Ruby를 만든다

> 작성일: 2026-09-29. [next-goals.md](next-goals.md) 3절의 다음 단계다. 검토 문서 [visual-scripting-review.md](visual-scripting-review.md)의 권고(방식 C)를 따른다.
> 저자가 "비주얼 스크립팅"이라고 해서 검토 문서 5절의 정할 것 다섯을 권고대로 정했다 (1절). 저자가 달리 정하면 그 말이 이긴다.

## 1. 결정

| 검토 문서 5절 | 정한 것 |
|---|---|
| 1. 매 틱 로직을 스크립트 없이 | 된다. 플래피 `bird` 전체를 노드로 적는다 (노드 80개) |
| 2. Ruby 판도 처음부터 | 그렇다. 그래프 하나에서 두 언어를 늘 같이 만들고, 진짜 엔진에서 두 판을 같은 항목으로 본다 |
| 3. 게임의 도우미 모듈 | 노드 라이브러리(`*.nodes.json`)로 부른다. `bird`는 `common`의 함수와 상수를 라이브러리 노드로 쓴다 |
| 4. 생성 파일 | 커밋한다. 엔진은 그래프를 읽지 않으므로 에디터 없이 게임을 돌리려면 생성 파일이 있어야 한다. 첫 줄의 표시로 생성 파일을 알아보고 손으로 쓴 파일은 덮어쓰지 않는다 |
| 5. 캔버스 편집기 | 포맷과 생성기를 먼저 만들어 엔진으로 확인한 뒤(V1) 바로 이어서 만든다(V2) |

엔진은 고치지 않는다. 생성 코드는 손으로 쓴 컴포넌트와 같은 길(씬 로더, 매개변수, 핫 리로드, 오류 줄)로 돈다.

## 2. 파일

| 파일 | 뜻 |
|---|---|
| `scripts/components/<경로>.graph.json` | 그래프. 컴포넌트 `components/<경로>` 가 된다. 경로 조각은 소문자, 숫자, `_` |
| `scripts/lua/components/<경로>.lua` | 생성한 Lua 컴포넌트 (모듈 표) |
| `scripts/ruby/components/<경로>.rb` | 생성한 Ruby 컴포넌트 (`Components::<경로>` 클래스, 엔진 로더가 먼저 찾는 이름) |
| `scripts/components/<경로>.json` | 그래프가 매개변수를 선언하면 만드는 선언 파일 (엔진 r1 5.4절) |
| `scripts/**/<이름>.nodes.json` | 노드 라이브러리. 게임의 도우미 모듈을 노드로 쓰게 한다 |

생성 파일의 첫 줄은 `-- 그래프에서 만든 파일: <그래프 경로> (...)` (Ruby 는 `#`)이다. 에디터는 이 줄이 없는 파일(손으로 쓴 파일)을 덮어쓰지 않는다.
그래프와 라이브러리는 `scripts/components/` 아래에 있어도 매개변수 선언이 아니다 (편집기의 선언 스키마와 인스펙터의 선언 목록에서 뺀다).

### 2.1 그래프 파일 v1

```json
{
  "version": 1,
  "uses": ["scripts/components/flappy/common.nodes.json"],
  "params": [ { "key": "speed", "type": "number", "default": 60 } ],
  "state": {
    "from": "flappy.state",
    "fields": [ { "key": "birdVy", "type": "number" }, { "key": "state", "type": "enum", "values": ["ready", "play", "dead"] } ]
  },
  "locals": [ { "key": "dt", "type": "number" } ],
  "nodes": [
    { "id": "update", "kind": "event.update", "next": "set_dt" },
    { "id": "tick_dt", "kind": "lib.call", "fn": "flappy.dt", "in": { "elapsed": "update.elapsed" } },
    { "id": "set_dt", "kind": "local.set", "field": "dt", "in": { "value": "tick_dt" }, "next": "by_state" }
  ],
  "layout": { "update": [0, 0], "tick_dt": [0, 120], "set_dt": [260, 0] }
}
```

| 키 | 규칙 |
|---|---|
| `version` | 1 |
| `uses` | 노드 라이브러리 경로의 배열 (프로젝트 기준) |
| `params` | 매개변수 선언의 fields 와 같은 배열 (엔진 r1 5.4절). 있으면 선언 파일을 만들고 Ruby 는 `initialize(params = {})` 를 낸다 |
| `state` | 컴포넌트들이 나눠 쓰는 상태 표. `from` 이 `"scene"`(기본)이면 `scene.state`, `"라이브러리.함수"` 면 scene 만 받고 `state` 를 반환하는 라이브러리 함수의 결과. `fields` 의 `default` 는 `init` 에서 비어 있을 때 채운다 |
| `locals` | 훅 안의 지역 변수. 늘 기본값(없으면 0, false, "", 첫 enum 값)으로 시작한다 |
| `nodes` | 노드의 배열 (2.2) |
| `layout` | 노드 id 에서 캔버스 좌표 `[x, y]` 로. 노드를 옮기기만 하면 이 줄들만 바뀐다 |

변수(`state.fields`, `locals`)는 `key`, `type`(number, integer, boolean, string, enum, object), `label`, `values`(enum), `default`, `ruby`(Ruby 이름) 를 쓴다.
Ruby 이름은 없으면 snake_case 다 (`birdVy` 는 `:bird_vy`, `GROUND_Y` 는 `:ground_y`). 상태와 지역 변수의 enum 은 Ruby 에서 Symbol 이고, 매개변수의 enum 은 문자열이다 (JSON 에서 온다).
모르는 키는 루트, state, 변수, 노드에서 보존한다. 파일은 노드와 변수를 한 줄에 하나씩 쓴다.

### 2.2 노드

| 키 | 뜻 |
|---|---|
| `id` | 식별자, 파일 안에서 유일 |
| `kind` | 노드 종류 (3절) |
| `field`, `type`, `fn`, `const` | 종류의 설정 (상태 필드 이름, props 값 형식, 함수, 상수) |
| `in` | 입력 포트에 이은 값. 노드 id(그 노드의 값) 또는 `"id.포트"`(이벤트의 `elapsed`, 반복의 `index`) |
| `args` | 이어지지 않은 입력 포트의 상수 |
| `next` | 이 문장 다음의 문장 (갈래가 있는 노드는 갈래가 끝난 뒤) |
| `then`, `else` | 조건 분기의 갈래. 값 분기는 `cases`(값에서 첫 노드로)와 맞는 값이 없을 때의 `else` |
| `body` | 반복의 본문 |

실행 노드는 이벤트에서 `next` 와 갈래로 한 줄기로만 이어진다 (한 노드로 두 번 들어오지 않고 돌지 않는다). 그래서 생성 코드는 늘 구조적인 `if`, `case`, `for` 다.
값 노드는 쓰이는 자리마다 식으로 펼쳐지고, 읽을 때의 값을 쓴다 (`state.set` 뒤의 `state.get` 은 새 값이다).

### 2.3 노드 라이브러리 v1

```json
{
  "version": 1,
  "name": "flappy",
  "label": "플래피",
  "lua": { "require": "scripts/lua/components/flappy/common" },
  "ruby": { "require": "scripts/ruby/components/flappy/common", "module": "FlappyCommon" },
  "constants": [ { "key": "GRAVITY", "type": "number", "label": "중력 가속도" } ],
  "functions": [
    { "key": "state", "args": [{ "key": "scene", "type": "scene" }], "returns": "state" },
    { "key": "flapPressed", "ruby": "flap_pressed?", "args": [{ "key": "st", "type": "state" }], "returns": "boolean" },
    { "key": "sfx", "args": [{ "key": "name", "type": "string" }] }
  ]
}
```

Lua 는 `local flappy = require(...)` 의 필드(`flappy.GRAVITY`, `flappy.sfx("flap")`), Ruby 는 모듈의 상수와 메서드(`FlappyCommon::GRAVITY`, `FlappyCommon.sfx("flap")`)다.
Ruby 이름은 없으면 상수는 key 그대로, 함수는 snake_case 다. `returns` 가 없는 함수는 실행 노드, 있으면 값 노드다.
인자 형식 `scene` 과 `state` 는 포트가 아니다 (생성 코드가 `scene` 과 상태 표를 넘긴다). `object` 인자는 이어지지 않으면 컴포넌트의 `obj` 다.

## 3. 노드 종류

| 분류 | 종류 |
|---|---|
| 이벤트 | `event.init`, `event.update`(출력 `elapsed`, ms), `event.render`, `event.destroy`. 각각 하나까지 |
| 흐름 | `flow.branch`(조건), `flow.switch`(enum, 문자열, 정수 값), `flow.repeat`(횟수, 출력 `index` 는 0부터이고 본문 안에서만) |
| 변수 | `state.get`, `state.set`, `local.get`, `local.set`, `param.get` |
| 오브젝트 | `obj.self`, `obj.get`, `obj.set`(x, y, visible, animate. 읽기는 id, type 도), `prop.get`, `prop.set`(`obj.props`, 값 형식을 `type` 에 적는다). `target` 이 비면 컴포넌트의 오브젝트 |
| 씬 | `scene.find`, `scene.switch`, `scene.remove` |
| 수학 | `math.add`, `sub`, `mul`, `div`(늘 실수), `mod`, `neg`, `abs`, `min`, `max`, `clamp`, `sin`, `cos`, `sqrt`, `floor`(정수), `random`(0 이상 1 미만), `randomInt` |
| 논리 | `cmp.eq`, `ne`, `lt`, `le`, `gt`, `ge`, `logic.and`, `or`, `not` |
| 텍스트 | `text.concat`, `text.print` |
| 라이브러리 | `lib.const`(`const: "flappy.GRAVITY"`), `lib.call`(`fn: "flappy.sfx"`) |
| 엔진 API | `api.call`(`fn: "Input.IsKeyDown"` 등 22개). 이름과 인자는 엔진 API 명세의 것이고 `api.test.ts` 가 번들 명세와 대조한다. 키는 `SPACE` 같은 이름(Lua 는 코드, Ruby 는 `:space`), 마우스 버튼은 `left`, `right`, `middle` |

## 4. 생성 규칙

- 두 언어의 뜻이 같게 쓴다. 나누기는 늘 실수다 (Ruby 는 상수를 `2.0` 으로 쓰고, 두 값이 다 정수면 왼쪽에 `.to_f`). 그래프의 계산 순서를 지키도록 오른쪽의 같은 순위 식은 괄호로 싼다 (`..`, and, or 는 빼고).
- 상태를 쓰는 훅은 맨 위에서 한 번 `st` 로 받는다. 지역 변수는 처음 쓰는 곳이 훅 맨 위 줄기의 대입이면 그 자리에서, 아니면 훅 맨 위에서 기본값으로 만든다 (Ruby 블록 안의 대입이 밖에서도 보이게).
- 값 분기는 Lua 에서 `if ... elseif`(값이 호출이면 지역 변수에 한 번 받는다), Ruby 에서 `case ... when` 이다.
- 생성기는 줄마다 그 줄을 만든 노드를 기록한다. 실행 중 오류의 줄에서 노드를 찾는 데 쓴다.
- 결과 예: 플래피 `bird` 의 그래프(`packages/core/src/graph/fixtures/flappy/bird.graph.json`)가 만드는 코드는 같은 폴더의 `bird.expected.lua`, `bird.expected.rb` 다. 손으로 쓴 `bird` 와 줄마다 거의 같다.

## 5. 검사

`validateGraph` 가 모양 다음의 뜻을 본다. 오류가 있으면 코드를 만들지 않는다.

- 노드: id(식별자, 유일), 종류, 설정(없는 상태 필드, 없는 라이브러리 함수 등), 이벤트 중복.
- 실행 흐름: 출구가 실행 노드를 가리키는가, 한 노드로 두 번 들어오는가, 도는가. 이벤트에서 이어지지 않은 실행 노드는 경고이고 만들지 않는다.
- 값: 없는 노드나 출력, 모르는 포트, 빈 입력, 형식(number 자리에 integer 는 되고 거꾸로는 안 된다), 상수의 형식(enum 값, 키 이름), 값 연결의 순환, 비교하는 두 값의 형식.
- 범위: 이벤트의 출력은 그 이벤트의 흐름 안에서만, 반복의 `index` 는 그 본문 안에서만.
- 변수: 이름(지역 변수는 두 언어의 예약어와 생성 코드의 이름을 피한다), Ruby 이름 겹침, 기본값의 형식, `state.from`, 매개변수 선언(코어의 `parseComponentDeclaration` 과 같은 규칙).

## 6. 시험

- 단위 (`yarn test`): `packages/core/src/graph/*.test.ts`. 포맷 왕복과 보존, 라이브러리, 이름 규칙, 검사 항목, 픽스처 둘의 생성 결과(기대 파일과 글자까지), 식의 괄호, Ruby 나누기, 값 분기, 지역 변수 위치, API 노드와 번들 명세의 대조.
- 진짜 엔진 (`yarn test:engine-graph`, `scripts/e2e-engine-graph.mjs`): 언어마다
  1. 플래피 템플릿 프로젝트의 `bird` 를 그래프에서 만든 코드로 바꿔 자동 시연을 돌리고, 손으로 쓴 `bird` 의 판과 `flappy:` 줄(상태 전이, 점수)과 요약 줄이 같은지 본다.
  2. 빈 프로젝트에 샘플러 그래프(노드 종류를 두루 쓰고 값 35줄을 찍는다)의 컴포넌트를 붙여 돌리고, 찍힌 줄이 기대값과 같은지 본다. Lua 와 Ruby 의 줄이 같아야 한다.

## 7. 에디터 (V2)

- 그래프 문서: `scripts/components/**/*.graph.json` 을 열면 캔버스 탭이 된다. 편집은 코어 명령(되돌리기 한 단계씩, 노드 끌기는 합쳐진다)이다.
- 저장: 그래프를 쓰고, 오류가 없으면 생성 파일(Lua, Ruby, 선언)을 쓴다. 손으로 쓴 파일이 있으면 쓰지 않고 알린다 (덮어쓰기는 확인 뒤). 생성 파일은 핫 리로드에 같이 실린다.
- 캔버스: DOM 과 SVG. 이동(가운데나 오른쪽 버튼, Space), 확대(휠), 노드 끌기, 포트에서 포트로 연결, 선 선택과 제거, 상자 선택, 노드 추가 목록(검색, 분류), 입력 포트의 상수 편집, 오류 노드 표시, 자동 정렬.
- 옆 창: 고른 노드의 설정, 상태 필드와 지역 변수와 매개변수와 라이브러리의 목록.
- 생성 파일은 에디터에서 읽기 전용이고 "그래프 열기" 가 있다. 콘솔의 오류 줄이 생성 파일을 가리키면 그래프를 열고 그 노드를 고른다.
- 새 그래프 컴포넌트 커맨드, 인스펙터의 컴포넌트 열기가 그래프를 연다.

## 8. 체크리스트

### V1. 포맷, 검사, 생성 (2026-09-29)

- [x] 그래프 포맷 v1 읽기와 쓰기 (`packages/core/src/graph/format.ts`), 모르는 키 보존, 노드 한 줄에 하나
- [x] 노드 라이브러리 v1 (`library.ts`)
- [x] 노드 종류와 형식 (`kinds.ts`), 엔진 API 노드 22개 (`api.ts`, 번들 명세와 대조)
- [x] 검사 (`validate.ts`)
- [x] Lua 와 Ruby 생성, 선언 파일, 줄과 노드의 대응 (`codegen.ts`), 읽기부터 생성까지 한 번에 (`compile.ts`)
- [x] 플래피 `bird` 그래프(노드 80개)와 `common` 라이브러리, 샘플러 그래프(노드 134개) 픽스처
- [x] 단위 시험 40건
- [x] 진짜 엔진 교차 검사 `yarn test:engine-graph` (35 PASS: 두 언어에서 손으로 쓴 `bird` 와 같은 판, 샘플러 35줄이 기대값과 같고 두 언어가 같다)
- [x] 그래프와 라이브러리를 매개변수 선언으로 보지 않는다 (편집기 스키마의 `!` 패턴, `componentNameFromDeclarationPath`)

### V2. 캔버스 편집기

- [ ] 그래프 문서와 명령 (코어)
- [ ] 저장하면 생성, 손으로 쓴 파일 보호, 핫 리로드에 생성 파일
- [ ] 캔버스 (노드, 포트, 선, 이동과 확대, 선택, 연결, 추가 목록, 상수 편집, 오류 표시, 자동 정렬)
- [ ] 옆 창 (노드 설정, 변수 목록)
- [ ] 생성 파일 읽기 전용과 "그래프 열기", 오류 줄에서 노드로
- [ ] 새 그래프 컴포넌트 커맨드, 인스펙터에서 그래프 열기
- [ ] e2e: 플래피 프로젝트에서 bird 그래프를 열고 값을 바꿔 저장하면 생성 파일이 바뀌고 게임 탭이 다시 읽는다
