-- message.lua : 대화창 (7단계, docs/plans/07-rpg-dialogue.md)
--
-- 화면 아래 고정 위치의 창에 대사를 한 글자씩 출력한다. 결정키를 누르면 남은
-- 글자를 즉시 다 보여 주고, 한 번 더 누르면 다음 쪽으로 넘어가거나 닫힌다.
--
-- 6단계 실행기(interpreter.lua)가 요구하는 항구(port)의 구현체다. 실행기는
-- showMessage / showChoice / isBusy / result 네 함수만 알고, 그것들이 창인지
-- print 스텁인지는 모른다. 그래서 선택지 창도 여기서 함께 들고 있는다 —
-- 실행기 쪽에서 보면 대화 하나로 보여야 하기 때문이다.
--
-- 시간은 프레임으로 잰다 (실행기와 같은 고정 스텝 규칙). 폭 측정과 글자 그리기는
-- 주입받으므로, 엔진 없이도 배치와 쪽 나눔을 단위 테스트할 수 있다.
--
-- 사용:
--   local Dialogue = require("scripts/lua/rpg/message")
--   local dlg = Dialogue.new{ skin = skin, measure = GetTextWidth, drawText = DrawText }
--   interp = Interpreter.new{ messagePort = dlg:port(), ... }
--   dlg:update(input, interp:isBusy())   -- 매 프레임
--   dlg:draw()

local Window = require("scripts/lua/rpg/window")
local Choice = require("scripts/lua/rpg/choice")
local Text = require("scripts/lua/rpg/text")
local Specs = require("scripts/lua/rpg/specs")
local Image = require("scripts/lua/image")

local M = {}

M.ARROW_BLINK_FRAMES = 24    -- 다음 쪽 대기 화살표 깜빡임 주기

local Dialogue = {}
Dialogue.__index = Dialogue
M.Dialogue = Dialogue

--- @param opts.skin       Window.Skin (필수)
-- @param opts.measure    function(text) -> 픽셀 폭 (기본 전역 GetTextWidth)
-- @param opts.drawText   function(x, y, text) (기본 전역 DrawText)
-- @param opts.lines      한 쪽에 보일 줄 수 (기본 3)
-- @param opts.lineHeight 줄 간격, 화면 픽셀 (기본 20 — hangul16.fnt의 lineHeight 19)
-- @param opts.speed      프레임당 출력 글자 수 (기본 2, 0이면 즉시 전부)
-- @param opts.screenW/H  화면 크기 (기본 WindowWidth/Height)
-- @param opts.x, y, width, height  직접 배치할 때
-- @param opts.se         { text, cursor, decision, cancel } 효과음 함수들 (선택)
-- @param opts.imageFactory 얼굴 그림용 Image 생성자 (기본 scripts/lua/image)
function M.new(opts)
	opts = opts or {}
	assert(opts.skin ~= nil, "message: skin이 필요하다")

	local self = setmetatable({}, Dialogue)
	self.skin = opts.skin
	local s = self.skin.scale

	self.measure = opts.measure or _G.GetTextWidth
	self.drawText = opts.drawText or _G.DrawText
	assert(type(self.measure) == "function", "message: 폭 측정 함수가 필요하다")

	self.lines = opts.lines or 3
	self.lineHeight = opts.lineHeight or 20
	self.speed = opts.speed or 2
	self.se = opts.se or {}
	self.textSeInterval = opts.textSeInterval or 4
	self.imageFactory = opts.imageFactory or Image
	self.faceSize = (opts.faceSize or Specs.faceset.size) * s
	-- 줄바꿈 여유 (choice.lua와 같은 이유 — 측정 폭은 진행 폭의 합이다)
	self.inkMargin = opts.inkMargin or (2 * s)

	local screenW = opts.screenW or (WindowWidth ~= nil and WindowWidth()) or 320
	local screenH = opts.screenH or (WindowHeight ~= nil and WindowHeight()) or 240
	local margin = opts.margin or (4 * s)
	local padding = opts.padding or (self.skin.spec.frameCorner * s)

	local width = opts.width or (screenW - margin * 2)
	local height = opts.height or (self.lines * self.lineHeight + padding * 2)
	local x = opts.x or margin
	local y = opts.y or (screenH - height - margin)

	self.window = Window.new{
		skin = self.skin, x = x, y = y, width = width, height = height,
		padding = padding, openFrames = opts.openFrames,
	}
	self.nameWindow = nil
	self.choice = Choice.new{
		skin = self.skin, measure = self.measure, drawText = self.drawText,
		lineHeight = self.lineHeight, maxVisible = opts.maxChoices or 4,
		padding = padding, se = self.se, openFrames = opts.openFrames,
	}

	self.faces = {}          -- 경로 → Image
	self.pages = {}
	self.page = 0
	self.revealed = 0
	self.busy = false
	self.face = nil
	self.name = nil
	self.frame = 0
	return self
