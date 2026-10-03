-- character.lua : 맵 위를 그리드 단위로 움직이는 객체 (5단계, docs/plans/05-rpg-character.md)
--
-- 플레이어와 NPC가 같은 클래스를 쓴다. 입력을 붙이면 플레이어(player.lua),
-- 배회나 이벤트가 붙으면 NPC다.
--
-- 이 파일은 엔진 전역(Sprite, Tilemap, Input)을 하나도 부르지 않는다. 통행
-- 판정은 주입받은 canPass 함수로, 그리기는 프레임 번호와 픽셀 좌표를 돌려주는
-- 것으로 끝내고 실제 스프라이트는 map_scene.lua가 붙인다. 덕분에 이동 규칙
-- 전체가 헤드리스 단위 테스트로 검증된다 (09-testing.md 3.2절).
--
-- 좌표 규약
--   tx, ty : 타일 좌표(0 기준)가 진실이다. 이동을 시작하는 순간 목적지 타일로
--            바뀌고, 보간이 끝날 때까지 offsetX/Y가 그 차이를 메운다. RPG Maker
--            2003와 같은 방식이라, 이동 중인 캐릭터도 목적지 칸을 점유한다
--            (두 캐릭터가 같은 칸으로 동시에 들어오지 못한다).
--   offsetX, offsetY : 목적지 타일 기준 픽셀 오프셋. 도착하면 0.
--
-- 사용:
--   local Character = require("scripts/lua/rpg/character")
--   local c = Character.new{ tx = 5, ty = 5, canPass = function(x, y, who) ... end }
--   c:request("right")     -- 이동 요청 (이동 중이면 하나만 예약)
--   c:update(dt)           -- dt는 초
--   local x, y = c:pixelPos()          -- 스프라이트 좌상단 (월드 픽셀)
--   local frame = c:frameIndex()       -- CharSet 시트의 프레임 번호

local Specs = require("scripts/lua/rpg/specs")

local M = {}

M.DIR_VECTORS = {
	up    = { 0, -1 },
	right = { 1,  0 },
	down  = { 0,  1 },
	left  = { -1, 0 },
}

-- 방향을 훑을 때의 순서 (배회의 난수 인덱스와 입력 우선순위가 공유한다)
M.DIR_ORDER = { "up", "right", "down", "left" }

M.OPPOSITE = { up = "down", down = "up", left = "right", right = "left" }

-- 서 있는 자세의 걸음 번호. walkPattern이 { 0, 1, 2, 1 } 이므로 1이 가운데다.
local STAND_STEP = 1

local Character = {}
Character.__index = Character
M.Character = Character

-- 등록 순서. y좌표가 같은 캐릭터의 그리기 순서를 고정한다 (table.sort는 불안정).
local nextSerial = 0

