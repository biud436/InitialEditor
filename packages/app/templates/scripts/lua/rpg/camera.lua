-- camera.lua : 대상 추적과 맵 경계 클램프 (5단계, docs/plans/05-rpg-character.md)
--
-- 카메라는 그리기 호출에 빼서 넘기는 오프셋 값일 뿐이다. 엔진에 카메라 개념을
-- 넣지 않기로 한 결정(2단계)을 여기서 값으로 대신한다.
--
-- 사용:
--   local Camera = require("scripts/lua/rpg/camera")
--   local cam = Camera.new{ viewW = 768, viewH = 896, worldW = 1280, worldH = 1120 }
--   cam:centerOn(px, py)
--   local cx, cy = cam:pos()     -- 정수 (그리기용)

local M = {}

--- 한 축의 카메라 위치를 구한다. 순수 함수라 단위 테스트가 직접 부른다.
-- 맵이 화면보다 작으면 가운데 정렬(음수 오프셋)이라 맵 밖이 양쪽으로 균등하게 남는다.
function M.clampAxis(center, viewSize, worldSize)
	if worldSize <= viewSize then
		return (worldSize - viewSize) / 2
	end
	local v = center - viewSize / 2
	if v < 0 then return 0 end
	local maxV = worldSize - viewSize
	if v > maxV then return maxV end
	return v
end

local Camera = {}
Camera.__index = Camera
M.Camera = Camera

--- @param opts.viewW, viewH   화면(논리 해상도) 크기
-- @param opts.worldW, worldH  맵 전체 크기 (픽셀)
function M.new(opts)
	opts = opts or {}
	local self = setmetatable({}, Camera)
	self.viewW = opts.viewW or 0
	self.viewH = opts.viewH or 0
	self.worldW = opts.worldW or 0
	self.worldH = opts.worldH or 0
	self.x, self.y = 0, 0
	return self
end

function Camera:setView(w, h)
	self.viewW, self.viewH = w, h
	return self
end

function Camera:setWorld(w, h)
	self.worldW, self.worldH = w, h
	return self
end

--- 월드 좌표 (x, y)를 화면 가운데에 둔다. 맵 경계에서 멈춘다.
function Camera:centerOn(x, y)
	self.x = M.clampAxis(x, self.viewW, self.worldW)
	self.y = M.clampAxis(y, self.viewH, self.worldH)
	return self
end

--- centerPos()를 가진 대상(캐릭터)을 따라간다.
function Camera:follow(target)
	local x, y = target:centerPos()
	return self:centerOn(x, y)
end

--- 그리기에 넘길 정수 오프셋. 소수점을 남기면 타일 경계가 미세하게 떨린다.
function Camera:pos()
	return math.floor(self.x), math.floor(self.y)
end

--- 월드 좌표 → 화면 좌표
function Camera:toScreen(x, y)
	local cx, cy = self:pos()
	return x - cx, y - cy
end

return M
