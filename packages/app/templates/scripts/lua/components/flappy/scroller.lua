-- components/flappy/scroller.lua : 이어붙인 두 장을 왼쪽으로 흘리는 컴포넌트 (배경과 지면)
--
-- props.kind 가 "background" 면 원경 속도(SCROLL)로 항상, "ground" 면 파이프와 같은 속도로
-- (게임 오버에는 멈춘다). 두 장은 x 가 0 과 W 에서 시작해 -W 에 닿으면 2W 만큼 되돌아간다.

local C = require("scripts/lua/components/flappy/common")

local M = {}

function M.update(obj, scene, elapsed)
	local st = C.state(scene)
	local dt = C.dt(elapsed)
	if obj.props.kind == "background" then
		obj.x = obj.x - C.SCROLL * dt
	elseif st.state ~= "dead" then
		local groundSpeed = (st.state == "play") and C.speed(st) or C.BASE_SPEED * 0.4
		obj.x = obj.x - groundSpeed * dt
	end
	if obj.x <= -st.W then obj.x = obj.x + st.W * 2 end
end

return M
