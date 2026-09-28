-- 데모 게임 「떠나기 전에」 — 타이틀 씬 (기획서 docs/design/port-town.md)
--
-- 배경 그림 한 장과 커서 메뉴 하나가 전부다. 메뉴는 대화창에 쓰던 창과 선택지
-- (scripts/lua/rpg/window.lua, choice.lua)를 그대로 재사용한다 — 대화 전용이 아니라
-- 공용품이라는 것을 보이는 자리이기도 하다. 여기서는 스킨 배율 3, 32픽셀 폰트로
-- 쓰고, 맵 씬에서는 배율 1, 16픽셀 폰트로 쓴다.
--
--   방향키 위아래: 항목 이동      Z / Enter / Space: 결정
--   터치: 항목을 직접 누른다      ESC / 뒤로가기: 게임 종료
--
-- 배경은 tools/generate_title.py 로 다시 만든다.

local Image = require("scripts/lua/image")
local Window = require("scripts/lua/rpg/window")
local Choice = require("scripts/lua/rpg/choice")
local Dialogue = require("scripts/lua/rpg/message")
local Assets = require("scripts/lua/rpg/assets")
local Bgm = require("scripts/lua/bgm")

RpgDemoTitleScene = {}

local BACKGROUND = "./resources/titles/port_title.png"
local BASE_FONT = "./resources/fonts/hangul.fnt"
local SE_CURSOR = "./resources/audio/ui_cursor.wav"
local SE_DECISION = "./resources/audio/ui_decision.wav"
local SE_TEXT = "./resources/audio/ui_text.wav"
-- 타이틀 BGM. 저자의 자작곡이다 (docs/music/bless-analysis.md).
local TITLE_BGM = "./resources/audio/bless.ogg"
local TITLE_BGM_VOLUME = 88

local SKIN_SCALE = 3        -- 160x80 스킨을 768x896 화면에 맞게
local LINE_HEIGHT = 48      -- 32픽셀 폰트 기준 줄 간격
local MENU_WIDTH = 260
-- 메뉴는 화면 가운데가 아니라 왼쪽에 둔다. 가운데에 놓으면 배와 부두를 가린다.
local MENU_X = 84
local MENU_Y = 616
local AUTOPLAY_START_FRAME = 60

local VK_ESCAPE, VK_RETURN, VK_SPACE, VK_Z = 27, 13, 32, 90
local VK_UP, VK_DOWN, VK_X = 38, 40, 88

local ITEMS = { "시작", "조작 방법", "나가기" }
local START, HELP, LEAVE = 1, 2, 3

local HELP_TEXT = "방향키로 걷고, Z 키로 말을 겁니다. 대화 중에는 Z로 넘기고, "
	.. "선택지에서는 위아래로 고른 뒤 Z로 결정합니다. X는 취소입니다. "
	.. "터치 기기에서는 왼쪽 아래 패드로 걷고, 오른쪽 아래의 결정과 취소 버튼을 "
	.. "누릅니다. ESC나 뒤로가기를 누르면 목록으로 돌아옵니다."

local W, H = 768, 896
local bg, skin, choice, help = nil, nil, nil, nil
local frame = 0
local leaving = nil      -- 결정한 항목 (효과음이 들리게 몇 프레임 두고 나간다)
local leaveTimer = 0
local LEAVE_DELAY = 12

local function playSe(path, id)
	return function() Audio.PlaySound(path, id, 0) end
end

local function openMenu(index)
	choice:show(ITEMS, { x = MENU_X, y = MENU_Y, index = index })
end

--- 지금 씬의 상태. 8단계 시나리오 테스트가 이 값을 읽어 커서와 도움말을 본다
-- (씬 바깥에서 상태를 들여다볼 창구는 이것 하나뿐이다).
function RpgDemoTitleScene.status()
	return {
		items = #ITEMS,
		index = choice ~= nil and choice.index or nil,
		menuOpen = choice ~= nil and choice:isActive()
			and choice.window ~= nil and choice.window:isOpen() or false,
		helpOpen = help ~= nil and help:isBusy() or false,
		leaving = leaving,
	}
