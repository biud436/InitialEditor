# 비주얼 스크립팅 검토: 플래피 `bird`를 커맨드 목록과 그래프로 적어 보기

> 작성일: 2026-09-28. [next-goals.md](next-goals.md) 3절의 첫 단계인 검토 문서다. 아무것도 만들지 않았다.
> 읽은 소스는 엔진 master `dcf0aec`(컴포넌트 매개변수, 엔진 `docs/plans/r1-scene-loader.md` 5.4절이 병합된 뒤)와 이 저장소 `next`의 `a18b210`이다.
> 방식 B의 그래프는 C와 같아서 따로 적지 않는다. 둘은 실행하는 방법만 다르다 (3절 끝).

## 1. `bird`가 하는 일

`scripts/lua/components/flappy/bird.lua`와 `scripts/ruby/components/flappy/bird.rb`는 같은 일을 한다 (주석과 빈 줄을 빼면 46줄, 48줄). 상수와 도우미는 `common` 모듈에 있다.

- `init`: 공유 상태 `scene.state.flappy`를 얻고(없으면 `C.state`가 만든다) 자기를 `st.bird`로 적는다. x는 170, y는 화면 가운데다.
- `update`: `dt`는 `min(elapsed, 50) / 1000`이다. 공유 상태의 `state`로 갈린다.
  - `ready`: y가 가운데에서 `sin(readyTime * 4) * 14`만큼 오르내리고, 기울기는 `sin(readyTime * 4) * 6`이다.
  - `play`: 속도에 중력 1500을 더하고 820에서 자른다. y에 속도를 더하고 천장(0)에서 멈춘다. 이번 틱에 마우스 왼쪽이나 스페이스를 눌렀으면 속도를 -480으로 하고 효과음 `flap`을 낸다. 자동 시연이면 화면 절반 아래로 떨어질 때 같은 속도를 준다. 기울기는 `vy * 0.075`를 -22와 60 사이로 자른 값이다. 땅(`GROUND_Y`)에 닿으면 y를 땅에 맞추고 `C.die`를 부른다 (상태 `dead`, 최고 점수, 효과음 `hit`).
  - `dead`: 땅 위에 있는 동안 계속 떨어지고, 기울기가 초당 220도씩 90도까지 는다.
  - 끝에 `obj.props.angle`에 기울기를 쓰고, `dead`면 프레임 애니메이션을 멈춘다 (`obj.animate`).

`bird`가 하지 않는 일도 있다. 상태를 바꾸는 일(`ready`에서 `play`, `dead`에서 `ready`)과 `readyTime`을 올리는 일은 `director`가, 파이프 충돌과 점수는 `pipes`가 한다. `bird`의 충돌은 땅과의 좌표 비교 하나다.
엔진의 컴포넌트 훅은 `init`, `update`, `render`, `destroy` 넷이고 입력, 타이머, 충돌 훅은 없다. 입력은 `update` 안에서 묻는다. 플래피에는 매개변수 선언 파일이 없다.

두 언어 판은 같은 공유 상태를 다르게 적는다. 어느 방식이든 이것을 맞춰야 한다.

| | Lua | Ruby |
|---|---|---|
| 공유 상태의 키 | `st.birdVy`, `st.GROUND_Y`, `st.H` | `st[:bird_vy]`, `st[:ground_y]`, `st[:h]` |
| 상태 값 | 문자열 `"play"` | 심볼 `:play` |
| 날갯짓 입력 | `Input.IsMouseDown(0)`, `Input.IsKeyDown(32)` | `Input.mouse_down?(:left)`, `Input.key_down?(:space)` |
| 나눗셈 | `st.H / 2` (늘 실수) | `st[:h] / 2.0` (`/ 2`면 정수 나눗셈) |
| 도우미 | `C.flapPressed`, `C.GRAVITY` | `C.flap_pressed?`, `C::GRAVITY` |

## 2. 방식 A: 커맨드 목록

A를 이렇게 떼었다고 가정한다.

