-- components/flappy/bird.lua : 새의 물리 (대기 부유, 플레이 중력과 날갯짓, 게임 오버 추락)
--
-- 상태 전이는 director 가 정하고, 이 컴포넌트는 st.state 를 읽어 새를 움직인다.
-- 위치는 obj.y 에, 속도와 기울기는 scene.state.flappy 에 둔다.

local C = require("scripts/lua/components/flappy/common")

local M = {}

function M.init(obj, scene)
	local st = C.state(scene)
	st.bird = obj
	obj.x = C.BIRD_X
	obj.y = st.H / 2 - C.BIRD_H / 2
end

function M.update(obj, scene, elapsed)
	local st = C.state(scene)
	local dt = C.dt(elapsed)

	if st.state == "ready" then
		-- 대기 중엔 새가 상하로 부유
		obj.y = (st.H / 2 - C.BIRD_H / 2) + math.sin(st.readyTime * 4.0) * 14.0
		st.birdAngle = math.sin(st.readyTime * 4.0) * 6.0
	elseif st.state == "play" then
		st.birdVy = st.birdVy + C.GRAVITY * dt
		if st.birdVy > C.MAX_FALL then st.birdVy = C.MAX_FALL end
		obj.y = obj.y + st.birdVy * dt

		if obj.y < 0 then
			obj.y = 0
			st.birdVy = 0
		end

		-- 날갯짓
		if C.flapPressed(st) then
			st.birdVy = C.FLAP
			C.sfx("flap")
		end
		if st.autoplay and st.birdVy > 0 and obj.y > st.H * 0.5 then
			st.birdVy = C.FLAP -- 자동 시연: 일정 높이 아래로 떨어지면 날갯짓
		end

		-- 속도에 따른 기울기 (상승 시 -22도, 낙하 시 최대 60도)
		st.birdAngle = math.max(-22.0, math.min(60.0, st.birdVy * 0.075))

		-- 지면 충돌
		if obj.y + C.BIRD_H >= st.GROUND_Y then
			obj.y = st.GROUND_Y - C.BIRD_H
			C.die(st)
		end
	elseif st.state == "dead" then
		-- 게임 오버 후 새는 고꾸라지며 지면까지 낙하
		if obj.y + C.BIRD_H < st.GROUND_Y then
			st.birdVy = st.birdVy + C.GRAVITY * dt
			obj.y = obj.y + st.birdVy * dt
			st.birdAngle = math.min(90.0, st.birdAngle + 220.0 * dt)
			if obj.y + C.BIRD_H > st.GROUND_Y then obj.y = st.GROUND_Y - C.BIRD_H end
		end
	end

	obj.props.angle = st.birdAngle
	obj.animate = (st.state ~= "dead")   -- 게임 오버에는 날갯짓 애니메이션을 멈춘다
end

return M
