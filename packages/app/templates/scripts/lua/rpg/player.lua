-- player.lua : 입력을 캐릭터에 연결한다 (5단계, docs/plans/05-rpg-character.md)
--
-- 엔진 전역을 직접 부르지 않고 주입받은 input 테이블(엔진 Input과 같은 표면)을
-- 통해 읽는다. 테스트는 tests/lua/input_replay.lua의 가짜 Input을 주입해
-- 프레임 단위 시나리오를 재생한다 (09-testing.md 3.2절).
--
-- 손맛에 관한 두 가지 규칙:
--   1. 정지 상태에서 다른 방향키를 짧게 누르면 이동 없이 방향만 바꾼다.
--      키를 turnFrames 프레임 이상 붙들고 있어야 실제로 걷기 시작한다 (R2K3식).
--      이미 그 방향을 보고 있으면 지연 없이 즉시 출발한다.
--   2. 이동 중에 눌린 방향은 캐릭터의 예약 슬롯으로 넘어가, 칸에 도착하는
--      즉시 이어서 걷는다. 키를 떼면 그 칸에서 멈춘다.
--
-- 사용:
--   local Player = require("scripts/lua/rpg/player")
--   local p = Player.new{ character = c, input = Input, pad = pad }
--   p:update(dt)

local Character = require("scripts/lua/rpg/character")

local M = {}

-- Win32 가상 키 코드 (엔진 전 플랫폼 공통 관례)
M.DEFAULT_KEYS = { left = 37, up = 38, right = 39, down = 40 }

-- 방향을 훑는 순서. 두 키를 동시에 누르면 이 순서로 하나를 고른다.
local ORDER = Character.DIR_ORDER

local Player = {}
Player.__index = Player
M.Player = Player

-- @param opts.character  조종할 Character (필수)
-- @param opts.input      엔진 Input과 같은 표면의 테이블 (기본 _G.Input)
-- @param opts.pad        가상 D-패드 (scripts/lua/ui/vpad). 있으면 키보다 우선
-- @param opts.keys       방향 → 가상 키 코드 표
-- @param opts.turnFrames 방향 전환 후 걷기 시작까지 붙들어야 하는 프레임 수 (기본 5)
function M.new(opts)
	opts = opts or {}
	assert(opts.character ~= nil, "player: character가 필요하다")

	local self = setmetatable({}, Player)
	self.character = opts.character
	self.input = opts.input or _G.Input
	self.pad = opts.pad
	self.keys = opts.keys or M.DEFAULT_KEYS
	self.turnFrames = opts.turnFrames or 5
	self.enabled = true

	self.turnDir = nil     -- 방향만 돌려놓고 출발을 기다리는 중인 방향
	self.turnCount = 0
	self.lastDir = nil

	return self
end

function Player:setPad(pad)
	self.pad = pad
end

--- 이번 프레임에 눌려 있는 방향. 없으면 nil.
-- 새로 눌린 키가 계속 눌려 있던 키보다 우선한다 (방향 전환이 즉시 먹히도록).
function Player:heldDir()
	if self.pad ~= nil then
		local padDir = self.pad.pressed()
		if padDir ~= nil then return padDir end
	end

	local input = self.input
	if input == nil then return nil end

	for _, dir in ipairs(ORDER) do
		local vk = self.keys[dir]
		if vk ~= nil and input.IsKeyDown(vk) then return dir end
	end
	-- 계속 누르고 있던 방향을 먼저 유지한다 (두 키를 겹쳐 누를 때 튀지 않게)
	if self.lastDir ~= nil then
		local vk = self.keys[self.lastDir]
		if vk ~= nil and input.IsKeyPress(vk) then return self.lastDir end
	end
	for _, dir in ipairs(ORDER) do
		local vk = self.keys[dir]
		if vk ~= nil and input.IsKeyPress(vk) then return dir end
	end
	return nil
end

--- 매 프레임 호출한다. 시간이 아니라 프레임 수로만 재므로 인자가 없다
-- (캐릭터의 보간 갱신은 map_scene이 dt를 주며 따로 한다).
function Player:update()
	if not self.enabled then return end

	local dir = self:heldDir()
	self.lastDir = dir

	local c = self.character

	if dir == nil then
		self.turnDir, self.turnCount = nil, 0
		c:cancelQueued()
		return
	end

	if c:isMoving() then
		c:request(dir)
		self.turnDir, self.turnCount = nil, 0
		return
	end

	if c.dir ~= dir then
		-- 정지 중에 다른 방향: 먼저 몸만 돌리고 잠깐 기다린다
		c:turn(dir)
		self.turnDir, self.turnCount = dir, 0
		return
	end

	if self.turnDir == dir and self.turnCount < self.turnFrames then
		self.turnCount = self.turnCount + 1
		return
	end

	c:request(dir)
	self.turnDir, self.turnCount = nil, 0
end

return M
