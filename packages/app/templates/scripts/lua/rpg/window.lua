-- window.lua : 스킨 창 (7단계, docs/plans/07-rpg-dialogue.md)
--
-- RPG Maker 2003의 System 스킨(160x80 한 장)을 잘라 창을 조립한다. 나인 슬라이스
-- 개념은 C++에 넣지 않는다 — 엔진에는 "텍스처의 사각형 하나를 화면에 그린다"만
-- 있으면 되고(Sprite.SetRect), 조각을 어디에 몇 번 찍을지는 여기서 정한다.
--
-- 엔진 제약 두 가지가 설계를 정했다.
--   1. 스프라이트 스케일은 가로세로 같은 값 하나뿐이다 (TextureManagerSDL2의
--      XFORM 분해). 그래서 변과 바탕은 "늘이기"가 아니라 "반복"으로 채운다.
--   2. 소스 사각형의 크기는 스프라이트를 만들 때의 크기로 고정된다. 그래서
--      자투리(반복하다 남는 부분)는 그 크기짜리 스프라이트를 따로 만들어 자른다.
--      Skin이 크기별로 하나씩 만들어 캐시한다.
--
-- 좌표 단위: 조각 계산(M.ninePatch, M.slices)은 전부 스킨 픽셀이고, 화면에 찍을
-- 때 scale을 곱한다. 창의 width/height는 화면 픽셀이며 scale의 배수로 내림한다.
--
-- 사용:
--   local Window = require("scripts/lua/rpg/window")
--   local skin = Window.newSkin{ path = "./resources/ui/window.png", scale = 1 }
--   local win = Window.new{ skin = skin, x = 8, y = 300, width = 368, height = 76 }
--   win:open() ; win:update() ; win:draw() ; win:dispose()

local Specs = require("scripts/lua/rpg/specs")
local Image = require("scripts/lua/image")

local M = {}

M.OPEN_FRAMES = 4         -- 열기와 닫기 애니메이션 길이 (프레임)
M.BG_BANDS = 4            -- 바탕을 세로로 몇 개의 띠로 나눠 채울지 (아래 설명)

-- ---- 순수 기하 ------------------------------------------------------------

