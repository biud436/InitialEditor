-- menu.lua : 소지품 창 (10단계, docs/plans/11-game-systems.md)
--
-- 창 두 칸이다. 위는 가진 물건의 목록이고, 아래는 커서가 놓인 물건의 설명이다.
-- 7단계의 window.lua가 창과 커서와 스크롤 화살표를 이미 알고 있으므로 여기서는
-- 배치와 입력만 정한다.
--
-- choice.lua와 닮았지만 다른 물건이다. 선택지는 "고르고 닫히는" 것이라 결과가
-- 있고 실행기가 그 결과를 기다리지만, 소지품 창은 "열어 두고 보는" 것이라
-- 결과가 없고 이벤트와 무관하게 씬이 직접 든다.
--
-- 사용:
--   local menu = Menu.new{ skin = skin, measure = GetTextWidth, drawText = DrawText,
--                          screenW = W, screenH = H }
--   menu:open(Inventory.list(state, ITEMS))
--   menu:update{ up = ..., down = ..., cancel = ... }
--   menu:draw()

local Window = require("scripts/lua/rpg/window")
local Text = require("scripts/lua/rpg/text")

local M = {}

M.CURSOR_BLINK_FRAMES = 20
M.EMPTY_TEXT = "가진 것이 없다."

local Menu = {}
Menu.__index = Menu
M.Menu = Menu

-- @param opts.skin        Window.Skin (필수)
-- @param opts.measure     function(text) -> 픽셀 폭 (필수)
-- @param opts.drawText    function(x, y, text)
-- @param opts.screenW/H   화면 크기 (창을 가운데 놓는 데 쓴다)
-- @param opts.lineHeight  한 줄 높이 (기본 20)
-- @param opts.maxVisible  한 번에 보이는 항목 수 (기본 6)
-- @param opts.se          { cursor = f, cancel = f }
function M.new(opts)
	opts = opts or {}
	assert(opts.skin ~= nil, "menu: skin이 필요하다")
	assert(type(opts.measure) == "function", "menu: 폭 측정 함수가 필요하다")

	local self = setmetatable({}, Menu)
	self.skin = opts.skin
	self.measure = opts.measure
	self.drawText = opts.drawText or _G.DrawText
	self.screenW = opts.screenW or 384
	self.screenH = opts.screenH or 448
	self.lineHeight = opts.lineHeight or 20
	self.maxVisible = opts.maxVisible or 6
	self.margin = opts.margin or 8
	self.padding = opts.padding or (self.skin.spec.frameCorner * self.skin.scale)
	self.se = opts.se or {}
	self.openFrames = opts.openFrames

	self.items = nil
	self.index = 1
	self.top = 1
	self.blink = 0
	self.listWin, self.descWin = nil, nil
	return self
end

