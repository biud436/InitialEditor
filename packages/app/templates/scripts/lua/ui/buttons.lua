-- 화면 위 동작 버튼 (터치 조작) — 범용 UI 모듈 (9단계, T1에서 멀티터치)
--
-- 가상 패드(vpad.lua)가 방향을 맡고, 이쪽이 동작을 맡는다. 8단계까지는
-- "패드 밖 아무 데나 탭 = 결정"이었는데, 걸으려다 대화가 넘어가고 대화를 넘기려다
-- 걷는 일이 잦았다 (기획서 docs/design/port-town.md 6.3절).
--
-- 포인터는 touch.lua가 합쳐 준다: 멀티터치 API가 있으면 손가락들을, 없으면
-- 마우스를 쓴다. 손가락마다 따로 판정하므로 패드로 달리면서 버튼을 누를 수
-- 있고, 두 버튼을 동시에 누를 수도 있다 (T1).
--
-- 판정 반경은 표시 반경의 1.25배다 (히트 슬롭 — 작은 버튼도 누르기 쉽게).
-- 슬롭끼리 겹치는 자리는 중심이 더 가까운 버튼 하나만 먹는다.
--
-- 사용:
--   local Buttons = require("scripts/lua/ui/buttons")
--   local pad = Buttons.new{
--       drawText = DrawText, measure = GetTextWidth,
--       items = {
--           { id = "confirm", label = "결정", x = 300, y = 380, size = 56 },
--           { id = "cancel",  label = "취소", x = 240, y = 396, size = 44 },
--       },
--   }
--   pad.update()                 -- 매 프레임, Input 갱신 뒤
--   if pad.pressed("confirm") then ... end   -- 이번 프레임에 눌렸는가 (엣지)
--   pad.contains(mx, my)         -- 버튼 위 터치인가 (다른 탭 처리에서 제외할 때)
--   pad.draw()
--   pad.dispose()

local Image = require("scripts/lua/image")
local Touch = require("scripts/lua/ui/touch")

local M = {}

local SHEET = "./resources/ui/actionbtn.png"
local FRAME_SIZE = 96          -- tools/generate_ui_assets.py의 make_action_button과 같은 값
local LABEL_LINE = 16          -- 라벨 세로 중앙 보정 (16px 폰트 기준)
local HIT_SCALE = 1.25         -- 판정 반경 / 표시 반경

--- 점이 원 안에 있는가 (순수 함수 — 단위 테스트가 그대로 부른다).
-- hitScale을 주면 판정 반경을 그만큼 키운다 (기본 1 = 표시 반경).
function M.hit(item, x, y, hitScale)
	local r = item.size / 2 * (hitScale or 1)
	local half = item.size / 2
	local cx, cy = item.x + half, item.y + half
	local dx, dy = x - cx, y - cy
	return dx * dx + dy * dy <= r * r
end

--- 포인터가 먹는 버튼 하나를 고른다 (순수 함수). 슬롭이 겹치면 중심이 가까운 쪽.
function M.pick(items, x, y, hitScale)
	local best, bestD2 = nil, nil
	for _, item in ipairs(items) do
		local half = item.size / 2
		local r = half * (hitScale or 1)
		local dx, dy = x - (item.x + half), y - (item.y + half)
		local d2 = dx * dx + dy * dy
		if d2 <= r * r and (bestD2 == nil or d2 < bestD2) then
			best, bestD2 = item, d2
		end
	end
	return best
end

--- @param opts.items    { { id, label, x, y, size }, ... }
-- @param opts.drawText  function(x, y, text) (기본 전역 DrawText)
-- @param opts.measure   function(text) -> 폭 (기본 전역 GetTextWidth)
-- @param opts.input     엔진 Input과 같은 표면 (기본 전역 Input)
-- @param opts.imageFactory  Image 생성자 (테스트가 가짜를 넣는다)
function M.new(opts)
	opts = opts or {}
	assert(type(opts.items) == "table" and #opts.items > 0, "buttons: items가 필요하다")

	local self = {}
	local input = opts.input or _G.Input
	local drawText = opts.drawText or _G.DrawText
	local measure = opts.measure or _G.GetTextWidth
	local factory = opts.imageFactory or Image

	local items = {}
	for i, def in ipairs(opts.items) do
		local size = def.size or 56
		local img = factory(SHEET, def.x, def.y, FRAME_SIZE, FRAME_SIZE, 2,
			"UIButton:" .. tostring(def.id or i))
		img.setLoop(false)
		img.setScale(size / FRAME_SIZE)
		img.setPosition(def.x, def.y)
		items[#items + 1] = {
			id = def.id or ("btn" .. i), label = def.label,
			x = def.x, y = def.y, size = size, img = img,
			held = false, edge = false,
		}
	end

	--- 매 프레임. 눌림 상태와 이번 프레임의 엣지를 갱신한다.
	-- pointers를 넘기면 그것을 쓰고(단위 테스트), 없으면 input에서 만든다.
	function self.update(pointers)
		pointers = pointers or Touch.pointers(input)

		for _, item in ipairs(items) do
			item.edge = false
			item.held = false
		end
		for _, p in ipairs(pointers) do
			if p.held then
				local best = M.pick(items, p.x, p.y, HIT_SCALE)
				if best ~= nil then
					best.edge = best.edge or p.down
					best.held = true
				end
			end
		end
		for _, item in ipairs(items) do
			item.img.setFrames(item.held and 1 or 0, item.held and 1 or 0)
			item.img.setPosition(item.x, item.y)
			item.img.update(0)
		end
	end

	--- 이번 프레임에 눌렸는가 (엣지). 대화창과 선택지가 보는 값이다.
	function self.pressed(id)
		for _, item in ipairs(items) do
			if item.id == id then return item.edge end
		end
		return false
	end

	--- 버튼 판정 영역(슬롭 포함) 위인가 (다른 탭 처리에서 제외할 때)
	function self.contains(x, y)
		for _, item in ipairs(items) do
			if M.hit(item, x, y, HIT_SCALE) then return true end
		end
		return false
	end

	function self.draw()
		for _, item in ipairs(items) do
			item.img.draw()
			if item.label ~= nil and drawText ~= nil and measure ~= nil then
				local w = measure(item.label)
				drawText(item.x + (item.size - w) / 2,
					item.y + (item.size - LABEL_LINE) / 2 - 2, item.label)
			end
		end
	end

	function self.dispose()
		for _, item in ipairs(items) do
			item.img.dispose()
		end
		items = {}
	end

	self.items = items
	return self
end

return M
