-- 데모 게임 "작은 마을" — 맵 씬 (5~8단계 산출물, docs/plans/08-demo.md)
--
-- 맵 위를 걸어다니고, NPC에게 말을 걸면 얼굴이 있는 대화창이 뜨고, 선택지에 따라
-- 대사가 갈린다. 문을 밟으면 다른 맵으로 이동한다.
--   방향키 또는 가상 D-패드: 이동, 선택지 커서
--     - 정지 중에 다른 방향키를 짧게 누르면 이동 없이 방향만 바뀐다 (R2K3식)
--   Z / Enter / Space (터치는 결정 버튼): 말 걸기, 대화 넘기기, 선택지 결정
--   X (터치는 취소 버튼): 소지품 창 열고 닫기, 선택지 취소
--   ESC 또는 Android 뒤로가기: 타이틀로
--
-- 맵 등록(이름, 맵 파일, 정의 파일)은 resources/data/rpg-game.json 에 있다 (config.lua).
-- 이벤트는 맵 파일의 events 와 정의 파일 scripts/lua/maps/<이름>.lua 양쪽에서 온다.
-- 맵 파일의 이벤트는 열 때 검사해 틀린 것만 건너뛰고 rpg:error 줄을 찍는다
-- (docs/plans/m2-rpg-events.md). ctx.transfer 요청이 오면 페이드를 걸고 다시 세운다.
--
-- 16px 타일을 768x896 화면에 1:1로 그리면 캐릭터가 점처럼 보이므로 렌더 배율
-- 2를 켠다 (논리 해상도 384x448). 씬을 나갈 때 1로 되돌린다.
--
-- 환경 변수
--   INITIAL2D_MAP       시작 맵 이름 (rpg-game.json 의 maps[].name)
--   INITIAL2D_CHARSET   다른 CharSet. 없으면 변환된 RTP를, 그것도 없으면 플레이스홀더
--                       (대화창 스킨과 얼굴도 같은 규칙으로 고른다)
--   INITIAL2D_RPG_SCALE 렌더 배율 (기본 2)
--   INITIAL2D_DEBUG     좌표와 FPS 표시
--   INITIAL2D_RPG_AT    첫 맵의 시작 칸과 방향 (x,y[,dir])
--   INITIAL2D_RPG_STATE 새 게임의 시작 상태 (arrived,silver=2,item:shell=1)
--   INITIAL2D_RPG_ROUTE 한 번만 걷는 자동 재생 경로. 끝나면 rpg:route:done 을 찍고 끝낸다
--   INITIAL2D_RPG_TRACE 맵, 플레이어, 이벤트, 대사, 선택지, 이동을 rpg: 줄로 찍는다
--   INITIAL2D_RPG_HOLD  첫 맵의 이 id 이벤트는 배회하지 않는다. 찾으면 rpg:hold:<id>를 찍는다

local MapScene = require("scripts/lua/rpg/map_scene")
local Player = require("scripts/lua/rpg/player")
local Rng = require("scripts/lua/rpg/rng")
local Event = require("scripts/lua/rpg/event")
local Interpreter = require("scripts/lua/rpg/interpreter")
local Window = require("scripts/lua/rpg/window")
local Dialogue = require("scripts/lua/rpg/message")
local Image = require("scripts/lua/image")
local VirtualPad = require("scripts/lua/ui/vpad")
local Buttons = require("scripts/lua/ui/buttons")
local Assets = require("scripts/lua/rpg/assets")
local MapData = require("scripts/lua/rpg/mapdata")
local Bgm = require("scripts/lua/bgm")
local Inventory = require("scripts/lua/rpg/inventory")
local Menu = require("scripts/lua/rpg/menu")
local Items = require("scripts/lua/games/rpgdemo/items")
local Config = require("scripts/lua/games/rpgdemo/config")
local PlayEnv = require("scripts/lua/games/rpgdemo/playenv")

RpgDemoScene = {}

-- 맵 이름 → 정의 모듈 경로. init 이 rpg-game.json 에서 채운다.
local MAPS = {}
local config = nil
local START_MAP = "port_town"