--- 새 캐릭터.
-- @param opts.tx, opts.ty     시작 타일 (기본 0,0)
-- @param opts.dir             시작 방향 (기본 "down")
-- @param opts.speed           이동 속도, 타일/초 (기본 4)
-- @param opts.tileW, tileH    맵의 타일 크기 (기본 16)
-- @param opts.charset         CharSet 이미지 경로 (map_scene이 쓴다)
-- @param opts.charIndex       시트 안 캐릭터 번호 0..7 (기본 0)
-- @param opts.frameW, frameH  한 프레임 크기 (기본 specs의 24x32)
-- @param opts.canPass         function(tx, ty, character) -> boolean. 없으면 전부 통행 가능
-- @param opts.through         true면 통행 판정을 무시한다 (유령 이벤트 등)
-- @param opts.animStepsPerTile 한 칸 이동에 걸음 자세가 몇 번 바뀌는가 (기본 2)
function M.new(opts)
	opts = opts or {}
	local self = setmetatable({}, Character)

	nextSerial = nextSerial + 1
	self.serial = nextSerial

	self.tx = opts.tx or 0
	self.ty = opts.ty or 0
	self.dir = opts.dir or "down"
	assert(M.DIR_VECTORS[self.dir] ~= nil, "character: 지원하지 않는 방향: " .. tostring(self.dir))

	self.speed = opts.speed or 4
	self.tileW = opts.tileW or 16
	self.tileH = opts.tileH or 16
	self.frameW = opts.frameW or Specs.charset.frameW
	self.frameH = opts.frameH or Specs.charset.frameH

	self.charset = opts.charset
	self.charIndex = opts.charIndex or 0
	self.name = opts.name

	self.canPass = opts.canPass
	self.through = opts.through or false
	self.animStepsPerTile = opts.animStepsPerTile or 2

	-- 이동 상태
	self.moving = false
	self.moveProgress = 0     -- 0..1, 현재 칸의 진행도
	self.offsetX, self.offsetY = 0, 0
	self.queued = nil         -- 이동 중에 들어온 다음 방향 (하나만 보관)
	self.blocked = false      -- 마지막 이동 시도가 막혔는가 (벽에 부딪히는 연출용)

	-- 걷기 애니메이션
	self.patternStep = STAND_STEP
	self.animPhase = 0

	self.wander = nil
	self.visible = opts.visible ~= false

	return self
end

--- 보간 없이 즉시 옮긴다 (맵 진입, 텔레포트).
function Character:place(tx, ty, dir)
	self.tx, self.ty = tx, ty
	self.moving = false
	self.moveProgress = 0
	self.offsetX, self.offsetY = 0, 0
	self.queued = nil
	self.patternStep = STAND_STEP
	self.animPhase = 0
	if dir ~= nil then self:turn(dir) end
	return self
end

function Character:isMoving()
	return self.moving
end

--- 이동 없이 방향만 바꾼다.
function Character:turn(dir)
	if M.DIR_VECTORS[dir] == nil then return false end
	self.dir = dir
	return true
end

--- 지금 보고 있는 방향의 앞 타일 (6단계의 말 걸기가 쓴다).
function Character:frontTile()
	local v = M.DIR_VECTORS[self.dir]
	return self.tx + v[1], self.ty + v[2]
end

--- 그 칸에 들어갈 수 있는가.
function Character:canEnter(tx, ty)
	if self.through then return true end
	if self.canPass == nil then return true end
	return self.canPass(tx, ty, self) == true
end

--- 이동 시작 시도. 막혀 있어도 그 방향을 바라본다 (R2K3와 같은 동작).
-- @return true면 이동을 시작했다
function Character:tryMove(dir)
	if self.moving then return false end
	local v = M.DIR_VECTORS[dir]
	if v == nil then return false end

	self.dir = dir
	local nx, ny = self.tx + v[1], self.ty + v[2]
	if not self:canEnter(nx, ny) then
		self.blocked = true
		return false
	end

	self.blocked = false
	-- 목적지 칸을 즉시 점유한다 (위 주석의 좌표 규약)
	self.tx, self.ty = nx, ny
	self.moving = true
	self.moveProgress = 0
	self.animPhase = 0
	self.offsetX = -v[1] * self.tileW
	self.offsetY = -v[2] * self.tileH
	return true
end

--- 이동 요청. 정지 중이면 즉시 출발하고, 이동 중이면 다음 칸으로 하나만 예약한다.
function Character:request(dir)
	if M.DIR_VECTORS[dir] == nil then return false end
	if self.moving then
		self.queued = dir
		return false
	end
	return self:tryMove(dir)
end

--- 예약된 이동을 취소한다 (키를 뗐을 때 한 칸 더 가는 것을 막고 싶다면).
function Character:cancelQueued()
	self.queued = nil
end

-- 걸음 자세를 phase까지 진행시킨다 (한 칸 안에서 0 → animStepsPerTile).
function Character:advanceAnim(phase)
	if phase > self.animPhase then
		self.patternStep = self.patternStep + (phase - self.animPhase)
		self.animPhase = phase
	end
