-- 가상 패드 (터치 조작) — 범용 UI 모듈
--
-- 키보드가 없는 플랫폼(Android 등)에서 방향 입력을 화면 위 패드로 받는다.
-- 포인터는 touch.lua가 합쳐 준다: 엔진에 멀티터치 API가 있으면 손가락들을,
-- 없으면(테스트의 가짜 Input) 마우스를 쓴다. 조이스틱처럼 동작한다 (T1):
-- 패드 안에서 눌린 포인터를 잡고, 잡힌 동안에는 손가락이 원 밖으로
-- 미끄러져도 방향을 유지한다. 놓아야 풀린다.
--
-- 사용:
--   local VirtualPad = require("scripts/lua/ui/vpad")
--   if VirtualPad.shouldShow() then pad = VirtualPad.new{ x = 24, y = H - 184, size = 160 } end
--   pad.update()                       -- 매 프레임, Input 갱신 뒤
--   if pad.isPressed("left") then ... end
--   pad.contains(mx, my)               -- 패드 위 터치인지 (게임 쪽 탭 처리에서 제외할 때)
--   pad.draw()                         -- HUD 위에 마지막으로 그린다
--   pad.dispose()
--
-- size는 표시 크기다. 시트 원본(160px)과 달라도 되며, 논리 해상도가 작은
-- 화면(렌더 배율 사용)에서는 배율로 나눈 값을 넘기면 손가락 크기가 유지된다.
--
-- 스프라이트 시트 resources/ui/dpad.png: 가로 5프레임 (기본, 위, 오른쪽, 아래, 왼쪽)

local Image = require("scripts/lua/image")
local Touch = require("scripts/lua/ui/touch")

local VirtualPad = {}

local FRAME_OF = { up = 1, right = 2, down = 3, left = 4 }

-- 시트의 한 프레임 크기 (tools/generate_ui_assets.py의 make_dpad와 같은 값).
-- 엔진의 Sprite는 스프라이트 크기를 그대로 소스 프레임 크기로 쓰므로, 원하는
-- 표시 크기를 그냥 넘기면 프레임의 일부만 잘려 그려진다. 스프라이트는 원본
-- 크기로 만들고 표시 크기는 스케일로 맞춘다.
local FRAME_SIZE = 160

-- 표시 여부: 터치 플랫폼이거나 INITIAL2D_VPAD=1 (데스크톱에서 확인용)
function VirtualPad.shouldShow()
	if os.getenv ~= nil and os.getenv("INITIAL2D_VPAD") ~= nil then
		return true
	end
	if GetPlatform == nil then
		return false
	end
	local p = GetPlatform()
	return p == "android" or p == "ios"
end

-- 순수 함수: 패드 중심 기준 상대 좌표(dx, dy)를 방향으로 바꾼다.
-- radius 밖이나 deadzone 안이면 nil. 45도 대각선을 경계로 4방향.
function VirtualPad.direction(dx, dy, radius, deadzone)
	local d2 = dx * dx + dy * dy
	if d2 > radius * radius or d2 < deadzone * deadzone then
		return nil
	end
	if math.abs(dx) > math.abs(dy) then
		return dx > 0 and "right" or "left"
	else
		return dy > 0 and "down" or "up"
	end
end

function VirtualPad.new(opts)
	opts = opts or {}
	local self = {}
	local size = opts.size or 160
	local input = opts.input or _G.Input
	self.x = opts.x or 24
	self.y = opts.y or (WindowHeight() - size - 24)
	self.size = size

	local radius = size * 0.48
	local deadzone = size * 0.10
	local current = nil
	local ownerId = nil            -- 패드를 잡은 포인터 (놓을 때까지 유지)
	local img = Image("./resources/ui/dpad.png", self.x, self.y,
		FRAME_SIZE, FRAME_SIZE, 5, "UIDpad")
	img.setSheetGrid(5, 1)
	img.setLoop(false)
	img.setFrames(0, 0)
	img.setCurrentFrame(0)
	img.setOpacity(opts.opacity or 220)
	img.setScale(size / FRAME_SIZE)   -- 위치는 좌상단 기준이라 스케일이 배치를 흔들지 않는다
	self.image = img
	self.scale = size / FRAME_SIZE

	local function center()
		return self.x + size / 2, self.y + size / 2
	end

	function self.contains(px, py)
		local cx, cy = center()
		local dx, dy = px - cx, py - cy
		return dx * dx + dy * dy <= radius * radius
	end

	function self.hitTest(px, py)
		local cx, cy = center()
		return VirtualPad.direction(px - cx, py - cy, radius, deadzone)
	end

	-- 매 프레임. pointers를 넘기면 그것을 쓰고(단위 테스트), 없으면 input에서 만든다.
	function self.update(pointers)
		pointers = pointers or Touch.pointers(input)

		-- 잡고 있던 포인터를 따라간다. 사라졌거나 떨어졌으면 놓는다.
		local owner = nil
		if ownerId ~= nil then
			for _, p in ipairs(pointers) do
				if p.id == ownerId then
					owner = p
					break
				end
			end
			if owner == nil or not owner.held then
				ownerId, owner = nil, nil
			end
		end

		-- 새로 잡기: 이번 틱에 패드 안에서 눌린 포인터
		if owner == nil then
			for _, p in ipairs(pointers) do
				if p.down and self.contains(p.x, p.y) then
					ownerId, owner = p.id, p
					break
				end
			end
		end

		if owner ~= nil then
			-- 잡힌 동안은 반경 제한 없이 방향만 본다 (조이스틱: 밖으로 끌어도 유지)
			local cx, cy = center()
			current = VirtualPad.direction(owner.x - cx, owner.y - cy,
				math.huge, deadzone)
		else
			current = nil
		end
		img.setCurrentFrame(current and FRAME_OF[current] or 0)
		img.update(0)
	end

	function self.isPressed(dir)
		return current == dir
	end

	function self.pressed()
		return current
	end

	function self.setPosition(x, y)
		self.x, self.y = x, y
		img.setPosition(x, y)
	end

	function self.draw()
		img.draw()
	end

	function self.dispose()
		img.dispose()
	end

	return self
end

return VirtualPad
