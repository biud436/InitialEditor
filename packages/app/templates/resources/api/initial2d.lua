---@meta
-- Initial2D 스크립트 API 스텁 (Lua, EmmyLua / LuaLS 주석)
-- tools/gen_api_stubs.py 가 resources/api/initial2d-api.json 에서 만든다. 손으로 고치지 않는다.
-- 에디터 자동완성용이며 엔진이 읽지 않는다 (같은 이름은 엔진이 C++ 로 등록한다).
-- 명세 version 1
--
-- 씬 계약: 엔진이 부르는 전역 함수 (Lua 는 넷 다 정의해야 한다)
--   function Initialize() end          처음 1번 호출
--   function Update(elapsed_ms) end    고정 스텝마다 호출 (경과 시간은 ms)
--   function Render() end              매 프레임 그리기 단계에서 호출
--   function Destroy() end             종료 시 1번 호출

---Sprite 의 숫자 핸들 (Sprite 표의 함수에 첫 인자로 넘긴다)
---@alias SpriteHandle number

---Tilemap 의 숫자 핸들 (Tilemap 표의 함수에 첫 인자로 넘긴다)
---@alias TilemapHandle number

---FontEx 의 숫자 핸들 (FontEx 표의 함수에 첫 인자로 넘긴다)
---@alias FontExHandle number

-- Graphics: 화면 크기, 렌더 배율, 비트맵 폰트 텍스트, 점 그리기 (Lua 는 전역 함수)

---논리 해상도 너비 (px, 렌더 배율로 나눈 값)
---@return integer
function WindowWidth() end

---논리 해상도 높이 (px, 렌더 배율로 나눈 값)
---@return integer
function WindowHeight() end

---현재 픽셀 확대 배율
---@return integer
function GetRenderScale() end

---픽셀 확대 배율 설정. 적용된 값 반환 (1 에서 16 사이로 제한)
---@param scale integer
---@return integer
function SetRenderScale(scale) end

---최근 초당 프레임 수 (FPS, SDL2 백엔드는 보통 60)
---@return integer
function GetFrameCount() end

---비트맵 폰트(.fnt)를 로드해 텍스트 그리기에 사용. 로드에 성공하면 true
---@param path string BMFont .fnt 파일 경로
---@return boolean
function PreparaFont(path) end

---로드한 비트맵 폰트로 텍스트 그리기. 그린 너비(px) 반환 (폰트가 없으면 0)
---@param x number
---@param y number
---@param text string
---@return number
function DrawText(x, y, text) end

---DrawText 의 별칭
---@param x number
---@param y number
---@param text string
---@return number
function draw_text(x, y, text) end

---텍스트 너비 (px, 그리지 않고 측정, 폰트가 없으면 0)
---@param text string
---@return number
function GetTextWidth(text) end

---draw_point 의 색 설정 (Lua 는 인자 4개 모두 필요, 0 반환)
---@param r integer
---@param g integer
---@param b integer
---@param a integer
---@return number
function draw_set_color(r, g, b, a) end

---점 1개 그리기 (색은 Lua 는 draw_set_color, Ruby 는 set_color 로 설정, Lua 는 0 반환)
---@param x integer
---@param y integer
---@return number
function draw_point(x, y) end

-- System: 플랫폼, 종료, 경로, 리소스 목록, 메시지 상자, 환경 변수 (Lua 는 전역 함수)

---실행 중인 플랫폼 이름 (windows, macos, linux, android, ios 또는 SDL 이 보고하는 소문자 이름)
---@return string
function GetPlatform() end

---현재 프레임 처리 후 게임 종료
function GameExit() end

---작업 디렉터리 경로 (Ruby 는 항상 / 구분자, Lua 는 인자를 지정하면 \ 를 / 로 변환)
---@param slash? any 지정하면 경로 구분자를 / 로 변환
---@return string
function GetCurrentDirectory(slash) end