end

--- 매 프레임 호출. dt는 초 단위 (엔진의 고정 스텝이라 항상 같은 값이다).
function Character:update(dt)
	if self.moving then
		self.moveProgress = self.moveProgress + self.speed * dt

		-- 한 칸을 넘어섰다면 도착 처리. 남은 진행분(carry)은 다음 칸으로 이어
		-- 붙인다 — 버리면 칸마다 미세하게 느려지고 경계에서 걸린 느낌이 난다.
		while self.moving and self.moveProgress >= 1 do
			local carry = self.moveProgress - 1
			self.moving = false
			self.moveProgress = 0
			self.offsetX, self.offsetY = 0, 0
			self:advanceAnim(self.animStepsPerTile)

			local q = self.queued
			self.queued = nil
			if q ~= nil and self:tryMove(q) then
				self.moveProgress = carry
			end
		end

		if self.moving then
			local p = self.moveProgress
			local v = M.DIR_VECTORS[self.dir]
			self.offsetX = -v[1] * self.tileW * (1 - p)
			self.offsetY = -v[2] * self.tileH * (1 - p)
			self:advanceAnim(math.floor(p * self.animStepsPerTile))
		end
	end

	if not self.moving then
		self.patternStep = STAND_STEP
		self:updateIdle()
	end
end