- 커맨드는 장르와 무관한 9종(`wait`, `if`, `setFlag`, `setVar`, `playSe`, `playBgm`, `scene`, `script`, `comment`)과 조건 `flag`, `var`를 그대로 쓴다.
- 두 언어에 실행 컴포넌트 `components/commands`가 있다. 매개변수 `file`(5.4절의 `string`)이 목록 파일을 가리킨다. 5.4절의 필드 형식에는 목록이 없어서 목록을 `params`에 바로 넣지 못한다.
- 트리거는 컴포넌트 훅 이름(`init`, `update`)이다. `update` 목록은 매 틱 처음부터 돈다.
- `flag`와 `var`는 `scene.state`의 한 표(`"state": "flappy"`)를 읽고 쓴다.
- `script`는 목록 옆 모듈의 함수를 이름으로 부른다. 함수는 Lua(`scripts/lua/commands/flappy/bird.lua`)와 Ruby(`scripts/ruby/commands/flappy/bird.rb`)에 둘 다 적는다.

씬 파일의 새는 `"scripts": ["components/commands"], "params": {"components/commands": {"file": "scripts/commands/flappy/bird.json"}}`이고, 목록 파일은 이렇다.

```json
{
  "version": 1,
  "state": "flappy",
  "scripts": "flappy/bird",
  "on": {
    "init": [
      { "code": "script", "name": "place" }
    ],
    "update": [
      { "code": "if", "cond": { "flag": "state", "equals": "ready" },
        "thenDo": [ { "code": "script", "name": "float" } ] },
      { "code": "if", "cond": { "flag": "state", "equals": "play" },
        "thenDo": [
          { "code": "script", "name": "fall" },
          { "code": "if", "cond": { "input": "flap" },
            "thenDo": [
              { "code": "setVar", "key": "birdVy", "value": -480 },
              { "code": "playSe", "file": "./resources/audio/flap.wav", "id": "flap" }
            ] },
          { "code": "script", "name": "autoplayFlap" },
          { "code": "script", "name": "tiltAndGround" }
        ] },
      { "code": "if", "cond": { "flag": "state", "equals": "dead" },
        "thenDo": [ { "code": "script", "name": "tumble" } ] },
      { "code": "script", "name": "sync" }
    ]
  }
}
```

목록으로 적은 것은 상태 갈래, 날갯짓의 속도 대입, 효과음뿐이다. 나머지는 아래 이유로 `script`로 넘겼다.

- **수식**: `setVar`는 상수로 `=`, `+`, `-`만 하고, `var` 조건은 변수 하나와 상수를 견준다. 곱셈, `sin`, `min`, `max`, `obj.y` 읽기가 없어 `place`, `float`, `fall`, `tiltAndGround`, `tumble`이 스크립트다. `obj.props.angle`과 `obj.animate`를 쓰는 커맨드도 없어 `sync`가 스크립트다.
- **입력**: 입력 조건이 없다. `{ "input": "flap" }`은 새로 넣어야 하는 조건이고, 넣지 않으면 이 갈래도 `script`다. `C.flapPressed`가 자동 시연 중에 거짓인 규칙도 이 조건에는 없다.
- **자동 시연의 날갯짓**: 두 값을 견주는 조건(`obj.y > H * 0.5`)과 AND가 없다.
- **`C.die`**: 상태, 최고 점수, 효과음을 함께 바꾸므로 `tiltAndGround` 안에 남는다.
- **값의 출처**: -480은 `C.FLAP`이 아니라 목록에 적힌 숫자다. `director`는 여전히 `C.FLAP`을 쓴다.
- **효과음 길이**: `C.sfx`는 `Audio.PlaySound(path, name, 1)`로 두 번 튼다 (효과음 파일이 절반 길이다). `playSe`에는 반복 인자가 없고 RPG 호스트는 한 번 튼다.
- **한 틱 밀림**: 지금 실행기(`interpreter.lua`)에서 `playSe`는 yield하고 남은 커맨드는 다음 틱에 돈다. 매 틱 처음부터 도는 목록이면 남은 커맨드가 다음 틱의 목록과 겹치거나 버려진다. 날갯짓한 틱의 기울기와 땅 검사가 늦거나 빠진다.
- **매 틱 트리거**: 지금 실행기에 없는 뜻이다. `parallel` 이벤트는 맵에 들어갈 때 한 번 시작해 끝나면 그만이고, 목록에 반복 커맨드도 없다.

