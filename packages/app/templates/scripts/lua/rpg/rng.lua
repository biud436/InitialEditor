-- rng.lua : 시드를 주입하는 결정적 난수 (docs/plans/09-testing.md 4절)
--
-- 게임 로직에서 math.random을 직접 쓰지 않는 이유는 하나다. 전역 난수는 누가
-- 언제 몇 번 뽑았는지에 따라 수열이 달라져서, 시나리오 재생이 같은 결과를
-- 내지 못한다. 이 래퍼는 인스턴스마다 자기 상태를 들고 있으므로 시드만 같으면
-- 항상 같은 수열이 나온다.
--
-- 사용:
--   local Rng = require("scripts/lua/rpg/rng")
--   local r = Rng.new(1234)
--   r:int(1, 4)      -- 1..4 정수 (양끝 포함)
--   r:float()        -- [0, 1)
--   r:pick(list)     -- 목록에서 하나
--   r:chance(0.25)   -- 25% 확률로 true
--
-- 알고리즘은 32비트 선형 합동 생성기(glibc 계수)다. 게임 배회 정도에 필요한
-- 품질이면 충분하고, Lua 5.3의 64비트 정수 안에서 오버플로 없이 계산된다.
-- 낮은 비트의 주기가 짧으므로 정수 범위는 나머지가 아니라 상위 비트(float)로
-- 만든다.

local M = {}

local MOD = 2147483648   -- 2^31
local MUL = 1103515245
local INC = 12345

local Rng = {}
Rng.__index = Rng
M.Rng = Rng

--- 새 난수 생성기. seed를 생략하면 0 (완전히 고정된 수열)
function M.new(seed)
	local self = setmetatable({}, Rng)
	self:reseed(seed or 0)
	return self
end

function Rng:reseed(seed)
	assert(type(seed) == "number", "rng: 시드는 숫자여야 함")
	self.state = math.floor(seed) % MOD
	self.count = 0   -- 뽑은 횟수 (테스트에서 소비량을 볼 때 쓴다)
	return self
end

--- 다음 원시 난수 (0 .. 2^31-1)
function Rng:next()
	self.state = (MUL * self.state + INC) % MOD
	self.count = self.count + 1
	return self.state
end

--- [0, 1) 실수
function Rng:float()
	return self:next() / MOD
end

--- a..b 정수, 양끝 포함
function Rng:int(a, b)
	assert(b >= a, "rng: int(a, b)는 b >= a 여야 함")
	local n = b - a + 1
	local v = a + math.floor(self:float() * n)
	if v > b then v = b end   -- 부동소수 경계 보호
	return v
end

--- 목록에서 하나 (빈 목록이면 nil)
function Rng:pick(list)
	if list == nil or #list == 0 then return nil end
	return list[self:int(1, #list)]
end

--- p 확률로 true (p는 0..1)
function Rng:chance(p)
	return self:float() < p
end

return M
