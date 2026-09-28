-- choice.lua : 선택지 창 (7단계, docs/plans/07-rpg-dialogue.md)
--
-- 항목을 세로로 늘어놓고 스킨 커서로 하나를 덮는다. 위아래로 옮기고 결정키로
-- 고르며, 취소키는 지정한 항목(cancelIndex)으로 빠져나간다. 결과는 번호(1부터).
--
-- 항목이 많으면 보이는 만큼만 그리고 스킨의 화살표로 더 있음을 알린다.
--
-- 창 크기는 글자 폭에서 나온다 — 그래서 폭 측정 함수를 주입받는다. 엔진 없이
-- 도는 단위 테스트가 가짜 measure로 배치까지 검증할 수 있다.
--
-- 사용:
--   local choice = Choice.new{ skin = skin, measure = GetTextWidth, drawText = DrawText }
--   choice:show({ "네", "아니요" }, { cancelIndex = 2 })
--   choice:update{ up = ..., down = ..., confirm = ..., cancel = ... }
--   choice:draw()
--   if not choice:isActive() then pick = choice:result() end

local Window = require("scripts/lua/rpg/window")

local M = {}

M.CURSOR_BLINK_FRAMES = 20   -- 커서 두 장을 번갈아 보여 주는 주기 (R2K3식 깜빡임)

local Choice = {}
Choice.__index = Choice
M.Choice = Choice

--- @param opts.skin       Window.Skin (필수)
-- @param opts.measure    function(text) -> 픽셀 폭 (필수)
-- @param opts.drawText   function(x, y, text) (기본 전역 DrawText)
-- @param opts.lineHeight 항목 한 줄 높이 (화면 픽셀)
-- @param opts.maxVisible 한 번에 보이는 항목 수 (기본 4)
-- @param opts.minWidth   창 최소 폭
-- @param opts.se         { cursor = f, decision = f, cancel = f } 효과음 (선택)
function M.new(opts)
	opts = opts or {}
	assert(opts.skin ~= nil, "choice: skin이 필요하다")
	assert(type(opts.measure) == "function", "choice: 폭 측정 함수가 필요하다")

	local self = setmetatable({}, Choice)
	self.skin = opts.skin
	self.measure = opts.measure
	self.drawText = opts.drawText or _G.DrawText
	self.lineHeight = opts.lineHeight or 20
	self.maxVisible = opts.maxVisible or 4
	self.minWidth = opts.minWidth or 80
	self.padding = opts.padding or (self.skin.spec.frameCorner * self.skin.scale)
	-- 폭 측정(GetTextWidth)은 글자의 진행 폭(advance)을 더한 값이라, 획이 그보다
	-- 몇 픽셀 더 나가는 글자가 있으면 마지막 글자가 테두리에 닿아 보인다.
	-- 창을 그만큼만 더 넓게 잡는다.
	self.inkMargin = opts.inkMargin or (2 * self.skin.scale)
	self.se = opts.se or {}
	self.openFrames = opts.openFrames

	self.options = nil
	self.index = 1
	self.top = 1
	self.window = nil
	self.value = nil
	self.blink = 0
	return self
end