결국 `bird`의 물리는 스크립트 함수 일곱 개에 있고, 그 일곱 개를 두 언어로 따로 쓴다.

## 3. 방식 C: 그래프와 생성 코드

그래프 포맷은 이렇게 가정한다.

- 파일은 `scripts/components/flappy/bird.graph.json`이다 (선언 파일 `bird.json`과 같은 폴더).
- 노드마다 `id`, `kind`, 캔버스 좌표 `pos`가 있다. 실행 순서는 `next`와 갈래 이름으로, 값은 `in`에 노드 id로 잇는다.
- `state.get`과 `obj.get`은 쓰일 때마다 그때 값을 읽는다 (`s2`의 `vy`는 `s1`이 쓴 값이다). `dt`처럼 틱 안에서 변하지 않는 값은 한 번 계산한다.
- `state`는 공유 상태 표를 얻는 함수와 변수의 형식(열거, 수)을 적는다. `custom`은 게임 모듈의 함수나 상수 하나다.

아래는 `play` 갈래의 앞부분(중력, 자르기, 이동, 날갯짓)이다. 천장, 자동 시연, 기울기, 땅, `ready`와 `dead` 갈래, `init`은 줄였다.

```json
{
  "version": 1,
  "component": "components/flappy/bird",
  "state": { "from": "flappy.state", "vars": {
    "state": { "type": "enum", "values": ["ready", "play", "dead"] },
    "birdVy": { "type": "number" } } },
  "nodes": [
    { "id": "u",  "kind": "on.update", "next": "sw", "pos": [0, 0] },
    { "id": "st", "kind": "state.get", "var": "state", "pos": [0, 90] },
    { "id": "sw", "kind": "switch", "in": { "value": "st" }, "cases": { "play": "s1" }, "pos": [200, 0] },
    { "id": "dt", "kind": "custom", "call": "flappy.dt", "in": { "elapsed": "u.elapsed" }, "pos": [200, 180] },
    { "id": "vy", "kind": "state.get", "var": "birdVy", "pos": [200, 260] },
    { "id": "g",  "kind": "custom", "const": "flappy.GRAVITY", "pos": [200, 340] },
    { "id": "m1", "kind": "mul", "in": { "a": "g", "b": "dt" }, "pos": [400, 300] },
    { "id": "a1", "kind": "add", "in": { "a": "vy", "b": "m1" }, "pos": [560, 280] },
    { "id": "s1", "kind": "state.set", "var": "birdVy", "in": { "value": "a1" }, "next": "s2", "pos": [720, 0] },
    { "id": "mf", "kind": "custom", "const": "flappy.MAX_FALL", "pos": [560, 380] },
    { "id": "mn", "kind": "min", "in": { "a": "vy", "b": "mf" }, "pos": [720, 360] },
    { "id": "s2", "kind": "state.set", "var": "birdVy", "in": { "value": "mn" }, "next": "s3", "pos": [900, 0] },
    { "id": "oy", "kind": "obj.get", "field": "y", "pos": [720, 460] },
    { "id": "m2", "kind": "mul", "in": { "a": "vy", "b": "dt" }, "pos": [900, 460] },
    { "id": "a2", "kind": "add", "in": { "a": "oy", "b": "m2" }, "pos": [1060, 440] },
    { "id": "s3", "kind": "obj.set", "field": "y", "in": { "value": "a2" }, "next": "b1", "pos": [1080, 0] },
    { "id": "fp", "kind": "custom", "call": "flappy.flapPressed", "pos": [1080, 180] },
    { "id": "b1", "kind": "branch", "in": { "cond": "fp" }, "true": "s4", "pos": [1260, 0] },
    { "id": "fl", "kind": "custom", "const": "flappy.FLAP", "pos": [1260, 180] },
    { "id": "s4", "kind": "state.set", "var": "birdVy", "in": { "value": "fl" }, "next": "sf", "pos": [1440, 0] },
    { "id": "sf", "kind": "custom", "call": "flappy.sfx", "args": { "name": "flap" }, "pos": [1620, 0] }
  ]
}
```

