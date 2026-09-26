-- components/flappy/director.lua : 상태 기계(ready -> play -> dead -> ready), 자동 시연, 화면 글자
--
-- 조작: 마우스 클릭/터치 또는 스페이스 바로 날갯짓. 게임 오버 화면에서 화면 상단(1/3)을
-- 누르면 게임을 끝낸다. ESC(Android 뒤로가기)는 언제나 종료.
-- 자동 시연(INITIAL2D_AUTOPLAY)이면 상태 전이와 점수를 stdout 에 알리고 TICK_BUDGET 틱에
-- 스스로 끝낸다 (tests/run_engine_tests.py 가 읽는 형식이다):
--   flappy:state:<상태>, flappy:score:<점수>, flappyFinal state=... score=... best=... ticks=...
-- 화면 글자는 씬의 text 오브젝트(title, best, score, over, result, hint1, hint2)를 켜고 끈다.

local C = require("scripts/lua/components/flappy/common")

local VK_ESCAPE = 27

local M = {}

function M.init(obj, scene)
	local st = C.state(scene)
	st.state = "ready"
	st.ticks = 0
	st.lastState = nil
	st.lastScore = nil
	st.texts = {}
	for _, id in ipairs({ "title", "best", "score", "over", "result", "hint1", "hint2" }) do
		st.texts[id] = scene:find(id)
	end
	M.updateHud(st)
end

local function show(o, on, text)
	if o == nil then return end
	o.visible = on
	if text ~= nil then o.props.text = text end
end

function M.updateHud(st)
	local t = st.texts
	show(t.title, st.state == "ready")
	show(t.best, st.state == "ready", "최고 점수 " .. st.best)
	show(t.score, st.state == "play", "점수 " .. st.score)
	show(t.over, st.state == "dead")
	show(t.result, st.state == "dead", "점수 " .. st.score .. "  최고 " .. st.best)
	show(t.hint1, st.state == "dead" and st.deadTime > 0.6)
	show(t.hint2, st.state == "dead" and st.deadTime > 0.6)
end

function M.update(obj, scene, elapsed)
	local st = C.state(scene)
	local dt = C.dt(elapsed)

	-- ESC (Android 뒤로가기): 어느 상태에서든 게임 종료
	if Input.IsKeyDown(VK_ESCAPE) then
		GameExit()
		return
	end

	if st.state == "ready" then
		st.readyTime = st.readyTime + dt
		if C.flapPressed(st) or (st.autoplay and st.readyTime > 1.0) then
			st.state = "play"
			st.birdVy = C.FLAP
			C.sfx("flap")
		end
	elseif st.state == "dead" then
		st.deadTime = st.deadTime + dt
		if st.deadTime > 0.6 and (not st.autoplay) and Input.IsMouseDown(0) and Input.GetMouseY() < st.H / 3 then
			GameExit() -- 화면 상단 터치: 종료
		elseif (st.deadTime > 0.6 and C.flapPressed(st)) or (st.autoplay and st.deadTime > 1.5) then
			st.state = "ready"
			C.resetGame(st)
		end
	end

	st.ticks = st.ticks + 1
	if st.state ~= st.lastState then
		st.lastState = st.state
		print("flappy:state:" .. st.state)
	end
	if st.score ~= st.lastScore then
		st.lastScore = st.score
		print("flappy:score:" .. st.score)
	end
	if st.autoplay and st.ticks >= C.TICK_BUDGET then
		print(string.format("flappyFinal state=%s score=%d best=%d ticks=%d",
			st.state, st.score, st.best, st.ticks))
		GameExit()
	end

	M.updateHud(st)
end

return M
