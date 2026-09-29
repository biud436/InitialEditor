-- 그래프에서 만든 파일: scripts/components/graphtest/sampler.graph.json (이 파일이 아니라 그래프를 편집합니다)

local M = {}

function M.init(obj, scene, params)
	local st = scene.state
	if st.ticks == nil then st.ticks = 0 end
	if st.phase == nil then st.phase = "start" end
	local acc = 0
	print("label=" .. params.label)
	print("count=" .. tostring(params.count))
	if params.mode == "a" then
		print("mode a")
	elseif params.mode == "b" then
		print("mode b")
	end
	for _i_loop = 0, params.count - 1 do
		acc = acc + _i_loop
	end
	print("acc=" .. tostring(acc))
	local half = 7 / 2
	print("half=" .. tostring(half))
	print("div=" .. tostring(params.count / 2))
	print("div2=" .. tostring(params.count / math.floor(2.5)))
	print("mod=" .. tostring(-7 % 3))
	print("floor=" .. tostring(math.floor(-2.5)))
	print("abs=" .. tostring(math.abs(-4)))
	print("clamp=" .. tostring(math.max(0, math.min(10, 15))))
	print("minmax=" .. tostring(math.min(3, 1.5)) .. tostring(math.max(2, 7)))
	print("sqrt=" .. tostring(math.sqrt(16)))
	print("trig=" .. tostring(math.sin(0) + math.cos(0)))
	print("and=" .. tostring(3 > 2 and not (1 == 2)))
	print("or=" .. tostring(5 < 4 or false))
	print("cmp=" .. tostring(2 <= 2) .. tostring(1 >= 2) .. tostring("x" ~= "y"))
	obj.x = 12.5
	print("x=" .. tostring(obj.x))
	obj.props.hp = 5
	print("hp+1=" .. tostring(obj.props.hp + 1))
	print("other=" .. scene:find("other").id)
	scene:find("other").y = 40.0
	print("otherY=" .. tostring(scene:find("other").y))
	if obj.id == "sampler" then
		print("id sampler")
	else
		print("id other")
	end
	print("width>0=" .. tostring(WindowWidth() > 0))
	print("input=" .. tostring(Input.IsKeyPress(32) or Input.IsMouseDown(0)))
	print("phase=" .. tostring(st.phase))
	print("start?=" .. tostring(st.phase == "start"))
	print("rnd=" .. tostring(math.random(4, 4)))
	print("rnd01<1=" .. tostring(math.random() < 1))
	print("quote\" hash# brace#{x} back\\slash")
end

function M.update(obj, scene, elapsed, params)
	local st = scene.state
	st.ticks = st.ticks + 1
	if st.ticks == 1 then
		print("tick one")
		st.phase = "run"
	elseif st.ticks == 2 then
		print("tick two")
	elseif st.ticks == 3 then
		print("tick three elapsed>0=" .. tostring(elapsed > 0))
		st.phase = "done"
		GameExit()
	end
	if st.phase == "run" then
		print("phase run")
	elseif st.phase == "done" then
		print("phase done")
	else
		print("phase other")
	end
end

return M