end

function RpgDemoTitleScene.init()
	W, H = WindowWidth(), WindowHeight()
	frame, leaving, leaveTimer = 0, nil, 0

	if FontReady then PreparaFont(BASE_FONT) end

	bg = Image(BACKGROUND, 0, 0, W, H, 1, "Title")
	bg.update(0)

	skin = Window.newSkin{ path = Assets.windowskin(), scale = SKIN_SCALE }

	local se = {
		cursor = playSe(SE_CURSOR, "uiCursor"),
		decision = playSe(SE_DECISION, "uiDecision"),
		text = playSe(SE_TEXT, "uiText"),
	}

	choice = Choice.new{
		skin = skin, measure = GetTextWidth, drawText = DrawText,
		lineHeight = LINE_HEIGHT, maxVisible = #ITEMS, minWidth = MENU_WIDTH,
		se = se,
	}
	help = Dialogue.new{
		skin = skin, measure = GetTextWidth, drawText = DrawText,
		screenW = W, screenH = H, lines = 4, lineHeight = LINE_HEIGHT,
		speed = 3, se = se,
	}

	openMenu(1)
	Bgm.play(TITLE_BGM, { volume = TITLE_BGM_VOLUME })
end

--- 이번 프레임에 눌린 키 (창과 선택지는 엣지를 본다)
local function pollInput()
	return {
		confirm = Input.IsKeyDown(VK_Z) or Input.IsKeyDown(VK_RETURN)
			or Input.IsKeyDown(VK_SPACE),
		up = Input.IsKeyDown(VK_UP),
		down = Input.IsKeyDown(VK_DOWN),
		cancel = Input.IsKeyDown(VK_X),
	}
end

--- 터치: 항목을 직접 누르면 커서를 옮기고 그대로 결정한다.
-- 도움말이 떠 있을 때는 아무 데나 눌러 넘긴다.
local function pollTouch(input)
	if not Input.IsMouseDown(0) then return input end
	local mx, my = Input.GetMouseX(), Input.GetMouseY()

	if help:isBusy() then
		input.confirm = true
		return input
	end

	local index = choice:indexAt(mx, my)
	if index ~= nil then
		choice.index = index
		input.confirm = true
	end
	return input
end

function RpgDemoTitleScene.update(elapsed)
	frame = frame + 1

	if leaving ~= nil then
		leaveTimer = leaveTimer + 1
		choice:update(nil)
		help:update({}, false)
		if leaveTimer >= LEAVE_DELAY then
			if leaving == START then SwitchScene("rpg") else GameExit() end
		end
		return
	end

	local input = pollTouch(pollInput())

	if AUTOPLAY and frame == AUTOPLAY_START_FRAME then
		input.confirm = true     -- 자동 시연은 커서를 그대로 두고 "시작"
	end

	if help:isBusy() then
		-- 도움말이 떠 있는 동안에는 메뉴가 입력을 받지 않는다
		help:update(input, false)
		if not help:isBusy() then
			openMenu(HELP)
		end
		choice:update(nil)
	else
		help:update({}, false)
		choice:update(input)

		if not choice:isActive() then
			local picked = choice:result()
			if picked == HELP then
				help:showMessage(HELP_TEXT)
			else
				leaving, leaveTimer = picked or LEAVE, 0
			end
		end
	end

	if Input.IsKeyDown(VK_ESCAPE) then
		GameExit()
	end
end

function RpgDemoTitleScene.render()
	bg.draw()
	choice:draw()
	help:draw()
end

function RpgDemoTitleScene.destroy()
	if bg ~= nil then bg.dispose() end
	if help ~= nil then help:dispose() end
	if choice ~= nil then choice:dispose() end
	if skin ~= nil then skin:dispose() end
	bg, help, choice, skin = nil, nil, nil, nil
end

return RpgDemoTitleScene
