-- components/flappy/common.lua : 플래피 컴포넌트들이 나눠 쓰는 상수와 도우미 (컴포넌트가 아니다)
--
-- scripts/lua/games/flappy.lua 의 상수와 규칙을 그대로 가져왔다. 상태는 scene.state.flappy 한 표에
-- 모아 두고 bird, pipes, scroller, director 컴포넌트가 함께 읽고 쓴다.
-- 자동 시연(INITIAL2D_AUTOPLAY)이면 난수 씨앗을 INITIAL2D_FLAPPY_SEED(기본 1)로 고정해
-- 매번 같은 판이 된다 (물리는 고정 스텝이다).

local M = {}

-- 튜닝 상수 (px/초)
M.GRAVITY      = 1500.0   -- 중력 가속도
M.FLAP         = -480.0   -- 날갯짓 순간 속도
M.MAX_FALL     = 820.0    -- 최대 낙하 속도
M.BASE_SPEED   = 210.0    -- 파이프와 지면 기본 속도
M.SCROLL       = 30.0     -- 배경(원경) 스크롤 속도
M.BASE_GAP     = 280      -- 파이프 상하 간격(시작값)
M.MIN_GAP      = 195      -- 파이프 간격 하한
M.PIPE_SPACING = 340      -- 파이프 수평 간격
M.PIPE_W       = 52
M.PIPE_H       = 271
M.GROUND_H     = 64
M.BIRD_X       = 170
M.BIRD_W       = 92
M.BIRD_H       = 64
M.TICK_BUDGET  = 900      -- 자동 시연이 스스로 끝내는 틱 수 (60Hz 기준 15초)

-- scene.state.flappy 를 (없으면 만들어) 돌려준다
function M.state(scene)
	local st = scene.state.flappy
	if st == nil then
		local env = os.getenv
		st = {
			state = "ready",
			score = 0,
			best = 0,
			readyTime = 0,
			deadTime = 0,
			birdVy = 0,
			birdAngle = 0,
			pipes = {},
			ticks = 0,
			W = WindowWidth(),
			H = WindowHeight(),
			autoplay = (env ~= nil) and (env("INITIAL2D_AUTOPLAY") ~= nil) or false,
		}
		st.GROUND_Y = st.H - M.GROUND_H + 12   -- 충돌 기준(잔디 약간 아래)
		scene.state.flappy = st
	end
	return st
end

function M.dt(elapsed)
	return math.min(elapsed, 50) / 1000.0   -- 스파이크 방어
end

function M.speed(st)
	return math.min(M.BASE_SPEED + st.score * 3.0, 320.0)
end

function M.gap(st)
	return math.max(M.BASE_GAP - st.score * 4, M.MIN_GAP)
end

function M.sfx(name)
	-- loop 에 숫자를 주면 추가 반복 횟수다 (1 = 2회 연속 재생).
	-- 효과음 파일이 절반 길이로 만들어져 있어 2회 재생이 정상 길이가 된다.
	Audio.PlaySound("./resources/audio/" .. name .. ".wav", name, 1)
end

function M.flapPressed(st)
	if st.autoplay then
		return false -- 자동 시연은 별도 로직에서 처리
	end
	return Input.IsMouseDown(0) or Input.IsKeyDown(32) -- 마우스 왼쪽 / 스페이스
end

function M.randomGap(st)
	return 200 + math.random(0, math.max(1, math.floor(st.H - M.GROUND_H - M.gap(st) - 340)))
end

local seeded = false

-- 난수 씨앗은 한 번만 (자동 시연이면 고정, 아니면 시각)
function M.seed(st)
	if seeded then return end
	seeded = true
	if st.autoplay then
		math.randomseed(tonumber(os.getenv("INITIAL2D_FLAPPY_SEED") or 1))
	else
		math.randomseed(os.time())
	end
end

-- 파이프 자료(x, gapY)를 스프라이트 위치에 옮긴다
function M.placePipes(st)
	for _, p in ipairs(st.pipes) do
		-- 위 파이프는 180도 원점 회전이라 (x+W, gapY)에 놓아야 (x, gapY-H)에 그려진다
		p.top.x = p.x + M.PIPE_W
		p.top.y = p.gapY
		p.bottom.x = p.x
		p.bottom.y = p.gapY + M.gap(st)
	end
end

function M.resetPipes(st)
	for i, p in ipairs(st.pipes) do
		p.x = st.W + 160 + (i - 1) * M.PIPE_SPACING
		p.gapY = M.randomGap(st)
		p.passed = false
	end
	M.placePipes(st)
end

function M.resetGame(st)
	if st.bird then st.bird.y = st.H / 2 - M.BIRD_H / 2 end
	st.birdVy = 0
	st.birdAngle = 0
	st.score = 0
	st.readyTime = 0
	M.resetPipes(st)
end

function M.birdRect(st)
	-- 충돌 판정은 그림보다 약간 작게
	local y = st.bird and st.bird.y or 0
	return M.BIRD_X + 12, y + 10, M.BIRD_X + M.BIRD_W - 16, y + M.BIRD_H - 10
end

local function overlap(l1, t1, r1, b1, l2, t2, r2, b2)
	return l1 < r2 and r1 > l2 and t1 < b2 and b1 > t2
end

function M.hitPipe(st, p)
	local left, top, right, bottom = M.birdRect(st)
	-- 위 파이프: (x, gapY-PIPE_H)..(x+PIPE_W, gapY)
	if overlap(left, top, right, bottom, p.x, p.gapY - M.PIPE_H, p.x + M.PIPE_W, p.gapY) then
		return true
	end
	-- 아래 파이프: (x, gapY+gap)..(x+PIPE_W, gapY+gap+PIPE_H)
	local gap = M.gap(st)
	return overlap(left, top, right, bottom, p.x, p.gapY + gap, p.x + M.PIPE_W, p.gapY + gap + M.PIPE_H)
end

function M.die(st)
	st.state = "dead"
	st.deadTime = 0
	if st.score > st.best then st.best = st.score end
	M.sfx("hit")
end

return M
