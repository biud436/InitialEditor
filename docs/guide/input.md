# 입력

엔진은 틱마다(16ms) 키보드, 마우스, 터치 장치의 상태를 읽어 저장합니다. 스크립트의 입력 함수는 이 틱의 상태와 이전 틱의 상태를 비교한 결과를 반환합니다.

## 키 상태

| 함수 (Lua) | 함수 (Ruby) | 참이 되는 조건 |
|---|---|---|
| `Input.IsKeyDown(key)` | `Input.key_down?(key)` | 이전 틱에 떼어져 있었고 이번 틱에 눌려 있음. 누른 첫 틱 한 번만 참 |
| `Input.IsKeyPress(key)` | `Input.key_press?(key)` | 이전 틱과 이번 틱 모두 눌려 있음 |
| `Input.IsKeyUp(key)` | `Input.key_up?(key)` | 이전 틱에 눌려 있었고 이번 틱에 떼어짐. 뗀 첫 틱 한 번만 참 |
| `Input.IsAnyKeyDown()` | `Input.any_key_down?` | 이번 틱에 `IsKeyDown` 상태인 키가 하나 이상 있음 |

> **주의**: `IsKeyPress`는 키를 누른 첫 틱에는 거짓입니다. "누르고 있는 동안 계속"을 판정하려면 `IsKeyDown(key) or IsKeyPress(key)`를 사용합니다. `IsKeyPress`만 쓰면 첫 틱의 입력이 빠집니다.

두 틱 사이에 눌렀다가 뗀 짧은 입력도 사라지지 않습니다. 이런 입력은 다음 틱에 한 번 눌림(`IsKeyDown`)으로, 그다음 틱에 떼어짐(`IsKeyUp`)으로 처리됩니다.

## 키 코드

키는 숫자 코드로 지정합니다. 코드는 운영체제와 관계없이 Windows 가상 키 코드와 같은 값을 사용합니다.

| 키 | 코드 |
|---|---|
| Enter | 13 |
| Shift, Ctrl, Alt | 16, 17, 18 (왼쪽, 오른쪽 구분 없음) |
| Esc | 27 (Android의 뒤로 가기 버튼 포함) |
| Space | 32 |
| 왼쪽, 위, 오른쪽, 아래 화살표 | 37, 38, 39, 40 |
| 0~9 | 48~57 |
| A~Z | 65~90 |
| 숫자 패드 0~9 | 96~105 |
| F1~F12 | 112~123 |

그 밖에 Backspace, Tab, Page Up, Page Down, Home, End, Insert, Delete를 사용할 수 있습니다.

> **주의**: 위 목록에 없는 키(문장 부호, 숫자 패드의 Enter와 연산자 키, Pause 등)는 엔진이 읽지 않으므로 항상 거짓입니다.

Lua에는 키 이름 상수가 없으므로 숫자를 직접 쓰거나 지역 상수를 정의합니다. Ruby는 `Keys` 모듈의 상수와 기호(`:space`, `:left` 등)를 사용할 수 있습니다. 비주얼 스크립팅의 입력 노드는 키 이름 목록(`SPACE`, `RIGHT` 등)에서 선택합니다.

## 마우스

| 함수 (Lua) | 의미 |
|---|---|
| `Input.IsMouseDown(button)`, `IsMouseUp`, `IsMousePress` | 버튼 상태. 판정 규칙은 키와 같습니다 |
| `Input.GetMouseX()`, `Input.GetMouseY()` | 커서 위치 (논리 좌표) |

버튼 번호는 0이 왼쪽, 1이 오른쪽, 2가 가운데입니다. Ruby에서는 `:left`, `:right`, `:middle`도 사용할 수 있습니다.

> **주의**: 마우스 좌표는 논리 좌표입니다. 렌더 배율이 2이면 창의 (200, 200) 위치는 (100, 100)으로 반환됩니다.

## 터치

모바일 기기에서는 `Input.GetTouchCount()`와 `Input.GetTouch(i)`로 터치 지점을 읽습니다. 각 지점은 id, x, y, 단계(`down`, `press`, `up`)를 가집니다. 최대 10개 지점을 읽습니다. Lua의 `GetTouch`는 1부터, Ruby의 `touch`는 0부터 번호를 셉니다.

> **주의**: 첫 번째 손가락의 터치는 마우스 왼쪽 버튼(0)으로도 전달됩니다. 마우스 입력과 터치 입력을 함께 처리하면 같은 동작이 두 번 실행될 수 있습니다.