-- 엔진의 텍스트 경로에는 확대와 축소가 없다. 화면이 논리 384x448이라 32px 폰트는
-- 너무 크므로 이 씬만 16px 폰트를 쓰고, 나갈 때 원래 폰트로 되돌린다
-- (tools/generate_bmfont.py 로 다시 구울 수 있다).
local UI_FONT = "./resources/fonts/hangul16.fnt"
local BASE_FONT = "./resources/fonts/hangul.fnt"

-- 그림은 RTP가 있으면 원본을, 없으면 같은 규격으로 그린 플레이스홀더를 쓴다
-- (scripts/lua/rpg/assets.lua).
local SE_CURSOR = "./resources/audio/ui_cursor.wav"
local SE_DECISION = "./resources/audio/ui_decision.wav"
local SE_TEXT = "./resources/audio/ui_text.wav"
local SE_DOOR = "./resources/audio/door.wav"
local DEFAULT_SCALE = 2
local PAD_DEVICE_SIZE = 160
local WANDER_SEED = 20260817
local FADE_FRAMES = 14          -- 전환 페이드 한쪽 길이

local VK_ESCAPE, VK_RETURN, VK_SPACE, VK_Z = 27, 13, 32, 90
local VK_UP, VK_DOWN, VK_X = 38, 40, 88

local W, H = 768, 896
local scale = 1
local scene, sceneError = nil, nil
local player, playerChar = nil, nil
local events, interp = nil, nil
local pad, buttons, fadeImg = nil, nil, nil
local charsetPath = nil
local rng = nil
local mapName = nil
local mapScripts = nil    -- 맵 정의가 등록한 script 커맨드용 함수 표 (9단계)

local fade = { alpha = 0, dir = 0, pending = nil, exitTo = nil }
local locationText, locationTimer = nil, 0
local hintTimer, fpsAvg = 0, 0
local DEBUG_HUD = false
local HINT_SECONDS = 4.0
local skin, dialogue = nil, nil   -- 대화창 (7단계)
local menu = nil                  -- 소지품 창 (10단계)
local padPrev = nil               -- 가상 패드 방향의 직전 값 (엣지 판정용)

-- 자동 시연 경로. 맵 정의 파일의 autoRoute를 쓰고, 없으면 제자리에서 말만 건다.
-- "talk"은 결정키, 나머지는 방향이다.
local DEFAULT_AUTO_ROUTE = { "talk" }
local autoRoute = DEFAULT_AUTO_ROUTE
local autoTimer, autoIndex = 0, 1
local autoplay = false            -- AUTOPLAY 이거나 INITIAL2D_RPG_ROUTE 가 있다

-- INITIAL2D_RPG_ROUTE 의 걸음. 맵을 옮겨도 이어서 걷고, 다 걸으면 끝낸다.
local routeSteps, routeIndex, routeDone = nil, 1, false
local tracing = false             -- INITIAL2D_RPG_TRACE
local holdId = nil                -- INITIAL2D_RPG_HOLD. 첫 맵을 열 때 쓰고 비운다

local function env(name)
	return (os.getenv ~= nil) and os.getenv(name) or nil
end

--- rpg:error 줄. TRACE 와 상관없이 늘 찍는다.
local function reportError(where, message)
	print(PlayEnv.errorLine(where, message))
end

local function trace(line)
	if tracing then print(line) end
end

-- trace 줄의 값. 정수 모양의 실수(JSON 의 2.0)도 2 로 쓰고, nil 은 빈칸이다.
local function field(v)
	if v == nil then return "" end
	return tostring(math.type(v) == "float" and math.tointeger(v) or v)
end

--- 정의 파일 경로 (rpg-game.json 의 def, "./" 없이)
local function defFileOf(name)
	local entry = Config.mapEntry(config, name)
	return entry ~= nil and Config.bare(entry.def) or tostring(MAPS[name]) .. ".lua"
end

-- ---- 대화창 (7단계) -------------------------------------------------------
--
-- 실행기(interpreter.lua)는 messagePort의 네 함수만 안다. 6단계에서는 화면 아래에
-- 글자만 얹는 최소 구현이었고, 지금은 스킨 창(scripts/lua/rpg/message.lua)이 그
-- 자리에 있다. 씬이 하는 일은 창을 만들고, 매 프레임 입력을 넘겨 주는 것뿐이다.

local function playSe(path, id)
	return function() Audio.PlaySound(path, id, 0) end