---./resources 아래 파일의 경로 목록 (하위 폴더 포함, 예: ./resources/maps/sample.json)
---@return string[]
function GetResourcesFiles() end

---메시지 상자 표시 (첫 번째 인자는 본문, 두 번째는 제목)
---@param text string 본문
---@param caption? string 제목, 기본값 ""
function MessageBox(text, caption) end

---창 아이콘을 이미지 파일로 변경
---@param path string
function SetAppIcon(path) end

-- Kernel: 스크립트 파일 로드와 출력 (Lua 는 전역 함수, Ruby 는 수신자 없이 호출하는 Kernel 메서드)

---Lua 파일을 로드해 실행. 실패해도 알림 없음 (Ruby 의 load 에 해당)
---@param path string
function LoadScript(path) end

---표준 print 대체. 인자를 구분자 없이 이어 출력하고 줄바꿈 (문자열과 숫자만 출력, 인자 1개 이상 필요)
---@param ... any
function print(...) end

---키보드, 마우스, 멀티터치 입력 (고정 스텝마다 상태 갱신)
---@class Input
Input = {}

---이번 틱에 눌렸으면 true
---@param key integer 가상 키 코드 (Ruby 는 Keys 상수 이름의 Symbol 도 허용)
---@return boolean
function Input.IsKeyDown(key) end

---이번 틱에 떼었으면 true
---@param key integer 가상 키 코드 (Ruby 는 Keys 상수 이름의 Symbol 도 허용)
---@return boolean
function Input.IsKeyUp(key) end

---눌린 상태면 true
---@param key integer 가상 키 코드 (Ruby 는 Keys 상수 이름의 Symbol 도 허용)
---@return boolean
function Input.IsKeyPress(key) end

---이번 틱에 아무 키나 눌렸으면 true
---@return boolean
function Input.IsAnyKeyDown() end

---마우스 x (논리 좌표)
---@return number
function Input.GetMouseX() end

---마우스 y (논리 좌표)
---@return number
function Input.GetMouseY() end

---이번 틱에 마우스 버튼이 눌렸으면 true
---@param button integer 0 왼쪽, 1 오른쪽, 2 가운데 (Ruby 는 :left, :right, :middle 도 허용)
---@return boolean
function Input.IsMouseDown(button) end

---이번 틱에 마우스 버튼을 떼었으면 true
---@param button integer 0 왼쪽, 1 오른쪽, 2 가운데 (Ruby 는 :left, :right, :middle 도 허용)
---@return boolean
function Input.IsMouseUp(button) end

---마우스 버튼이 눌린 상태면 true
---@param button integer 0 왼쪽, 1 오른쪽, 2 가운데 (Ruby 는 :left, :right, :middle 도 허용)
---@return boolean
function Input.IsMousePress(button) end

---이번 틱에 아무 마우스 버튼이나 눌렸으면 true
---@return boolean
function Input.IsAnyMouseDown() end

---마우스 휠 값 (올림 -1, 내림 1)
---@return integer
function Input.GetMouseZ() end

---마우스 휠 값 설정
---@param wheel integer
function Input.SetMouseZ(wheel) end

---이번 틱의 터치 수 (뗀 터치도 1틱 동안 포함, GDI 는 항상 0)
---@return integer
function Input.GetTouchCount() end

---터치 1개의 id, x, y, 단계(down, press, up). 범위 밖이면 nil
---@param index integer Lua 는 1 부터, Ruby 는 0 부터
---@return integer|nil
---@return number
---@return number
---@return string
function Input.GetTouch(index) end

---배경 음악과 효과음 (SDL_mixer, 파일은 재생 시 로드하고 id 로 구분)
---@class Audio
Audio = {}

---음악 파일을 로드해 배경 음악으로 재생 (Lua 는 loop 까지 인자 3개 모두 필요). Ruby 는 로드에 성공하면 true
---@param path string
---@param id string
---@param loop boolean|integer true 무한 반복, false 1회, 숫자는 SDL_mixer 루프 값 그대로
function Audio.PlayMusic(path, id, loop) end