--- 소스 사각형을 반복해 목표 영역을 채운다. 마지막 자투리는 소스를 잘라 쓴다.
-- @param out    조각을 담을 배열 { sx, sy, sw, sh, dx, dy }
-- @param dx,dy,dw,dh  채울 영역 (창 좌상단 기준 스킨 픽셀)
-- @param sx,sy,sw,sh  소스 사각형 (스킨 이미지 기준)
function M.tileFill(out, dx, dy, dw, dh, sx, sy, sw, sh)
	if dw <= 0 or dh <= 0 or sw <= 0 or sh <= 0 then return out end

	local y = 0
	while y < dh do
		local h = math.min(sh, dh - y)
		local x = 0
		while x < dw do
			local w = math.min(sw, dw - x)
			out[#out + 1] = { sx = sx, sy = sy, sw = w, sh = h, dx = dx + x, dy = dy + y }
			x = x + w
		end
		y = y + h
	end
	return out
end

--- 나인 슬라이스: 모서리 4개는 그대로, 변은 반복, 가운데는 fillCenter일 때만.
-- @param rect   스킨 안의 32x32 블록 (background/frame/cursor 중 하나)
-- @param corner 모서리 크기 (보통 8)
-- @param w,h    만들 크기 (스킨 픽셀)
function M.ninePatch(out, rect, corner, w, h, fillCenter)
	local c = corner
	local rx, ry, rw, rh = rect.x, rect.y, rect.w, rect.h

	-- 모서리 두 개가 겹칠 만큼 작으면 나인 슬라이스가 성립하지 않는다.
	-- 그런 창은 그리지 않는 편이 깨진 테두리보다 낫다 (열리는 중의 아주 얇은 창).
	if w < c * 2 or h < c * 2 then
		return out
	end

	local innerW, innerH = rw - c * 2, rh - c * 2   -- 소스의 변 조각 크기
	local midW, midH = w - c * 2, h - c * 2         -- 목표의 변 길이

	-- 모서리
	out[#out + 1] = { sx = rx, sy = ry, sw = c, sh = c, dx = 0, dy = 0 }
	out[#out + 1] = { sx = rx + rw - c, sy = ry, sw = c, sh = c, dx = w - c, dy = 0 }
	out[#out + 1] = { sx = rx, sy = ry + rh - c, sw = c, sh = c, dx = 0, dy = h - c }
	out[#out + 1] = { sx = rx + rw - c, sy = ry + rh - c, sw = c, sh = c,
		dx = w - c, dy = h - c }

	-- 위아래 변
	M.tileFill(out, c, 0, midW, c, rx + c, ry, innerW, c)
	M.tileFill(out, c, h - c, midW, c, rx + c, ry + rh - c, innerW, c)
	-- 좌우 변
	M.tileFill(out, 0, c, c, midH, rx, ry + c, c, innerH)
	M.tileFill(out, w - c, c, c, midH, rx + rw - c, ry + c, c, innerH)

	if fillCenter then
		M.tileFill(out, c, c, midW, midH, rx + c, ry + c, innerW, innerH)
	end

	return out
end

--- 창 바탕. 원본 게임은 32x32 한 장을 창 크기로 늘이지만, 이 엔진의 스프라이트는
--- 가로세로 같은 배율만 지원해 늘일 수가 없다. 그래서 바탕을 가로 띠 몇 개로
--- 나누고, 띠마다 원본의 해당 부분만 반복해 채운다 — 그라데이션이 32픽셀마다
--- 뚝뚝 끊기는 대신 띠 안에서만 아주 조금 되풀이된다.
function M.backgroundFill(out, w, h, spec, bands)
	local bg = spec.background
	bands = bands or M.BG_BANDS
	if bands < 1 or bg.h % bands ~= 0 then bands = 1 end
	local bandH = bg.h // bands

	local top = 0
	for i = 0, bands - 1 do
		local bottom = (i == bands - 1) and h or math.floor(h * (i + 1) / bands)
		M.tileFill(out, 0, top, w, bottom - top, bg.x, bg.y + i * bandH, bg.w, bandH)
		top = bottom
	end
	return out
end

--- 창 하나(바탕 + 테두리)의 조각 목록.
-- 바탕은 창 전체를 덮는다 — 테두리 그림의 안쪽이 반투명이라 바탕이 비쳐야 한다.
function M.slices(w, h, spec)
	spec = spec or Specs.window
	local out = {}
	M.backgroundFill(out, w, h, spec)
	M.ninePatch(out, spec.frame, spec.frameCorner, w, h, false)
	return out
end

--- 선택 커서 조각 (가운데까지 채운다 — 커서는 항목을 덮는 사각형이다).
function M.cursorSlices(w, h, spec, blink)
	spec = spec or Specs.window
	local rect = (blink and spec.cursor2) or spec.cursor
	return M.ninePatch({}, rect, spec.cursorCorner or spec.frameCorner, w, h, true)
end

-- ---- 스킨 (엔진에 닿는 부분) ----------------------------------------------

local Skin = {}
Skin.__index = Skin
M.Skin = Skin

--- @param opts.path          스킨 이미지 경로
-- @param opts.spec          규격 표 (기본 Specs.window)
-- @param opts.scale         확대 배율 (기본 1)
-- @param opts.imageFactory  Image 생성자 (기본 scripts/lua/image, 테스트는 가짜를 넣는다)
-- @param opts.textureId     텍스처 id (기본 경로에서 만든다)
function M.newSkin(opts)
	opts = opts or {}
	local self = setmetatable({}, Skin)
	self.path = opts.path or "./resources/ui/window.png"
	self.spec = opts.spec or Specs.window
	self.scale = opts.scale or 1
	self.imageFactory = opts.imageFactory or Image
	self.textureId = opts.textureId or ("winskin:" .. self.path)
	self.cache = {}     -- "가로x세로" → Image (소스 크기별로 하나)
	self.opacity = opts.opacity or 255
	return self
end

--- 소스 크기 하나에 대응하는 스프라이트. 엔진은 스프라이트 크기를 그대로 소스
--- 사각형 크기로 쓰므로(TextureManagerSDL2::DrawFrame), 자르는 크기마다 필요하다.
function Skin:image(sw, sh)
	local key = sw .. "x" .. sh
	local img = self.cache[key]
	if img == nil then
		img = self.imageFactory(self.path, 0, 0, sw, sh, 1, self.textureId)
		img.setLoop(false)
		img.setScale(self.scale)
		self.cache[key] = img
	end
	return img
end

--- 조각 목록을 화면 (x, y)에 찍는다. 조각 좌표는 스킨 픽셀이라 scale을 곱한다.
function Skin:drawPieces(pieces, x, y, opacity)
	local s = self.scale
	for _, p in ipairs(pieces) do
		local img = self:image(p.sw, p.sh)
		img.setRect(p.sx, p.sy, p.sw, p.sh)
		img.setPosition(x + p.dx * s, y + p.dy * s)
		img.setOpacity(opacity or self.opacity)
		img.update(0)
		img.draw()
	end
end

--- 스킨의 작은 조각 하나 (화살표 등)를 그대로 찍는다.
function Skin:drawRect(rect, x, y, opacity)
	local img = self:image(rect.w, rect.h)
	img.setRect(rect.x, rect.y, rect.w, rect.h)
	img.setPosition(x, y)
	img.setOpacity(opacity or self.opacity)
	img.update(0)
	img.draw()
end

--- 선택 커서를 화면 사각형에 맞춰 그린다 (크기는 화면 픽셀).
function Skin:drawCursor(x, y, w, h, blink)
	local s = self.scale
	local pieces = M.cursorSlices(math.floor(w / s), math.floor(h / s), self.spec, blink)
	self:drawPieces(pieces, x, y)
end

function Skin:dispose()
	-- 크기별 스프라이트는 텍스처 하나를 공유한다. 해제는 한 번만.
	for _, img in pairs(self.cache) do
		img.dispose()
		break
	end
	self.cache = {}
end

-- ---- 창 -------------------------------------------------------------------

local Window = {}
Window.__index = Window
M.Window = Window

--- @param opts.skin      Skin (필수)
-- @param opts.x, y       화면 좌상단 좌표
-- @param opts.width, height  화면 픽셀 크기 (scale의 배수로 내림한다)
-- @param opts.padding    안쪽 여백 (기본 모서리 크기 x 배율)
-- @param opts.openFrames 열기·닫기 프레임 수 (기본 4, 0이면 즉시)
-- @param opts.open       true면 열린 채로 시작
function M.new(opts)
	opts = opts or {}
	assert(opts.skin ~= nil, "window: skin이 필요하다")

	local self = setmetatable({}, Window)
	self.skin = opts.skin
	local s = self.skin.scale
	self.x = opts.x or 0
	self.y = opts.y or 0
	-- 화면 크기는 배율의 배수여야 스킨 픽셀로 되돌릴 때 어긋나지 않는다
	self.width = math.max(s * 2, math.floor((opts.width or 0) / s) * s)
	self.height = math.max(s * 2, math.floor((opts.height or 0) / s) * s)
	self.padding = opts.padding or (self.skin.spec.frameCorner * s)
	self.openFrames = opts.openFrames or M.OPEN_FRAMES
	self.openness = opts.open and 1 or 0
	self.target = self.openness
	self.visible = true
	return self
end

function Window:open()
	self.target = 1
	if self.openFrames <= 0 then self.openness = 1 end
	return self
end

function Window:close()
	self.target = 0
	if self.openFrames <= 0 then self.openness = 0 end
	return self
end

--- 완전히 열려 있는가 (내용은 이때만 그린다)
function Window:isOpen() return self.openness >= 1 end

--- 완전히 닫혔는가
function Window:isClosed() return self.openness <= 0 end

--- 매 프레임 한 번. 시간은 프레임으로 잰다 (interpreter와 같은 고정 스텝 규칙).
function Window:update()
	if self.openFrames <= 0 then
		self.openness = self.target
		return
	end
	local step = 1 / self.openFrames
	if self.openness < self.target then
		self.openness = math.min(1, self.openness + step)
	elseif self.openness > self.target then
		self.openness = math.max(0, self.openness - step)
	end
end

--- 지금 프레임에 그릴 창의 화면 사각형. 열리는 중에는 위아래 가운데에서 자란다.
function Window:rect()
	local s = self.skin.scale
	local h = math.floor(self.height * self.openness / s) * s
	local y = self.y + math.floor((self.height - h) / (2 * s)) * s
	return self.x, y, self.width, h
end

--- 내용(글자, 얼굴)을 그릴 안쪽 사각형.
function Window:contentRect()
	return self.x + self.padding, self.y + self.padding,
		self.width - self.padding * 2, self.height - self.padding * 2
end

--- 창틀만 그린다. 내용은 호출자가 contentRect()에 그린다 (창은 내용을 모른다).
function Window:draw()
	if not self.visible or self.openness <= 0 then return end
	local s = self.skin.scale
	local x, y, w, h = self:rect()
	local pieces = M.slices(math.floor(w / s), math.floor(h / s), self.skin.spec)
	self.skin:drawPieces(pieces, x, y)
end

function Window:dispose()
	-- 스킨은 여러 창이 공유하므로 여기서 해제하지 않는다 (소유자가 해제한다).
	self.skin = nil
end

return M