--- 소지품 목록을 열어 보여 준다. items는 Inventory.list의 결과.
function Menu:open(items)
	self.items = items or {}
	self.index = 1
	self.top = 1
	self.blink = 0

	local w = self.screenW - self.margin * 2
	local visible = math.max(1, math.min(self.maxVisible, #self.items))
	local listH = visible * self.lineHeight + self.padding * 2
	local descH = self.lineHeight * 2 + self.padding * 2
	local y = math.floor((self.screenH - listH - descH) / 2)

	self.listWin = Window.new{
		skin = self.skin, x = self.margin, y = y, width = w, height = listH,
		padding = self.padding, openFrames = self.openFrames,
	}
	self.descWin = Window.new{
		skin = self.skin, x = self.margin, y = y + listH, width = w, height = descH,
		padding = self.padding, openFrames = self.openFrames,
	}
	self.listWin:open()
	self.descWin:open()
	return self
end

function Menu:close()
	if self.listWin ~= nil then self.listWin:close() end
	if self.descWin ~= nil then self.descWin:close() end
	self.items = nil
	return self
end

--- 열려 있는가. 씬이 이 값으로 플레이어 입력을 잠근다.
function Menu:isOpen()
	return self.items ~= nil
end

--- 창이 아직 화면에 남아 있는가 (닫히는 중 포함). draw는 이때까지 돈다.
function Menu:isVisible()
	return self.listWin ~= nil and self.listWin.openness > 0
end

--- 커서가 놓인 항목
function Menu:selected()
	if self.items == nil then return nil end
	return self.items[self.index]
end

function Menu:visibleRange()
	if self.items == nil or #self.items == 0 then return 0, -1 end
	local visible = math.min(self.maxVisible, #self.items)
	return self.top, math.min(self.top + visible - 1, #self.items)
end

local function play(fn)
	if type(fn) == "function" then fn() end
end

function Menu:scrollToCursor()
	local visible = math.min(self.maxVisible, #self.items)
	if self.index < self.top then
		self.top = self.index
	elseif self.index > self.top + visible - 1 then
		self.top = self.index - visible + 1
	end
end

--- 매 프레임. input은 "이번 프레임에 눌렸다"는 엣지 값이다.
function Menu:update(input)
	if self.listWin ~= nil then self.listWin:update() end
	if self.descWin ~= nil then self.descWin:update() end
	if self.items == nil then return end

	self.blink = self.blink + 1
	input = input or {}
	local n = #self.items

	if n > 0 then
		if input.up then
			self.index = (self.index - 2) % n + 1
			self:scrollToCursor()
			self.blink = 0
			play(self.se.cursor)
		elseif input.down then
			self.index = self.index % n + 1
			self:scrollToCursor()
			self.blink = 0
			play(self.se.cursor)
		end
	end

	-- 쓸 수 있는 물건이 아직 없으므로 결정키도 닫기다 (열쇠와 증표뿐이다).
	if input.cancel or input.confirm then
		play(self.se.cancel)
		self:close()
	end
end

--- 목록 한 줄. 개수는 둘 이상일 때만 오른쪽 끝에 적는다.
function Menu:lineFor(item, width)
	if item.count and item.count > 1 then
		local count = "x" .. tostring(item.count)
		local gap = width - self.measure(item.name) - self.measure(count)
		if gap > 0 then
			return item.name, count
		end
		return item.name .. " " .. count, nil
	end
	return item.name, nil
end

function Menu:draw()
	if self.listWin == nil or self.listWin.openness <= 0 then return end

	self.listWin:draw()
	self.descWin:draw()
	if not self.listWin:isOpen() or self.items == nil then return end

	local cx, cy, cw = self.listWin:contentRect()

	if #self.items == 0 then
		if self.drawText ~= nil then self.drawText(cx, cy, M.EMPTY_TEXT) end
		return
	end

	local first, last = self:visibleRange()

	-- 커서 먼저 (글자가 커서 위에 오게)
	self.skin:drawCursor(cx - self.skin.scale, cy + (self.index - first) * self.lineHeight,
		cw + self.skin.scale * 2, self.lineHeight,
		(self.blink % (M.CURSOR_BLINK_FRAMES * 2)) >= M.CURSOR_BLINK_FRAMES)

	if self.drawText ~= nil then
		for i = first, last do
			local name, count = self:lineFor(self.items[i], cw)
			local y = cy + (i - first) * self.lineHeight
			self.drawText(cx, y, name)
			if count ~= nil then
				self.drawText(cx + cw - self.measure(count), y, count)
			end
		end

		-- 설명은 고른 항목의 것. 창 폭에 맞춰 두 줄까지 접는다.
		local item = self:selected()
		local dx, dy, dw = self.descWin:contentRect()
		local lines = Text.wrap(item and item.desc or "", dw, self.measure)
		for i = 1, math.min(2, #lines) do
			self.drawText(dx, dy + (i - 1) * self.lineHeight, lines[i])
		end
	end

	-- 위아래로 더 있으면 화살표
	local spec = self.skin.spec
	local s = self.skin.scale
	local wx, wy, ww, wh = self.listWin:rect()
	local ax = wx + math.floor((ww - spec.arrowUp.w * s) / 2)
	if first > 1 then
		self.skin:drawRect(spec.arrowUp, ax, wy)
	end
	if last < #self.items then
		self.skin:drawRect(spec.arrowDown, ax, wy + wh - spec.arrowDown.h * s)
	end
end

function Menu:dispose()
	self.listWin, self.descWin = nil, nil
	self.items = nil
end

return M