---효과음 파일을 로드해 재생 (Lua 는 loop 까지 인자 3개 모두 필요). Ruby 는 로드에 성공하면 true
---@param path string
---@param id string
---@param loop boolean|integer true 무한 반복, false 1회, 숫자는 SDL_mixer 루프 값 그대로
function Audio.PlaySound(path, id, loop) end

---배경 음악 볼륨 설정 (0..255 를 SDL_mixer 의 0..128 로 변환)
---@param volume integer 0 에서 255
function Audio.SetVolume(volume) end

---배경 음악 볼륨 (SDL_mixer 의 0..128)
---@return integer
function Audio.GetVolume() end

---현재 곡이 끝난 뒤 재생할 음악 예약 (Lua 는 loop 까지 인자 3개 모두 필요). Ruby 는 로드에 성공하면 true
---@param path string
---@param id string
---@param loop boolean|integer true 무한 반복, false 1회, 숫자는 SDL_mixer 루프 값 그대로
function Audio.InsertNextMusic(path, id, loop) end

---배경 음악 일시 정지
function Audio.PauseMusic() end

---배경 음악 정지
function Audio.StopMusic() end

---일시 정지한 배경 음악 재개
function Audio.ResumeMusic() end

---배경 음악 재생 중이면 true
---@return boolean
function Audio.IsPlayingMusic() end

---ms 동안 페이드 아웃 후 배경 음악 정지
---@param ms integer
function Audio.FadeOutMusic(ms) end

---배경 음악 재생 위치(초) 이동
---@param seconds number
function Audio.SetMusicPosition(seconds) end

---로드한 음악을 메모리에서 해제
---@param id string
function Audio.ReleaseMusic(id) end

---JSON 읽기 (객체는 Lua 테이블이나 Hash, 배열은 배열, null 은 nil)
---@class Json
Json = {}

---JSON 파일 읽기. 실패 시 Lua 는 nil 과 오류 메시지, Ruby 는 RuntimeError
---@param path string
---@return any
---@return string|nil
function Json.Load(path) end

---텍스처 캐시 (이미지를 id 로 등록, 스프라이트가 id 로 참조)
---@class TextureManager
TextureManager = {}

---이미지 파일을 텍스처로 로드해 id 로 등록. 로드에 성공하면 true
---@param path string
---@param id string
---@return boolean
function TextureManager.Load(path, id) end

---id 의 텍스처 해제 (등록되지 않은 id 도 true)
---@param id string
---@return boolean
function TextureManager.Remove(id) end

---id 로 등록된 텍스처가 있으면 true
---@param id string
---@return boolean
function TextureManager.IsValid(id) end

---텍스처 1장을 그리는 스프라이트 (시트 애니메이션, 회전, 확대, 불투명도)
---@class Sprite
Sprite = {}

---스프라이트 생성. 텍스처는 TextureManager 에 먼저 등록 필요 (Lua 는 인자가 부족하면 0 반환)
---@param x number
---@param y number
---@param width integer
---@param height integer
---@param max_frames integer
---@param texture_id string TextureManager 에 등록한 id
---@return SpriteHandle
function Sprite.Create(x, y, width, height, max_frames, texture_id) end

---경과 시간만큼 애니메이션 진행 후 변환(위치, 확대, 회전) 적용
---@param handle SpriteHandle
---@param elapsed number ms
function Sprite.Update(handle, elapsed) end

---화면에 그리기
---@param handle SpriteHandle
function Sprite.Draw(handle) end

---위치 (x, y)
---@param handle SpriteHandle
---@return number
---@return number
function Sprite.GetPosition(handle) end

---위치 설정
---@param handle SpriteHandle
---@param x number
---@param y number
function Sprite.SetPosition(handle, x, y) end

---확대 배율
---@param handle SpriteHandle
---@return number
function Sprite.GetScale(handle) end