end

-- ---- 맵 적재 -------------------------------------------------------------

local function disposeMap()
	if scene ~= nil then
		scene:dispose()
		scene = nil
	end
	events, player, playerChar = nil, nil, nil
end

--- 이벤트 정의 하나를 씬에 세운다. 외형이 있으면 캐릭터를 붙인다.
-- held면 배회(wander)를 켜지 않고 맵의 칸에 세워 둔다 (INITIAL2D_RPG_HOLD).
local function spawnEvent(def, held)
	local ev = Event.new{
		id = def.id, x = def.x, y = def.y, dir = def.dir,
		trigger = def.trigger,
		-- 함수 script 는 정의 파일만 준다. 맵 파일의 같은 이름 키는 모르는 키로 두고 쓰지 않는다
		script = (type(def.script) == "function") and def.script or nil,
		commands = def.commands, scripts = mapScripts,
		charset = def.charset, through = def.through, solid = def.solid,
		data = def.data,
	}

	if def.charset ~= nil then
		local file = def.charset.file
		if type(file) ~= "string" or file == "" then
			error("외형(charset)에 file 없음", 0)
		end
		ev.character = scene:addCharacter{
			tx = def.x, ty = def.y, dir = def.dir,
			charset = file,
			charIndex = def.charset.index or 0,
			speed = def.speed or 3,
			name = def.id,
		}
		if def.wander ~= nil and not held then
			ev.character:setWander{
				rng = rng,
				minWait = def.wander.minWait, maxWait = def.wander.maxWait,
				area = def.wander.area,
			}
		end
	end

	return ev
end

--- 맵 파일의 이벤트를 읽어 검사하고, 틀린 것은 빼고 외형과 얼굴을 파일로 푼다.
-- @return 이벤트 배열, 뺀 수, 읽기 오류
local function mapFileEvents(def, mapFile)
	local fromMap, _, loadErr = MapData.loadEvents(def.map)
	if loadErr ~= nil then return nil, 0, loadErr end
	local _, problems, valid, skipped = MapData.validateEvents(fromMap, { scripts = def.scripts })
	for _, p in ipairs(problems) do
		reportError(mapFile .. ":" .. p.path, p.message)
	end
	return MapData.resolveAssets(valid), skipped, nil
end

