-- 그래프에서 만든 파일: scripts/components/flappy/bird.graph.json (이 파일이 아니라 그래프를 편집합니다)
local flappy = require("scripts/lua/components/flappy/common")

local M = {}

function M.init(obj, scene, params)
	local st = flappy.state(scene)
	st.bird = obj
	obj.x = flappy.BIRD_X
	obj.y = st.H / 2 - flappy.BIRD_H / 2
end

function M.update(obj, scene, elapsed, params)
	local st = flappy.state(scene)
	local dt = flappy.dt(elapsed)
	if st.state == "ready" then
		obj.y = st.H / 2 - flappy.BIRD_H / 2 + math.sin(st.readyTime * 4) * 14
		st.birdAngle = math.sin(st.readyTime * 4) * 6
	elseif st.state == "play" then
		st.birdVy = st.birdVy + flappy.GRAVITY * dt
		if st.birdVy > flappy.MAX_FALL then
			st.birdVy = flappy.MAX_FALL
		end
		obj.y = obj.y + st.birdVy * dt
		if obj.y < 0 then
			obj.y = 0.0
			st.birdVy = 0.0
		end
		if flappy.flapPressed(st) then
			st.birdVy = flappy.FLAP
			flappy.sfx("flap")
		end
		if st.autoplay and st.birdVy > 0 and obj.y > st.H * 0.5 then
			st.birdVy = flappy.FLAP
		end
		st.birdAngle = math.max(-22, math.min(60, st.birdVy * 0.075))
		if obj.y + flappy.BIRD_H >= st.GROUND_Y then
			obj.y = st.GROUND_Y - flappy.BIRD_H
			flappy.die(st)
		end
	elseif st.state == "dead" then
		if obj.y + flappy.BIRD_H < st.GROUND_Y then
			st.birdVy = st.birdVy + flappy.GRAVITY * dt
			obj.y = obj.y + st.birdVy * dt
			st.birdAngle = math.min(90, st.birdAngle + 220 * dt)
			if obj.y + flappy.BIRD_H > st.GROUND_Y then
				obj.y = st.GROUND_Y - flappy.BIRD_H
			end
		end
	end
	obj.props.angle = st.birdAngle
	obj.animate = st.state ~= "dead"
end

return M
