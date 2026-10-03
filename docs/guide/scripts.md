# 스크립트 편집

게임 로직은 Lua나 Ruby 스크립트로 작성합니다. 프로젝트 패널에서 `.lua`, `.rb`, `.json` 파일을 열면 코드 편집기가 열립니다.

![스크립트 편집 화면](images/script-editor.png)

## 컴포넌트는 이렇게 생겼습니다

씬의 오브젝트에 붙는 스크립트를 컴포넌트라고 합니다. 엔진이 매 프레임 컴포넌트의 함수를 호출하고, 컴포넌트는 `obj.x`, `obj.y` 같은 값을 바꿔서 오브젝트를 움직입니다. 아래 함수는 모두 필요한 것만 작성하면 됩니다.

| 함수 | 호출되는 때 |
|---|---|
| `init` | 씬이 열릴 때 한 번 |
| `update` | 매 프레임. `elapsed`는 이전 프레임 이후 지난 시간(ms) |
| `render` | 매 프레임, 스프라이트와 텍스트를 그린 다음 |
| `destroy` | 오브젝트가 사라지거나 씬이 닫힐 때 |

```lua
-- scripts/lua/components/spinner.lua
local Spinner = {}

function Spinner.init(obj, scene, params)
  obj.props.angle = 0
end

function Spinner.update(obj, scene, elapsed, params)
  obj.props.angle = obj.props.angle + 90 * elapsed / 1000   -- 1초에 90도
  if Input.IsKeyDown(32) then                                -- 스페이스
    obj.y = obj.y - 2
  end
end

return Spinner
```

```ruby
# scripts/ruby/components/spinner.rb
class Spinner
  def init(obj, scene)
    obj.props["angle"] = 0
  end

  def update(obj, scene, elapsed)
    obj.props["angle"] += 90 * elapsed / 1000.0
  end
end
```

### obj와 scene으로 할 수 있는 것

| 이름 | 내용 |
|---|---|
| `obj.id`, `obj.type` | 씬에서 정한 id와 종류 |
| `obj.x`, `obj.y`, `obj.visible` | 위치와 표시 여부. 바꾸면 그 프레임에 바로 적용됩니다 |
| `obj.props` | 종류별 속성 (이미지, 텍스트, 배율, 각도, 투명도 등) |
| `obj.animate` | `false`로 바꾸면 스프라이트 애니메이션이 멈춥니다 |
| `scene:find(id)` | 같은 씬에 있는 다른 오브젝트 찾기 |
| `scene:spawn(spec)`, `scene:remove(id)` | 오브젝트 만들기, 없애기 |
| `scene:switch(name)` | 다음 프레임에 다른 씬으로 전환 |
| `scene.state` | 같은 씬의 컴포넌트끼리 함께 쓰는 값 (점수 등) |

Ruby에서는 `scene.find(id)`, `scene.switch(name)`처럼 메서드로 호출합니다. 입력, 소리, 그리기 같은 엔진 함수는 [엔진 API 레퍼런스](https://github.com/biud436/Initial2D#lua-대응표)에서 찾아볼 수 있습니다.

## 새 스크립트 만들기

**파일 > 새 스크립트**(Ctrl+Alt+N)를 선택하고 종류, 언어, 이름을 정합니다.

- **컴포넌트**: 오브젝트에 붙이는 스크립트입니다. 위의 네 함수가 미리 들어 있습니다.
- **씬 스크립트**: 엔진이 직접 호출하는 진입점(`main.lua`, `main.rb`)입니다. 템플릿으로 만든 프로젝트에는 이미 들어 있으니 보통은 새로 만들 일이 없습니다.

이름에 `/`를 넣으면 하위 폴더에 만들어집니다 (예: `components/enemies/bat`). 씬 인스펙터의 **스크립트 추가**로 만들어도 결과는 같습니다 ([씬 편집](scenes.md#컴포넌트-붙이기)).

## 자동 완성과 오류 표시

코드를 입력하는 동안 엔진 API(`Input.`, `Audio.` 등)와 프로젝트에 있는 함수가 자동 완성 목록에 나옵니다. `(`를 입력하면 매개변수 설명이 뜨고, 진입점 스크립트에서는 엔진이 호출하는 함수(`Initialize`, `Update`, `Render`, `Destroy`)의 뼈대를 넣어 줍니다.

데스크톱 앱에서 Lua 스크립트를 열면 언어 서버(LuaLS)가 함께 실행되어 다음 기능을 쓸 수 있습니다.

| 기능 | 사용 방법 |
|---|---|
| 오류와 경고 (물결 밑줄) | 입력하는 동안 자동으로 표시됩니다. 마우스를 올리면 설명이 나옵니다 |
| 정의로 이동 | F12 또는 Ctrl+클릭 |
| 참조 찾기 | Shift+F12 |
| 이름 바꾸기 | F2. 여러 파일에 걸쳐 있으면 해당 파일들이 열리고, 저장해야 적용됩니다 |
| 기호로 이동 | Ctrl+Shift+O |
| 설명 보기 | 이름 위에 마우스를 올립니다 |

Ruby 스크립트와 웹판의 Lua 스크립트에서는 언어 서버 대신 구문 분석기가 동작합니다. 구문 오류 표시, 정의로 이동(F12), 기호로 이동(Ctrl+Shift+O)을 쓸 수 있습니다.

- 상태 바에서 언어 서버 이름과 상태를 볼 수 있습니다. 응답이 없으면 **도구 > 언어 서버 다시 시작**을 선택하세요.
- 경고가 너무 많거나 적다면 **도구 > 설정**의 **진단 표시**에서 표시 안 함, 구문 오류만, 규칙 전체 중 하나를 고르세요. 규칙은 프로젝트의 `.luarc.json`에 있으며, VS Code의 Lua 확장도 같은 파일을 읽습니다.

## 찾기

- **Ctrl+F**: 열려 있는 파일에서 찾기
- **Ctrl+Shift+F**: 프로젝트 전체에서 찾기. 대소문자 구분과 정규식을 쓸 수 있고, 결과를 클릭하면 해당 줄로 이동합니다.

## 저장하면 바로 적용

**Ctrl+S**로 저장합니다. 게임이 실행 중이라면 저장한 스크립트가 바로 게임에 적용됩니다. 이 기능을 핫 리로드라고 하며, **도구 > 설정**의 **저장 시 리로드**로 켜고 끕니다. 핫 리로드는 스크립트를 처음부터 다시 불러오기 때문에 점수 같은 진행 상황은 처음으로 돌아갑니다.

다른 프로그램에서 파일을 고친 경우, 편집하고 있지 않은 파일은 알아서 다시 불러오고, 편집 중인 파일은 위쪽 알림에서 어느 내용을 남길지 물어봅니다. 저장하려는 순간 디스크의 파일이 바뀌어 있었다면 덮어쓸지 한 번 더 확인합니다.

## 읽기 전용 파일

[비주얼 스크립팅](visual-scripting.md)으로 만든 스크립트는 첫 줄이 `-- 그래프에서 만든 파일:`로 시작하며, 편집기에서 읽기 전용으로 열립니다. 고치려면 위쪽의 **그래프 열기**를 눌러 원본 그래프를 편집하세요.