--- 맵을 연다. 실패하면 씬을 비우고 sceneError 에 이유를 둔다 (화면에 "맵 로드 실패").
local function loadMap(name, startX, startY, startDir)
	disposeMap()
	mapName = name
	local hold = holdId   -- INITIAL2D_RPG_AT처럼 첫 맵에만 걸린다
	holdId = nil

	local modulePath = MAPS[name]
	if modulePath == nil then
		sceneError = "등록되지 않은 맵: " .. tostring(name)
		reportError("rpg-game.json", "등록되지 않은 맵: " .. tostring(name))
		return
	end

	local defFile = defFileOf(name)
	local ok, def = pcall(require, modulePath)
	if not ok then
		sceneError = "이벤트 정의 로드 실패: " .. tostring(def)
		reportError(defFile, def)
		return
	end
	mapScripts = def.scripts
	local mapFile = Config.bare(def.map) or tostring(def.map)

	local err
	-- groundLayers는 "캐릭터보다 아래에 그릴 레이어 수"다. 맵마다 다르므로
	-- 정의 파일이 정한다 — 항구 마을은 ground와 deco가 아래(2), 빨래줄만 위다.
	-- 이 값이 모자라면 집 벽 같은 장식이 캐릭터의 머리를 덮는다 (프레임 24x32가
	-- 타일 16x16보다 커서 머리가 윗 칸으로 올라간다).
	scene, err = MapScene.new{
		mapPath = def.map, viewW = W, viewH = H,
		groundLayers = def.groundLayers or 1,
	}
	if scene == nil then
		sceneError = err
		reportError(mapFile, err)
		return
	end
	sceneError = nil

	-- 이벤트는 맵 파일(에디터가 놓은 것)과 정의 파일(사람이 쓴 것) 양쪽에서 온다.
	-- 같은 id 면 정의 파일이 이긴다.
	local fromMap, skipped, loadErr = mapFileEvents(def, mapFile)
	if loadErr ~= nil then
		disposeMap()
		sceneError = "맵 이벤트 로드 실패: " .. tostring(loadErr)
		reportError(mapFile, sceneError)
		return
	end
	local eventDefs, overridden = MapData.merge(fromMap, def.events)
	trace(string.format("rpg:map:%s events:%d skipped:%d", name, #eventDefs, skipped))
	for _, id in ipairs(overridden) do
		trace("rpg:override:" .. tostring(id))
	end
	local fromDef = {}
	for _, edef in ipairs(def.events or {}) do
		if type(edef) == "table" and edef.id ~= nil then fromDef[edef.id] = true end
	end

	-- 맵마다 곡이 다를 수 있다. 같은 곡이면 Bgm이 알아서 넘어가므로 맵을
	-- 오갈 때 음악이 끊기지 않는다.
	if def.bgm ~= nil then
		Bgm.play(def.bgm.file, { volume = def.bgm.volume })
	end

	local sx = startX or (def.start and def.start.x) or 0
	local sy = startY or (def.start and def.start.y) or 0
	local sdir = startDir or (def.start and def.start.dir) or "down"

	playerChar = scene:addCharacter{
		tx = sx, ty = sy, dir = sdir,
		charset = charsetPath, charIndex = 0, speed = 4, name = "player",
	}
	scene:setCameraTarget(playerChar)
	trace("rpg:player:" .. name .. "," .. field(playerChar.tx) .. "," .. field(playerChar.ty)
		.. "," .. field(playerChar.dir))

	rng = Rng.new(WANDER_SEED)   -- 맵마다 같은 시드에서 시작 (재현 가능한 데모)

	events = Event.newManager{ player = playerChar, interpreter = interp }
	for _, edef in ipairs(eventDefs) do
		-- 정의 파일의 이벤트가 틀리면 Event.new 가 어느 자리인지와 함께 죽는다. 게임을
		-- 통째로 멈추는 대신 씬 오류로 띄우고 stdout 에도 찍는다.
		local built, result = pcall(spawnEvent, edef, hold ~= nil and edef.id == hold)
		if not built then
			local source = fromDef[edef.id] and defFile or mapFile
			reportError(source .. ":" .. tostring(edef.id), result)
			disposeMap()
			sceneError = tostring(result)
			return
		end
		events:add(result)
	end
	if hold ~= nil then
		-- 자동 재생이 배회하는 NPC 앞에 세운 플레이어가 그 NPC에 닿게 한다
		if events:get(hold) ~= nil then
			print("rpg:hold:" .. PlayEnv.escape(hold))
		else
			reportError("hold:" .. hold, "맵 " .. tostring(name) .. "에 이 id의 이벤트 없음")
		end
	end
	scene:setEvents(events)

	interp:clear()
	events:onMapStart()

	autoRoute = def.autoRoute or DEFAULT_AUTO_ROUTE
	autoIndex = 1

	player = Player.new{ character = playerChar, input = Input, pad = pad }

	-- 스프라이트 위치를 한 번 맞춰 둔다. 전환 직후에는 페이드가 도느라 update가
	-- 돌지 않아서, 이게 없으면 캐릭터들이 잠시 화면 좌상단에 그려진다.
	scene:update(0)
end

--- ctx.transfer 요청. 페이드가 끝난 뒤에 실제 교체가 일어난다.
-- dir 이 없으면 정의 파일의 start.dir 로 선다.
local function requestTransfer(target, x, y, dir)
	trace("rpg:transfer:" .. field(target) .. "," .. field(x) .. "," .. field(y) .. "," .. field(dir))
	fade.pending = { name = target, x = x, y = y, dir = dir }
	fade.dir = 1
	Audio.PlaySound(SE_DOOR, "door", 0)
end

-- ---- 커맨드가 위임하는 호스트 기능 (9단계) --------------------------------

--- 화면 위쪽에 장소 이름을 잠깐 띄운다 (맵 진입 auto 이벤트가 부른다)
local function showLocation(text, seconds)
	locationText = text
	locationTimer = tonumber(seconds) or 2.0
end

local function hostPlaySe(file, id)
	Audio.PlaySound(file, id or "se", 0)
end

local function hostPlayBgm(file, opts)
	Bgm.play(file, opts)
end

--- 다른 씬으로 나간다. 페이드를 걸어 두면 어두워진 뒤에 넘어간다.
local function hostScene(name, opts)
	opts = opts or {}
	if opts.text ~= nil then
		showLocation(opts.text, 3.0)
	end
	if opts.fade then
		fade.pending = nil
		fade.dir = 1
		fade.exitTo = name
	else
		SwitchScene(name)
	end
end

local function characterById(id)
	if id == "player" then return playerChar end
	local ev = events ~= nil and events:get(id) or nil
	return ev ~= nil and ev.character or nil
end

--- 지금 씬의 상태. 디버그 HUD가 쓰고, 8단계 시나리오 테스트가 같은 값을 읽어
-- "정말로 그 칸에 서 있고 그 대사가 떠 있는가"를 확인한다. 씬 바깥에서 상태를
-- 들여다볼 창구가 이것 하나뿐이라 테스트가 내부 지역 변수에 손대지 않는다.
function RpgDemoScene.status()
	return {
		map = mapName,
		tx = playerChar ~= nil and playerChar.tx or nil,
		ty = playerChar ~= nil and playerChar.ty or nil,
		dir = playerChar ~= nil and playerChar.dir or nil,
		moving = playerChar ~= nil and playerChar:isMoving() or false,
		busy = interp ~= nil and interp:isBusy() or false,
		talking = dialogue ~= nil and dialogue:isBusy() or false,
		lines = dialogue ~= nil and dialogue:visibleLines() or {},
		fading = fade.dir ~= 0,
		location = locationTimer > 0 and locationText or nil,
		menu = menu ~= nil and menu:isOpen() or false,
		menuLines = (menu ~= nil and menu:isOpen() and interp ~= nil)
			and Inventory.list(interp.state, Items) or {},
		items = (interp ~= nil and interp.state[Inventory.KEY]) or {},
		flags = interp ~= nil and interp.state or {},
		error = sceneError,
	}
end

-- ---- 씬 계약 --------------------------------------------------------------

function RpgDemoScene.init()
	scale = tonumber(env("INITIAL2D_RPG_SCALE") or "") or DEFAULT_SCALE
	SetRenderScale(scale)

	if FontReady then PreparaFont(UI_FONT) end

	W, H = WindowWidth(), WindowHeight()
	fpsAvg, hintTimer = 0, 0
	autoTimer, autoIndex = 0, 1
	DEBUG_HUD = env("INITIAL2D_DEBUG") ~= nil
	padPrev = nil
	-- 검은 화면에서 밝아지며 시작한다 (타이틀에서 넘어오는 장면이 이어진다)
	fade = { alpha = 255, dir = -1, pending = nil, exitTo = nil }
	locationText, locationTimer = nil, 0

	charsetPath = env("INITIAL2D_CHARSET") or Assets.playerCharset()

	tracing = PlayEnv.enabled(env("INITIAL2D_RPG_TRACE"))
	local routeText = env("INITIAL2D_RPG_ROUTE")
	routeSteps, routeIndex, routeDone = nil, 1, false
	if routeText ~= nil then
		local steps, bad = PlayEnv.parseRoute(routeText)
		for _, b in ipairs(bad) do reportError("route:" .. b.entry, b.message) end
		routeSteps = steps
	end
	autoplay = (AUTOPLAY == true) or routeSteps ~= nil
	holdId = PlayEnv.parseHold(env("INITIAL2D_RPG_HOLD"))

	if VirtualPad.shouldShow() then
		local size = math.floor(PAD_DEVICE_SIZE / scale)
		local margin = math.floor(24 / scale)
		pad = VirtualPad.new{ x = margin, y = H - size - margin, size = size }

		-- 결정과 취소는 오른손 엄지 자리에 둔다. 손가락이 닿는 크기(실기 112px,
		-- 88px)를 논리 좌표로 환산한다 (기획서 6.3절).
		local big = math.floor(112 / scale)
		local small = math.floor(88 / scale)
		buttons = Buttons.new{
			drawText = DrawText, measure = GetTextWidth,
			items = {
				{ id = "confirm", label = "결정",
				  x = W - big - margin, y = H - big - margin, size = big },
				{ id = "cancel", label = "취소",
				  x = W - big - small - margin - math.floor(8 / scale),
				  y = H - small - margin, size = small },
			},
		}
	end

	-- 페이드와 대화 배경에 쓰는 단색 판 (엔진에 사각형 채우기가 없어 스프라이트로 대신)
	fadeImg = Image("./resources/ui/fade.png", 0, 0, 16, 16, 1, "UIFade")
	fadeImg.setScale(math.max(W, H) / 16 + 1)
	fadeImg.setOpacity(0)
	fadeImg.update(0)   -- 위치와 스케일은 update가 트랜스폼에 반영한다

	skin = Window.newSkin{
		path = Assets.windowskin(),
		scale = 1,
	}
	dialogue = Dialogue.new{
		skin = skin, measure = GetTextWidth, drawText = DrawText,
		screenW = W, screenH = H, lines = 3, lineHeight = 20,
		se = {
			cursor = playSe(SE_CURSOR, "uiCursor"),
			decision = playSe(SE_DECISION, "uiDecision"),
			text = playSe(SE_TEXT, "uiText"),
		},
	}

	menu = Menu.new{
		skin = skin, measure = GetTextWidth, drawText = DrawText,
		screenW = W, screenH = H, lineHeight = 20, maxVisible = 6,
		se = {
			cursor = playSe(SE_CURSOR, "uiCursor"),
			cancel = playSe(SE_DECISION, "uiDecision"),
		},
	}

	local port = dialogue:port()
	if tracing then
		local showMessage, showChoice = port.showMessage, port.showChoice
		port.showMessage = function(text, opts)
			print("rpg:message:" .. PlayEnv.escape(opts ~= nil and opts.name or "")
				.. "|" .. PlayEnv.escape(text))
			return showMessage(text, opts)
		end
		port.showChoice = function(options, opts)
			local shown = {}
			for i, option in ipairs(options) do shown[i] = PlayEnv.escape(option) end
			print("rpg:choice:" .. table.concat(shown, "|"))
			return showChoice(options, opts)
		end
	end

	-- 새 게임의 시작 상태 (INITIAL2D_RPG_STATE). 틀린 항목은 건너뛴다.
	local startState, badState = PlayEnv.parseState(env("INITIAL2D_RPG_STATE"), Items)
	for _, b in ipairs(badState) do reportError("state:" .. b.entry, b.message) end

	interp = Interpreter.new{
		messagePort = port,
		state = startState,
		onStart = function(event) trace("rpg:event:" .. tostring(event.id)) end,
		host = {
			transfer = requestTransfer, characterById = characterById,
			playSe = hostPlaySe, playBgm = hostPlayBgm,
			showLocation = showLocation, scene = hostScene,
		},
	}

	-- 틀린 maps 항목은 빠져 있고 나머지 맵은 그대로 열린다. 문제마다 한 줄
	local configProblems
	config, configProblems = Config.load()
	for _, p in ipairs(configProblems) do
		reportError(Config.where("rpg-game.json", p.path), p.message)
	end
	if config == nil then
		MAPS = {}
		sceneError = "rpg-game.json: " .. tostring(configProblems[1].message)
		return
	end
	MAPS = Config.mapModules(config)

	-- 첫 맵의 시작 칸 (INITIAL2D_RPG_AT). 틀리면 정의 파일의 시작에 선다.
	local at = nil
	local atText = env("INITIAL2D_RPG_AT")
	if atText ~= nil and atText ~= "" then
		local why
		at, why = PlayEnv.parseAt(atText)
		if at == nil then reportError("at:" .. atText, why) end
	end
	if at ~= nil then
		loadMap(env("INITIAL2D_MAP") or START_MAP, at.x, at.y, at.dir)
	else
		loadMap(env("INITIAL2D_MAP") or START_MAP)
	end
end

--- 자동 시연의 다음 걸음. INITIAL2D_RPG_ROUTE 는 한 번만 걷고 다 걸으면 nil,
-- 그 밖에는 맵 정의 파일의 autoRoute 를 되풀이한다.
local function nextAutoStep()
	if routeSteps ~= nil then
		local step = routeSteps[routeIndex]
		if step ~= nil then routeIndex = routeIndex + 1 end
		return step
	end
	local step = autoRoute[autoIndex]
	autoIndex = autoIndex % #autoRoute + 1
	return step
end

-- 결정키: 대화를 넘기거나, 선택지를 고르거나, 말을 건다
local function confirmPressed()
	if Input.IsKeyDown(VK_Z) or Input.IsKeyDown(VK_RETURN) or Input.IsKeyDown(VK_SPACE) then
		return true
	end
	-- 터치: 화면의 결정 버튼 (8단계의 "패드 밖 아무 데나 탭"은 걷기와 부딪혔다)
	if buttons ~= nil and buttons.pressed("confirm") then
		return true
	end
	return false
end

--- 이번 프레임에 눌린 키들. 대화창은 "누르고 있다"가 아니라 "방금 눌렀다"를 본다.
-- 가상 패드는 누르고 있는 방향만 알려 주므로 여기서 직전 값과 비교해 엣지로 바꾼다.
local function pollInput()
	local padDir = pad ~= nil and pad.pressed() or nil
	local padEdge = (padDir ~= nil and padDir ~= padPrev) and padDir or nil
	padPrev = padDir

	return {
		confirm = confirmPressed(),
		up = Input.IsKeyDown(VK_UP) or padEdge == "up",
		down = Input.IsKeyDown(VK_DOWN) or padEdge == "down",
		cancel = Input.IsKeyDown(VK_X)
			or (buttons ~= nil and buttons.pressed("cancel")),
	}
end

function RpgDemoScene.update(elapsed)
	if elapsed > 0 then
		fpsAvg = fpsAvg * 0.95 + (1000.0 / elapsed) * 0.05
	end
	hintTimer = hintTimer + elapsed / 1000.0
	if locationTimer > 0 then
		locationTimer = math.max(0, locationTimer - elapsed / 1000.0)
	end

	if scene == nil then
		if Input.IsKeyDown(VK_ESCAPE) then SwitchScene("title") end
		return
	end

	if pad ~= nil then
		pad.update()
	end
	if buttons ~= nil then
		buttons.update()
	end

	-- 페이드 중에는 게임을 멈춘다 (전환이 또렷하게 보인다)
	if fade.dir ~= 0 then
		fade.alpha = fade.alpha + fade.dir * (255 / FADE_FRAMES)
		if fade.dir > 0 and fade.alpha >= 255 then
			fade.alpha = 255
			if fade.exitTo ~= nil then
				SwitchScene(fade.exitTo)   -- 검게 덮인 채로 다음 씬에 넘긴다
				return
			end
			local t = fade.pending
			fade.pending = nil
			if t ~= nil then
				loadMap(t.name, t.x, t.y, t.dir)
			end
			fade.dir = -1
		elseif fade.dir < 0 and fade.alpha <= 0 then
			fade.alpha = 0
			fade.dir = 0
		end
		return
	end

	local input = pollInput()

	-- 소지품 창이 열려 있으면 게임이 멈춘다 (대화창과 같은 규칙). 닫히는 중의
	-- 창 애니메이션은 계속 돌아야 하므로 update는 매 프레임 부른다.
	if menu ~= nil and menu:isOpen() then
		menu:update(input)
		return
	end
	if menu ~= nil then menu:update(nil) end

	if autoplay then
		-- 자동 시연: 정해진 길을 걸으며 말을 걸고, 대화는 알아서 넘긴다 (선택지는 첫 항목)
		autoTimer = autoTimer + elapsed
		if dialogue:isBusy() then
			if autoTimer > 700 then
				autoTimer = 0
				input.confirm = true
			end
		elseif interp:isBusy() or events:hasPendingAuto() then
			-- 스크립트가 돌거나 다음 auto 가 기다리면 기다린다
		elseif autoTimer > 200 and not playerChar:isMoving() then
			autoTimer = 0
			local step = nextAutoStep()
			if step == "talk" then
				events:confirm()
			elseif step ~= nil then
				playerChar:request(step)
			elseif not routeDone and not events:hasPendingAuto() then
				-- INITIAL2D_RPG_ROUTE 를 다 걸었고 도는 이벤트도 기다리는 auto 도 없다
				routeDone = true
				print("rpg:route:done")
				if GameExit ~= nil then GameExit() end
			end
		end
	end

	-- 대화창이 결정키를 먼저 가져간다. 대화를 닫은 그 누름으로 같은 NPC에게 다시
	-- 말을 걸지 않도록, 말 걸기는 "이번 프레임을 한가하게 시작했는가"로 판단한다.
	-- 기다리는 auto 가 있으면 한가하지 않다 (auto 와 auto 사이에도 조작이 잠긴다).
	local wasIdle = not dialogue:isBusy() and not interp:isBusy() and not events:hasPendingAuto()
	dialogue:update(input, interp:isBusy())

	-- 취소키는 한가할 때 소지품 창을 연다. 선택지가 떠 있으면 대화창이 먼저
	-- 가져가므로(위의 dialogue:update) 여기까지 오지 않는다.
	if not autoplay and wasIdle and input.cancel and menu ~= nil then
		menu:open(Inventory.list(interp.state, Items))
		Audio.PlaySound(SE_DECISION, "uiDecision", 0)
		return
	end

	if not autoplay and wasIdle and input.confirm then
		events:confirm()
	end

	if player ~= nil and not autoplay then
		-- 이벤트가 돌거나 다음 auto 가 기다리는 동안 플레이어만 멈춘다. 맵과 병렬 이벤트는 계속 돈다.
		player.enabled = not interp:isBusy() and not dialogue:isBusy() and not events:hasPendingAuto()
		player:update()
	end

	scene:update(elapsed / 1000.0)
	events:update()
	interp:update()

	if Input.IsKeyDown(VK_ESCAPE) then
		SwitchScene("title")
	end
end

function RpgDemoScene.render()
	if scene == nil then
		if FontReady then
			DrawText(20, H / 2 - 40, "맵 로드 실패:")
			DrawText(20, H / 2, tostring(sceneError))
		end
		return
	end

	-- 맵이 화면보다 작으면 바깥이 배경색으로 남는다. 뒤에 검은 판을 깔아 둔다.
	fadeImg.setOpacity(255)
	fadeImg.setPosition(0, 0)
	fadeImg.update(0)
	fadeImg.draw()

	scene:draw()

	if FontReady then
		local showingLocation = locationTimer > 0 and locationText ~= nil
		if showingLocation then
			DrawText((W - GetTextWidth(locationText)) / 2, 8, locationText)
		end
		-- 장소 이름과 조작 안내를 같은 자리에 겹쳐 놓지 않는다. 장소 이름이
		-- 먼저 뜨고 사라진 뒤에 안내가 남는다.
		if not showingLocation and hintTimer < HINT_SECONDS then
			local help = pad ~= nil and "패드 이동  결정  취소로 소지품"
				or "방향키 이동  Z 결정  X 소지품  ESC 타이틀"
			DrawText((W - GetTextWidth(help)) / 2, 8, help)
		end
		if DEBUG_HUD then
			local st = RpgDemoScene.status()
			DrawText(8, H - 24, string.format("%s %d,%d  %d fps  busy %s",
				tostring(st.map), st.tx, st.ty, math.floor(fpsAvg + 0.5),
				tostring(st.busy)))
		end
	end

	dialogue:draw()

	if pad ~= nil then
		pad.draw()
	end
	if buttons ~= nil then
		buttons.draw()
	end

	-- 소지품 창은 패드와 버튼 위에 온다 (열려 있는 동안 게임이 멈춰 있으므로
	-- 가려도 상관없고, 목록이 잘리지 않는 편이 낫다)
	if menu ~= nil then
		menu:draw()
	end

	if fade.alpha > 0 then
		fadeImg.setOpacity(math.floor(fade.alpha))
		fadeImg.setPosition(0, 0)
		fadeImg.update(0)
		fadeImg.draw()
	end
end

function RpgDemoScene.destroy()
	disposeMap()
	if pad ~= nil then
		pad.dispose()
		pad = nil
	end
	if buttons ~= nil then
		buttons.dispose()
		buttons = nil
	end
	if fadeImg ~= nil then
		fadeImg.dispose()
		fadeImg = nil
	end
	if menu ~= nil then
		menu:dispose()
		menu = nil
	end
	if dialogue ~= nil then
		dialogue:dispose()
		dialogue = nil
	end
	if skin ~= nil then
		skin:dispose()
		skin = nil
	end
	interp = nil
	if FontReady then PreparaFont(BASE_FONT) end
	SetRenderScale(1)
end

return RpgDemoScene