--- 항목을 열고 선택을 시작한다.
-- @param opts.x, y        창 좌상단 (없으면 anchor 기준으로 놓는다)
-- @param opts.anchor      { x, y, w } 오른쪽 위 기준점 (보통 메시지 창의 사각형)
-- @param opts.cancelIndex 취소키를 눌렀을 때의 결과 (없으면 취소 불가)
-- @param opts.index       처음 놓일 항목 (기본 1)
function Choice:show(options, opts)
	assert(type(options) == "table" and #options > 0, "choice: 항목이 필요하다")
	opts = opts or {}

	self.options = options
	self.index = math.min(math.max(opts.index or 1, 1), #options)
	self.cancelIndex = opts.cancelIndex
	self.value = nil
	self.blink = 0

	local visible = math.min(self.maxVisible, #options)
	self.top = math.min(math.max(1, self.index - visible + 1), #options - visible + 1)

	local textW = self.minWidth
	for _, option in ipairs(options) do
		textW = math.max(textW, self.measure(tostring(option)))
	end
	local w = textW + self.padding * 2 + self.inkMargin
	local h = visible * self.lineHeight + self.padding * 2

	local x, y = opts.x, opts.y
	if x == nil and opts.anchor ~= nil then
		-- 메시지 창 오른쪽 위에 붙인다 (R2K3의 선택지 위치)
		x = opts.anchor.x + opts.anchor.w - w
		y = opts.anchor.y - h
	end

	self.window = Window.new{
		skin = self.skin, x = x or 0, y = y or 0, width = w, height = h,
		padding = self.padding, openFrames = self.openFrames,
	}
	self.window:open()
	return self
end

--- 선택이 진행 중인가 (실행기가 이걸 보고 스크립트를 멈춘다)
function Choice:isActive()
	return self.options ~= nil
end

function Choice:result()
	return self.value
end

--- 보이는 첫 항목 번호를 커서 위치에 맞춘다.
function Choice:scrollToCursor()
	local visible = math.min(self.maxVisible, #self.options)
	if self.index < self.top then
		self.top = self.index
	elseif self.index > self.top + visible - 1 then
		self.top = self.index - visible + 1
	end
end

local function play(fn)
	if type(fn) == "function" then fn() end
end

--- 매 프레임. input은 "이번 프레임에 눌렸다"는 엣지 값이다.
function Choice:update(input)
	if self.window ~= nil then self.window:update() end
	if self.options == nil then return end

	self.blink = self.blink + 1
	input = input or {}
	local n = #self.options

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

	if input.confirm then
		self.value = self.index
		self.options = nil
		play(self.se.decision)
		if self.window ~= nil then self.window:close() end
	elseif input.cancel and self.cancelIndex ~= nil then
		self.value = self.cancelIndex
		self.options = nil
		play(self.se.cancel or self.se.decision)
		if self.window ~= nil then self.window:close() end
	end
end

--- 화면 좌표 아래에 있는 항목 번호 (없으면 nil).
-- 터치 플랫폼에서 항목을 직접 누를 수 있게 하는 값이다. 커서 이동과 결정을
-- 어떻게 엮을지는 부르는 쪽이 정한다 (한 번 눌러 바로 결정할 수도, 커서만
-- 옮길 수도 있다).
function Choice:indexAt(x, y)
	local win = self.window
	if self.options == nil or win == nil or not win:isOpen() then return nil end

	local cx, cy, cw = win:contentRect()
	if x < cx or x >= cx + cw then return nil end

	local first, last = self:visibleRange()
	local row = math.floor((y - cy) / self.lineHeight)
	if row < 0 or row > last - first then return nil end
	return first + row
end

--- 지금 화면에 보이는 항목 범위 (테스트가 스크롤을 확인한다)
function Choice:visibleRange()
	if self.options == nil then return 0, -1 end
	local visible = math.min(self.maxVisible, #self.options)
	return self.top, math.min(self.top + visible - 1, #self.options)
end

function Choice:draw()
	local win = self.window
	if win == nil or win.openness <= 0 then return end

	win:draw()
	if not win:isOpen() or self.options == nil then return end

	local cx, cy, cw = win:contentRect()
	local first, last = self:visibleRange()

	-- 커서 먼저 (글자가 커서 위에 오게)
	local row = self.index - first
	self.skin:drawCursor(cx - self.skin.scale, cy + row * self.lineHeight,
		cw + self.skin.scale * 2, self.lineHeight,
		(self.blink % (M.CURSOR_BLINK_FRAMES * 2)) >= M.CURSOR_BLINK_FRAMES)

	if self.drawText ~= nil then
		for i = first, last do
			self.drawText(cx, cy + (i - first) * self.lineHeight, tostring(self.options[i]))
		end
	end

	-- 위아래로 더 있으면 화살표 (스킨의 스크롤 화살표를 그대로 쓴다)
	local spec = self.skin.spec
	local s = self.skin.scale
	local wx, wy, ww, wh = win:rect()
	local ax = wx + math.floor((ww - spec.arrowUp.w * s) / 2)
	if first > 1 then
		self.skin:drawRect(spec.arrowUp, ax, wy)
	end
	if last < #self.options then
		self.skin:drawRect(spec.arrowDown, ax, wy + wh - spec.arrowDown.h * s)
	end
end

function Choice:dispose()
	self.window = nil
	self.options = nil
end

return M