이 부분이 노드 21개다. 같은 세는 법으로 `bird` 전체는 노드 100개 안팎이다 (어림).

생성기가 낼 Lua와 Ruby다 (같은 부분). 줄 끝 주석은 그 줄을 만든 실행 노드의 id다.

```lua
-- 생성된 파일: scripts/components/flappy/bird.graph.json. 손으로 고치지 않는다.
local C = require("scripts/lua/components/flappy/common")

local M = {}

function M.update(obj, scene, elapsed, params)
	local st = C.state(scene)
	local dt = C.dt(elapsed)
	if st.state == "play" then                        -- sw
		st.birdVy = st.birdVy + C.GRAVITY * dt        -- s1
		st.birdVy = math.min(st.birdVy, C.MAX_FALL)   -- s2
		obj.y = obj.y + st.birdVy * dt                -- s3
		if C.flapPressed(st) then                     -- b1
			st.birdVy = C.FLAP                        -- s4
			C.sfx("flap")                             -- sf
		end
	end
end

return M
```

```ruby
# 생성된 파일: scripts/components/flappy/bird.graph.json. 손으로 고치지 않는다.
require "scripts/ruby/components/flappy/common"

module Components
  module Flappy
    class Bird
      C = FlappyCommon

      def update(obj, scene, elapsed)
        st = C.state(scene)
        dt = C.dt(elapsed)
        if st[:state] == :play                           # sw
          st[:bird_vy] = st[:bird_vy] + C::GRAVITY * dt  # s1
          st[:bird_vy] = [st[:bird_vy], C::MAX_FALL].min # s2
          obj.y = obj.y + st[:bird_vy] * dt              # s3
          if C.flap_pressed?(st)                         # b1
            st[:bird_vy] = C::FLAP                       # s4
            C.sfx("flap")                                # sf
          end
        end
      end
    end
  end
end
```

C는 `bird`의 모든 줄을 노드로 적을 수 있다. 대신 아래가 필요하다.

- **커스텀 노드**: `C.state`, `C.dt`, `C.flapPressed`, `C.sfx`, `C.die`와 상수들은 게임의 `common` 모듈에 있다. `director`와 `pipes`도 같은 함수를 부르므로 그래프 안에 풀어 쓰지 않고 커스텀 노드로 부른다. 커스텀 노드마다 Lua 이름과 Ruby 이름을 적은 표가 있어야 하고, 이 표는 게임이 쓴다.
- **API 명세 밖의 노드**: `initial2d-api.json`은 엔진 바인딩만 적는다. 연산, 비교, `math.sin`과 `Math.sin`, `min`과 `max`, `obj`와 `scene`의 필드와 메서드(엔진 r1 5.2절, 5.3절)는 손으로 적는 노드 표가 따로 있어야 한다. `bird`에서 명세로 만드는 노드는 `common`이 부르는 `Input.IsMouseDown`, `Input.IsKeyDown`, `Audio.PlaySound` 셋이다.
- **생성 규칙**: 공유 상태의 이름(`birdVy`를 `:bird_vy`로), 열거 값(Lua 문자열, Ruby 심볼), 나눗셈(Ruby는 실수로 바꾼다), 키 이름(`Keys` 상수는 Ruby에만 있고 Lua는 32 같은 숫자다), 인자 채우기(`Audio.PlaySound`는 Lua에서 셋째 인자까지 필요하다).
- **글자가 다르다**: 손 코드의 `if st.birdVy > C.MAX_FALL then ... end`가 `math.min`이 된다. 뜻은 같지만 손 코드와 줄마다 맞지는 않는다.
- **매개변수**: 그래프가 매개변수를 선언하면 생성기가 선언 파일 `scripts/components/flappy/bird.json`도 쓰고, Lua는 훅의 `params`, Ruby는 `initialize(params)`를 낸다. `GRAVITY`는 옮길 수 있지만 `FLAP`은 `director`도 쓰므로 `bird`의 매개변수로 옮기면 값이 둘로 나뉜다.

B는 같은 그래프를 두 언어의 해석기가 매 틱 걷는다. 생성기 대신 해석기 둘과 에디터 검사기가 필요하고, 위 생성 규칙이 해석기 둘에 똑같이 들어간다.