-- 정지 상태에서만 도는 자율 행동. 이동 루트가 배회보다 우선한다.
function Character:updateIdle()
	if self.route ~= nil then
		self:updateRoute()
		return
	end

	local w = self.wander
	if w == nil then return end

	w.timer = w.timer - 1
	if w.timer > 0 then return end
	w.timer = w.rng:int(w.minWait, w.maxWait)

	local dir = M.DIR_ORDER[w.rng:int(1, #M.DIR_ORDER)]
	if w.area ~= nil then
		local v = M.DIR_VECTORS[dir]
		local nx, ny = self.tx + v[1], self.ty + v[2]
		if nx < w.area.x or ny < w.area.y
			or nx >= w.area.x + w.area.w or ny >= w.area.y + w.area.h then
			self:turn(dir)   -- 구역 밖으로는 나가지 않는다. 방향만 돌아본다
			return
		end
	end
	self:tryMove(dir)
end

--- 랜덤 배회를 켠다. 난수는 반드시 rpg.rng 인스턴스로 주입한다 (09-testing.md 4절).
-- @param opts.rng      Rng 인스턴스 (필수)
-- @param opts.minWait  다음 발걸음까지의 최소 프레임 수 (기본 30)
-- @param opts.maxWait  최대 프레임 수 (기본 120)
-- @param opts.area     { x =, y =, w =, h = } 이 타일 구역 밖으로 나가지 않는다
function Character:setWander(opts)
	assert(opts ~= nil and opts.rng ~= nil, "character: 배회에는 rng 주입 필요")
	self.wander = {
		rng = opts.rng,
		minWait = opts.minWait or 30,
		maxWait = opts.maxWait or 120,
		area = opts.area,
		timer = 0,
	}
	self.wander.timer = self.wander.rng:int(self.wander.minWait, self.wander.maxWait)
	return self
end

function Character:clearWander()
	self.wander = nil
end

-- ---- 이동 루트 (6단계 moveRoute) -----------------------------------------
--
-- 명령 배열을 한 칸씩 소화한다. 쓸 수 있는 명령:
--   "up" "down" "left" "right"   한 칸 이동 (막히면 skipBlocked 규칙을 따른다)
--   "turn:up" 처럼 turn: 접두사   이동 없이 방향만
--   "wait:500"                    500ms 정지 (프레임으로 환산, 고정 스텝 16ms 기준)
-- 이동 자체는 tryMove를 그대로 쓰므로 통행 판정과 걷기 애니메이션이 동일하다.

local MS_PER_FRAME = 1000 / 60

-- @param steps 명령 배열
-- @param opts.loop        true면 끝에서 처음으로 돌아간다
-- @param opts.skipBlocked true면 막힌 명령을 건너뛴다 (기본은 성공할 때까지 재시도)
function Character:setRoute(steps, opts)
	opts = opts or {}
	assert(type(steps) == "table", "character: 이동 루트는 배열이어야 함")
	self.route = {
		steps = steps,
		index = 1,
		loop = opts.loop or false,
		skipBlocked = opts.skipBlocked or false,
		waitFrames = 0,
		done = #steps == 0,
	}
	return self
end

function Character:clearRoute()
	self.route = nil
end

--- 루트를 끝까지 소화했는가 (loop 루트는 끝나지 않는다).
function Character:isRouteDone()
	return self.route == nil or self.route.done
end

function Character:updateRoute()
	local r = self.route
	if r.done then return end

	if r.waitFrames > 0 then
		r.waitFrames = r.waitFrames - 1
		return
	end

	local step = r.steps[r.index]
	if step ~= nil and type(step) ~= "string" then
		r.index = r.index + 1   -- 문자열이 아닌 명령은 건너뛴다
		return
	end
	if step == nil then
		if r.loop and #r.steps > 0 then
			r.index = 1
			return
		end
		r.done = true
		return
	end

	local advance = true
	local waitMs = step:match("^wait:(%d+)$")
	local turnDir = step:match("^turn:(%a+)$")

	if waitMs ~= nil then
		r.waitFrames = math.max(1, math.floor(tonumber(waitMs) / MS_PER_FRAME))
	elseif turnDir ~= nil then
		self:turn(turnDir)
	elseif M.DIR_VECTORS[step] ~= nil then
		if not self:tryMove(step) and not r.skipBlocked then
			advance = false   -- 막혔다. 다음 프레임에 같은 명령을 다시 시도한다
		end
	else
		-- 모르는 명령은 조용히 넘어가는 대신 건너뛴다 (루트가 멈춰 서는 것보다 낫다)
		advance = true
	end

	if advance then
		r.index = r.index + 1
	end
end

--- 지금 그려야 할 걸음 열 번호 (0..2)
function Character:pattern()
	return Specs.walkPatternAt(self.patternStep)
end

--- CharSet 시트(12x8 격자)의 프레임 번호. Sprite.SetCurrentFrame에 그대로 넣는다.
function Character:frameIndex()
	return Specs.charsetFrameIndex(self.charIndex, self.dir, self:pattern())
end

--- 스프라이트 좌상단의 월드 픽셀 좌표.
-- 프레임(24x32)이 타일(16x16)보다 크므로 가로는 가운데 정렬, 세로는 발이 타일
-- 아래 변에 닿게 놓는다 — 캐릭터의 머리가 윗 칸으로 넘어가 상층 타일에 가려진다.
function Character:pixelPos()
	local x = self.tx * self.tileW + (self.tileW - self.frameW) / 2 + self.offsetX
	local y = (self.ty + 1) * self.tileH - self.frameH + self.offsetY
	return x, y
end

--- 캐릭터가 서 있는 칸의 중심 (카메라 추적 대상)
function Character:centerPos()
	return self.tx * self.tileW + self.tileW / 2 + self.offsetX,
		self.ty * self.tileH + self.tileH / 2 + self.offsetY
end

--- y정렬 키: 발 위치의 월드 픽셀 y. 작을수록 먼저(뒤에) 그린다.
function Character:footY()
	return (self.ty + 1) * self.tileH + self.offsetY
end

--- 그리기 순서 비교 (map_scene의 table.sort와 테스트가 공유한다).
-- 발 위치가 같으면 등록 순서로 고정해 프레임마다 순서가 흔들리지 않게 한다.
function M.compareDepth(a, b)
	local ay, by = a:footY(), b:footY()
	if ay ~= by then return ay < by end
	return a.serial < b.serial
end

return M