---확대 배율 설정
---@param handle SpriteHandle
---@param scale number
function Sprite.SetScale(handle, scale) end

---한 프레임 너비 (px)
---@param handle SpriteHandle
---@return number
function Sprite.GetWidth(handle) end

---한 프레임 높이 (px)
---@param handle SpriteHandle
---@return number
function Sprite.GetHeight(handle) end

---회전 각도(도)
---@param handle SpriteHandle
---@return number
function Sprite.GetAngle(handle) end

---회전 각도(도) 설정
---@param handle SpriteHandle
---@param degrees number
function Sprite.SetAngle(handle, degrees) end

---회전 각도(라디안)
---@param handle SpriteHandle
---@return number
function Sprite.GetRadians(handle) end

---회전 각도(라디안) 설정
---@param handle SpriteHandle
---@param radians number
function Sprite.SetRadians(handle, radians) end

---보이는 상태면 true
---@param handle SpriteHandle
---@return boolean
function Sprite.GetVisible(handle) end

---표시 여부 설정
---@param handle SpriteHandle
---@param visible boolean
function Sprite.SetVisible(handle, visible) end

---불투명도 (0..255)
---@param handle SpriteHandle
---@return number
function Sprite.GetOpacity(handle) end

---불투명도 설정
---@param handle SpriteHandle
---@param opacity integer 0 에서 255
function Sprite.SetOpacity(handle, opacity) end

---프레임 사이 시간(ms)
---@param handle SpriteHandle
---@return number
function Sprite.GetFrameDelay(handle) end

---프레임 사이 시간 설정
---@param handle SpriteHandle
---@param delay number ms
function Sprite.SetFrameDelay(handle, delay) end

---애니메이션 프레임 범위 설정 (last 는 마지막 프레임의 다음 번호)
---@param handle SpriteHandle
---@param first integer
---@param last integer 마지막 프레임의 다음 번호
function Sprite.SetFrames(handle, first, last) end

---애니메이션 첫 프레임
---@param handle SpriteHandle
---@return number
function Sprite.GetStartFrame(handle) end

---애니메이션 마지막 프레임
---@param handle SpriteHandle
---@return number
function Sprite.GetEndFrame(handle) end

---현재 프레임
---@param handle SpriteHandle
---@return number
function Sprite.GetCurrentFrame(handle) end

---현재 프레임 설정
---@param handle SpriteHandle
---@param frame integer
function Sprite.SetCurrentFrame(handle, frame) end

---애니메이션 반복 여부 설정
---@param handle SpriteHandle
---@param loop boolean
function Sprite.SetLoop(handle, loop) end

---애니메이션이 끝났으면 true
---@param handle SpriteHandle
---@return boolean
function Sprite.GetAnimComplete(handle) end

---애니메이션 완료 상태 설정
---@param handle SpriteHandle
---@param complete boolean
function Sprite.SetAnimComplete(handle, complete) end

---시트 분할 설정 (열 수 cols, 행 수 rows, 기본 4x4, R2K3 CharSet 은 3x4)
---@param handle SpriteHandle
---@param cols integer
---@param rows integer
function Sprite.SetSheetGrid(handle, cols, rows) end

---소스 사각형 (텍스처에서 잘라 그리는 영역). Lua 는 width, height 키에 오른쪽, 아래 좌표가 들어 있음. Ruby 는 x, y, right, bottom, width, height 키
---@param handle SpriteHandle
---@return table
function Sprite.GetRect(handle) end

---소스 사각형 설정 (텍스처에서 잘라 그릴 영역, x, y, width, height 키를 가진 테이블 1개도 허용)
---@param handle SpriteHandle
---@param x integer
---@param y integer
---@param width integer
---@param height integer
---@overload fun(handle: SpriteHandle, rect: table)
function Sprite.SetRect(handle, x, y, width, height) end