## 4. 견주기

| | A. 커맨드 목록 | C. 그래프와 생성 코드 |
|---|---|---|
| 누구를 위한가 | 스크립트를 쓰는 사람. `bird`에서 목록은 상태 갈래와 효과음만 적고, 물리는 스크립트 함수 일곱 개에 있다. 스크립트를 쓰지 않는 사람은 `bird`를 만들지 못한다. 대화, 연출, 시간차 이벤트처럼 순서대로 도는 일에 맞다 | 둘 다. 스크립트를 쓰지 않는 사람이 `bird` 전체를 노드로 만든다 (커스텀 노드는 누군가 코드로 준비한다). 스크립트를 쓰는 사람은 생성 코드를 읽는다 |
| 두 언어가 같은가 | 실행기 둘(Lua는 있고 Ruby는 새로)과 스크립트 함수 일곱 개의 두 판이 같아야 한다. 목록의 `"state"`, `"play"`, `"birdVy"`는 문자열이라 Ruby 손 코드의 `st[:state] == :play`, `st[:bird_vy]`와 맞지 않는다. 실행기가 바꾸거나 `director`를 고쳐야 한다 | 그래프 하나를 생성기 둘이 옮긴다. 다른 점은 3절의 생성 규칙에 모이고, 생성한 두 판을 `check_flappy_run`처럼 같은 항목으로 돌려 확인한다 |
| 컴포넌트 훅 | 실행 컴포넌트가 `init`, `update`를 목록으로 넘긴다. 매 틱 트리거는 새 뜻이다 | 생성 파일이 곧 컴포넌트다. 입력, 타이머, 충돌 노드는 `update` 안의 검사로 나온다 |
| 매개변수 (5.4절) | 목록 파일 경로 하나(`string`). 목록 자체를 담을 필드 형식은 없다 | 그래프가 선언하면 생성기가 선언 파일과 두 언어의 받는 코드를 쓴다 |
| 핫 리로드 | 목록 파일이 `scripts/` 아래라 저장하면 지금처럼 VM이 다시 뜬다 | 그래프를 저장하면 생성 파일을 쓰고, 그 저장이 지금의 리로드를 탄다 |
| 오류 줄 링크 | 목록의 문제는 E5처럼 경로(`on.update[2].thenDo[1]`)로 보인다. 실행 중 오류는 `script` 함수면 줄 링크가 있고, 실행기 안이면 `interpreter.lua`의 줄이다 | 링크는 생성 파일의 줄을 가리킨다. 그 줄의 노드 id로 그래프의 노드를 고른다 |
| diff와 합치기 | 좌표가 없는 중첩 JSON이다. 커맨드를 옮기면 옮긴 줄만 바뀐다 | 노드를 보기 좋게 옮기기만 해도 `pos`가 바뀐다. 연결이 id라 두 사람이 한 그래프를 고치면 충돌을 읽기 어렵다. 생성 파일은 충돌해도 합친 그래프에서 다시 만든다. 리뷰는 생성 코드의 diff로 할 수 있다 |
| 매 틱 비용 | 오브젝트마다 목록 걷기, 조건 판정, 코루틴 만들기와 재개가 더해진다. 물리는 스크립트 함수가 하므로 더해지는 것은 해석하는 층이다 | 손 코드와 같다. B라면 그 틱에 도는 갈래의 노드를 매 틱 걷는다 (`bird` 전체는 100개 안팎) |

### 작업 크기

A (엔진과 에디터):

