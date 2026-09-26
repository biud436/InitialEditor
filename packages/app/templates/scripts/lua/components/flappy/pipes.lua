-- components/flappy/pipes.lua : 파이프 3쌍을 spawn 으로 만들고 흘리고 되돌리고 점수를 센다
--
-- node 오브젝트에 붙는다. 파이프 스프라이트는 props.after 가 가리키는 오브젝트 바로 뒤에
-- 끼워 배경 위, 지면과 새 아래에 그려지게 한다 (spawn 의 둘째 인자). 이 컴포넌트가 씬에서
-- 새보다 뒤에 놓여 있으면 원래 게임과 같은 순서(새 물리 -> 파이프 이동과 충돌)로 돈다.

local C = require("scripts/lua/components/flappy/common")

local PIPE_IMAGE = "resources/object_52x271.png"

local M = {}

function M.init(obj, scene)
	local st = C.state(scene)
	C.seed(st)
	st.pipes = {}
	local after = obj.props.after
	for i = 1, 3 do
		-- 위 파이프는 180도 회전 (원점 회전이므로 placePipes 가 위치를 보정한다)
		local top = scene:spawn({
			id = "pipe_top_" .. i, type = "sprite",
			props = { image = PIPE_IMAGE, width = C.PIPE_W, height = C.PIPE_H, angle = 180 },
		}, after)
		local bottom = scene:spawn({
			id = "pipe_bottom_" .. i, type = "sprite",
			props = { image = PIPE_IMAGE, width = C.PIPE_W, height = C.PIPE_H },
		}, after)
		st.pipes[i] = { x = 0, gapY = 0, top = top, bottom = bottom, passed = false }
	end
	C.resetPipes(st)
end

function M.update(obj, scene, elapsed)
	local st = C.state(scene)
	if st.state == "play" then
		local dt = C.dt(elapsed)
		for _, p in ipairs(st.pipes) do
			p.x = p.x - C.speed(st) * dt

			if p.x + C.PIPE_W < 0 then
				p.x = p.x + #st.pipes * C.PIPE_SPACING
				p.gapY = C.randomGap(st)
				p.passed = false
			end

			if (not p.passed) and (p.x + C.PIPE_W < C.BIRD_X) then
				p.passed = true
				st.score = st.score + 1
				C.sfx("point")
			end

			if st.bird and C.hitPipe(st, p) then
				C.die(st)
			end
		end
	end
	C.placePipes(st)
end

return M