---스프라이트 해제 (텍스처는 해제하지 않음)
---@param handle SpriteHandle
function Sprite.Dispose(handle) end

---맵 포맷 v1, v2 JSON 을 로드해 그리는 다층 타일맵 (x, y 는 0부터 세는 타일 좌표)
---@class Tilemap
Tilemap = {}

---맵 파일 로드. 실패 시 nil (Lua 는 오류 메시지도 반환)
---@param path string
---@return TilemapHandle|nil
---@return string|nil
function Tilemap.Load(path) end

---레이어 범위를 카메라 오프셋을 적용해 그리기 (화면에 보이는 타일만)
---@param handle TilemapHandle
---@param layer_from integer Lua 는 1 부터, Ruby 는 0 부터
---@param layer_to integer 양 끝 포함
---@param cam_x? integer 월드 픽셀, 기본값 0
---@param cam_y? integer 월드 픽셀, 기본값 0
function Tilemap.Draw(handle, layer_from, layer_to, cam_x, cam_y) end

---맵 크기 (너비 타일 수, 높이 타일 수, 타일 너비 px, 타일 높이 px, 레이어 수)
---@param handle TilemapHandle
---@return integer
---@return integer
---@return integer
---@return integer
---@return integer
function Tilemap.GetSize(handle) end

---타일 gid (빈 타일과 범위 밖은 0)
---@param handle TilemapHandle
---@param x integer
---@param y integer
---@param layer integer Lua 는 1 부터, Ruby 는 0 부터
---@return integer
function Tilemap.GetTileId(handle, x, y, layer) end

---타일 gid 변경. 변경하면 true, 범위 밖이면 false
---@param handle TilemapHandle
---@param x integer
---@param y integer
---@param layer integer Lua 는 1 부터, Ruby 는 0 부터
---@param gid integer
---@return boolean
function Tilemap.SetTileId(handle, x, y, layer, gid) end

---타일 좌표 (x, y)가 통행 가능하면 true (범위 밖은 false)
---@param handle TilemapHandle
---@param x integer
---@param y integer
---@return boolean
function Tilemap.IsPassable(handle, x, y) end

---타일맵 해제 (타일셋 텍스처는 TextureManager 에 남음)
---@param handle TilemapHandle
function Tilemap.Dispose(handle) end

---시스템 폰트로 텍스트 텍스처를 만드는 동적 폰트 (Windows 전용, macOS 와 Android 는 동작 없는 스텁)
---@class FontEx
FontEx = {}

---폰트 이름, 크기, 텍스처 크기로 생성 (Lua 는 인자가 부족하면 0 반환)
---@param face string 폰트 이름
---@param size integer
---@param width integer
---@param height integer
---@return FontExHandle
function FontEx.Create(face, size, width, height) end

---갱신 (현재 동작 없음)
---@param handle FontExHandle
---@param elapsed number ms
function FontEx.Update(handle, elapsed) end

---화면에 그리기
---@param handle FontExHandle
function FontEx.Draw(handle) end

---표시할 텍스트 설정
---@param handle FontExHandle
---@param text string
function FontEx.SetText(handle, text) end

---위치 설정
---@param handle FontExHandle
---@param x integer
---@param y integer
function FontEx.SetPosition(handle, x, y) end

---텍스트 색 설정
---@param handle FontExHandle
---@param r integer
---@param g integer
---@param b integer
function FontEx.SetTextColor(handle, r, g, b) end

---불투명도 설정
---@param handle FontExHandle
---@param opacity integer 0 에서 255
function FontEx.SetOpacity(handle, opacity) end

---회전 각도(도) 설정
---@param handle FontExHandle
---@param degrees number
function FontEx.SetAngle(handle, degrees) end

---텍스트 너비 (px)
---@param handle FontExHandle
---@param text string
---@return number
function FontEx.GetTextWidth(handle, text) end

---폰트 해제
---@param handle FontExHandle
function FontEx.Dispose(handle) end