end

-- ---- 쪽 나눔 --------------------------------------------------------------

--- 대사 한 덩어리를 창 폭에 맞춰 줄로 나누고, 다시 쪽으로 묶는다.
-- 순수 계산이라 단위 테스트가 그대로 부른다.
function Dialogue:paginate(text, textWidth)
	local wrapped = Text.wrap(text, textWidth, self.measure)
	local pages, page = {}, {}
	for _, line in ipairs(wrapped) do
		page[#page + 1] = line
		if #page >= self.lines then
			pages[#pages + 1] = page
			page = {}
		end
	end
	if #page > 0 then pages[#pages + 1] = page end
	if #pages == 0 then pages[1] = { "" } end
	return pages
end

--- 글자를 그릴 영역 (얼굴이 있으면 그만큼 오른쪽으로 밀린다)
function Dialogue:textRect()
	local cx, cy, cw, ch = self.window:contentRect()
	if self.face ~= nil then
		local shift = self.faceSize + self.window.padding
		return cx + shift, cy, cw - shift, ch
	end
	return cx, cy, cw, ch
end

local function totalChars(page)
	local n = 0
	for _, line in ipairs(page) do n = n + Text.length(line) end
	return n
end

-- ---- 표시 ----------------------------------------------------------------

--- 대사를 띄운다. 실행기가 부르는 진입점이기도 하다.
-- @param opts.face = { file = 경로, index = 0..15 }
-- @param opts.name = 화자 이름 (작은 창으로 위에 붙는다)
function Dialogue:showMessage(text, opts)
	opts = opts or {}
	self.face = opts.face
	self:setName(opts.name)

	local _, _, textWidth = self:textRect()
	self.pages = self:paginate(tostring(text), textWidth - self.inkMargin)
	self:startPage(1)
	self.busy = true
	self.window:open()
	return self
end

--- n번째 쪽을 처음부터 출력하기 시작한다. speed가 0이면 타자 효과 없이 바로 전부.
function Dialogue:startPage(n)
	self.page = n
	self.pageChars = totalChars(self.pages[n] or {})
	self.revealed = (self.speed <= 0) and self.pageChars or 0
end

--- 선택지를 띄운다 (대화창은 열린 채로 둔다 — 방금 한 말이 보여야 한다).
function Dialogue:showChoice(options, opts)
	opts = opts or {}
	local wx, wy, ww = self.window.x, self.window.y, self.window.width
	self.choice:show(options, {
		anchor = { x = wx, y = wy, w = ww },
		cancelIndex = opts.cancelIndex,
		index = opts.index,
	})
	self.busy = true
	return self
end

function Dialogue:setName(name)
	self.name = name
	if name == nil then
		self.nameWindow = nil
		return
	end
	local s = self.skin.scale
	local padding = self.window.padding
	local w = self.measure(tostring(name)) + padding * 2
	local h = self.lineHeight + padding * 2
	self.nameWindow = Window.new{
		skin = self.skin, x = self.window.x, y = self.window.y - h + s,
		width = w, height = h, padding = padding, openFrames = 0, open = true,
	}
end

--- 실행기가 보는 상태. 대사가 남아 있거나 선택 중이면 참.
function Dialogue:isBusy()
	return self.busy or self.choice:isActive()
end

--- 마지막 선택 결과 (실행기가 choice 대기 뒤에 읽는다)
function Dialogue:result()
	return self.choice:result()
end

--- 지금 쪽의 글자가 전부 나왔는가
function Dialogue:isRevealed()
	return self.revealed >= (self.pageChars or 0)
end

--- 실행기(interpreter.lua)에 넘길 항구. 실행기는 점 호출로 부르므로 클로저로 싼다.
function Dialogue:port()
	local dlg = self
	return {
		showMessage = function(text, opts) dlg:showMessage(text, opts) end,
		showChoice = function(options, opts) dlg:showChoice(options, opts) end,
		isBusy = function() return dlg:isBusy() end,
		result = function() return dlg:result() end,
	}
end

-- ---- 프레임 --------------------------------------------------------------

local function play(fn)
	if type(fn) == "function" then fn() end
end

--- 대사를 한 칸 진행시킨다 (결정키가 없을 때).
function Dialogue:advanceReveal()
	if self.speed <= 0 then
		self.revealed = self.pageChars
		return
	end
	local before = self.revealed
	self.revealed = math.min(self.pageChars, self.revealed + self.speed)
	if self.textSeInterval > 0 and self.revealed > before
		and math.floor(before / self.textSeInterval)
			~= math.floor(self.revealed / self.textSeInterval) then
		play(self.se.text)
	end
end

--- 결정키를 눌렀을 때: 다 안 나왔으면 마저 보여 주고, 다 나왔으면 다음 쪽으로.
function Dialogue:confirm()
	if not self:isRevealed() then
		self.revealed = self.pageChars
		return
	end
	play(self.se.decision)
	if self.page < #self.pages then
		self:startPage(self.page + 1)
	else
		self.busy = false
	end
end

--- 매 프레임 한 번.
-- @param input      { confirm, up, down, cancel } — 이번 프레임에 눌린 키
-- @param scriptBusy 실행기가 아직 도는 중인가. 거짓이고 할 일도 없으면 창을 닫는다.
function Dialogue:update(input, scriptBusy)
	input = input or {}
	self.frame = self.frame + 1

	self.window:update()
	if self.nameWindow ~= nil then self.nameWindow:update() end

	if self.choice:isActive() then
		-- 선택 중에는 대화창은 그대로 두고 선택지만 움직인다
		self.choice:update(input)
		if not self.choice:isActive() then
			self.busy = false
		end
		return
	end
	self.choice:update(nil)

	if self.busy then
		if self.window:isOpen() then
			if input.confirm then
				self:confirm()
			else
				self:advanceReveal()
			end
		end
		return
	end

	if not scriptBusy then
		self.window:close()
		if self.nameWindow ~= nil then self.nameWindow:close() end
		if self.window:isClosed() then
			-- 다 닫힌 뒤에는 지난 대사를 버린다. 다음에 열릴 때 옛 글자가
			-- 한 프레임 비치는 것을 막는다.
			self.pages, self.page, self.face = {}, 0, nil
		end
	end
end

-- ---- 그리기 --------------------------------------------------------------

function Dialogue:faceImage(file)
	local img = self.faces[file]
	if img == nil then
		local size = Specs.faceset.size
		img = self.imageFactory(file, 0, 0, size, size, 1, "face:" .. file)
		img.setLoop(false)
		img.setScale(self.skin.scale)
		self.faces[file] = img
	end
	return img
end

function Dialogue:drawFace()
	if self.face == nil or self.face.file == nil then return end
	local cx, cy = self.window:contentRect()
	local img = self:faceImage(self.face.file)
	local fx, fy, fw, fh = Specs.facesetRect(self.face.index or 0)
	img.setRect(fx, fy, fw, fh)
	img.setPosition(cx, cy)
	img.setOpacity(255)
	img.update(0)
	img.draw()
end

--- 지금 화면에 보이는 줄들 (타자 효과가 잘라 낸 상태). 테스트도 이걸 본다.
function Dialogue:visibleLines()
	local page = self.pages[self.page]
	if page == nil then return {} end
	local out, left = {}, self.revealed
	for _, line in ipairs(page) do
		local n = Text.length(line)
		if left >= n then
			out[#out + 1] = line
			left = left - n
		else
			out[#out + 1] = Text.sub(line, left)
			left = 0
		end
	end
	return out
end

function Dialogue:draw()
	if self.nameWindow ~= nil and self.name ~= nil then
		self.nameWindow:draw()
		if self.nameWindow:isOpen() and self.drawText ~= nil then
			local nx, ny = self.nameWindow:contentRect()
			self.drawText(nx, ny, self.name)
		end
	end

	self.window:draw()

	-- 대사는 창이 다 열려 있는 동안 계속 보인다 (선택지를 고르는 중에도, 닫히기
	-- 직전까지도). 방금 무슨 말을 들었는지가 화면에 남아 있어야 한다.
	if self.window:isOpen() and self.pages[self.page] ~= nil then
		self:drawFace()
		local tx, ty = self:textRect()
		if self.drawText ~= nil then
			for i, line in ipairs(self:visibleLines()) do
				if line ~= "" then
					self.drawText(tx, ty + (i - 1) * self.lineHeight, line)
				end
			end
		end
		self:drawPauseArrow()
	end

	self.choice:draw()
end

--- 대기 화살표를 그릴 자리 (창 아래 가운데). 테스트도 이 값으로 픽셀을 본다.
function Dialogue:pauseArrowRect()
	local s = self.skin.scale
	local arrow = self.skin.spec.arrowDown
	local wx, wy, ww, wh = self.window:rect()
	return wx + math.floor((ww - arrow.w * s) / 2), wy + wh - arrow.h * s,
		arrow.w * s, arrow.h * s
end

--- 다음을 기다리는 동안 창 아래에서 깜빡이는 화살표 (스킨의 스크롤 화살표).
function Dialogue:drawPauseArrow()
	if not self.busy or not self:isRevealed() or self.choice:isActive() then return end
	if (self.frame % (M.ARROW_BLINK_FRAMES * 2)) >= M.ARROW_BLINK_FRAMES then return end
	local x, y = self:pauseArrowRect()
	self.skin:drawRect(self.skin.spec.arrowDown, x, y)
end

function Dialogue:dispose()
	for _, img in pairs(self.faces) do
		img.dispose()
	end
	self.faces = {}
	self.choice:dispose()
	self.window = nil
	self.nameWindow = nil
end

return M