- 엔진: `event-commands.json`(631줄)과 `commands.lua`(617줄)를 범용과 RPG로 나눈다. 둘을 대조하는 `rpg_event_schema_test.lua`도 나눈다.
- 엔진: `interpreter.lua`(382줄)에서 RPG에 묶인 부분(`host.transfer`, `host.characterById`, `messagePort`)을 빼고, 매 틱 트리거와 덜 끝난 목록의 규칙을 정한다. 범용 9종 중 `playSe`, `playBgm`, `scene`도 지금은 RPG 맵 씬의 `host`로 나가고, `script`는 맵 정의 파일의 `scripts` 표에서 찾는다.
- 엔진: Ruby 실행기와 커맨드를 새로 쓴다. mruby의 `Fiber`는 있고, `tests/ruby/cases/rpg_message_test.rb`에 대화와 선택지만 도는 시험용 실행기가 있다.
- 엔진: 두 언어의 실행 컴포넌트, 새 조건(입력, 두 값 비교), `script` 함수를 두 언어에서 찾는 규칙, 두 실행기를 같은 픽스처로 견주는 시험.
- 에디터: `packages/ext-rpg`의 목록 모델(`tree.ts`, `commands.ts`, `schema.ts`, `validate.ts`)과 편집기(`CommandListEditor.tsx`, `commandRows.ts`, `CommandForm.tsx`, `argWidgets`의 기본 입력과 `ConditionArg.tsx`)를 RPG 밖으로 옮긴다. `ArgType`과 `REF_KINDS`에 RPG 값(`face`, `charset`, `route`, `wander`, `map`, `item`, `character`)이 섞여 있어 나눠야 한다. `RefArg`, `RouteArg`, `WanderArg`, `AssetArg`, `LocationTools`는 RPG에 남는다.
- 에디터: 씬 인스펙터에서 실행 컴포넌트의 목록 파일을 여는 단추.

C (에디터만, 엔진은 고치지 않는다):

- 그래프 포맷과 검사기.
- 노드 표: `initial2d-api.json`에서 만드는 API 노드, 손으로 적는 노드(연산, 비교, 수학, `obj`와 `scene`, 공유 상태, 키 이름), 게임이 커스텀 노드를 선언하는 파일.
- 생성기 둘 (3절의 규칙, `Components::Flappy::Bird` 꼴의 클래스, 매개변수와 선언 파일)과 생성 결과를 고정하는 단위 시험.
- 줄과 노드의 대응, 콘솔 링크(`packages/core/src/errorLinks.ts`)에서 노드로 가는 단계.
- 캔버스 편집기: 노드 놓기, 연결, 되돌리기(코어 명령), 고른 노드의 폼(`packages/ui`의 `SchemaFieldInput`). 가장 크다.
- 규칙: 생성 파일의 머리줄, 편집기에서 읽기 전용, 커밋한다 (엔진은 그래프를 읽지 않으므로 에디터 없이 게임을 돌리려면 생성 파일이 있어야 한다). diff를 줄이려면 노드를 한 줄에 하나, id 순서로 쓰고 `pos`를 따로 모은다.
- 교차 시험: 플래피 `bird`를 그래프로 적어 두 판을 생성하고 `check_flappy_run`과 같은 항목으로 돌린다.

## 5. 저자가 정할 것

1. `bird` 같은 매 틱 로직을 스크립트 없이 만들 수 있어야 하는가. 그렇다면 A는 맞지 않는다.
2. Ruby 판도 처음부터 같은 결과를 내야 하는가, Lua 먼저 해도 되는가.
3. 게임의 도우미 모듈(`common`)을 커스텀 노드로 부를 것인가, 전부 노드로 풀 것인가.
4. 생성 파일을 커밋하고 손 편집을 막는 규칙을 받아들이는가.
5. 캔버스 편집기(대 크기)를 바로 만들 것인가, 포맷과 생성기를 먼저 시험할 것인가.

## 6. 권고 (작성자 의견)

C를 권한다. `bird`를 A로 적으면 목록에는 상태 갈래와 효과음만 남고 물리는 두 언어의 스크립트 함수 일곱 개로 가며, 그러고도 Ruby 실행기와 매 틱 트리거를 새로 만들어야 한다. C는 엔진을 고치지 않고, 생성 코드가 손 코드와 같은 길(컴포넌트, 매개변수, 핫 리로드, 오류 링크)로 돈다. 순서는 캔버스 편집기보다 생성기가 먼저다. 그래프 포맷과 생성기 둘을 만들고, 플래피 `bird`의 그래프를 JSON으로 적어 생성한 두 판이 `check_flappy_run`과 같은 항목을 통과하는지 본 뒤에 캔버스 편집기를 정한다. RPG 커맨드 목록은 지금처럼 `ext-rpg`에 둔다.
