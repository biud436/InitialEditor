-- interpreter.lua : 이벤트 스크립트 실행기 (6단계, docs/plans/06-rpg-events.md)
--
-- 이벤트 스크립트는 코루틴으로 돈다. 스크립트가 ctx.message나 ctx.wait를
-- 부르면 요청 테이블을 yield하고, 실행기가 그 요청이 끝날 때까지 재개하지
-- 않는다. 덕분에 "대화창이 닫힐 때까지 기다린다"가 콜백 없이 표현된다.
--
-- 실행 규칙
--   - 막는 이벤트(action, touch, auto)는 한 번에 하나만 돈다. 도는 동안
--     isBusy()가 참이고, 씬은 그동안 플레이어 조작을 잠근다.
--   - parallel 이벤트는 각자 코루틴으로 매 프레임 돌며 조작을 잠그지 않는다.
--   - 시간은 전부 프레임 수로 잰다 (고정 16ms 스텝, 09-testing.md 4절).
--
-- 이 파일도 엔진 전역을 부르지 않는다. 대화창과 맵 전환은 주입받은 항구(port)로
-- 나간다. 7단계에서 messagePort를 진짜 대화창(message.lua)으로 갈아 끼웠고,
-- 테스트는 여전히 print 스텁이나 가짜 항구를 쓴다.
--
--   local interp = Interpreter.new{
--       host = { transfer = function(map, x, y) ... end,
--                characterById = function(id) ... end },
--       messagePort = 대화창,        -- 없으면 print 스텁
--       onStart = function(event) ... end,   -- 이벤트가 실제로 시작될 때 (첫 재개 전)
--   }

local M = {}

M.MS_PER_FRAME = 1000 / 60

--- 대화창 없이 돌 때 쓰는 스텁 (테스트, 헤드리스). print로 남기고 즉시 끝난다.
--- 진짜 대화창은 scripts/lua/rpg/message.lua의 Dialogue:port()다 (7단계).
function M.printPort()
	local port = { busy = false, value = nil }
	function port.showMessage(text)
		print("[message] " .. tostring(text))
		port.busy = false
	end
	function port.showChoice(options)
		print("[choice] " .. table.concat(options, " / "))
		port.value = 1          -- 스텁은 항상 첫 항목
		port.busy = false
	end
	function port.isBusy() return port.busy end
	function port.result() return port.value end
	return port
end

local Interp = {}
Interp.__index = Interp
M.Interpreter = Interp

function M.new(opts)
	opts = opts or {}
	local self = setmetatable({}, Interp)
	self.host = opts.host or {}
	self.messagePort = opts.messagePort or M.printPort()
	self.state = opts.state or {}    -- 이벤트가 공유하는 저장 대상 테이블
	self.running = nil               -- 막는 이벤트 하나
	self.parallels = {}              -- 병렬 이벤트들
	self.errors = {}                 -- 스크립트 오류 기록 (테스트가 본다)
	self.leaves = 0                  -- transfer 와 scene 요청 수 (맵이나 씬을 떠나는 요청)
	self.onStart = opts.onStart      -- function(event). 시작이 받아들여졌을 때, 첫 재개 전에 부른다
	self.ctx = M.makeCtx(self)
	return self
end

--- 이벤트 스크립트가 부르는 API. 전부 coroutine.yield로 요청을 넘긴다.
function M.makeCtx(interp)
	local ctx = {}

	ctx.state = interp.state

	--- 대화 한 줄. 대화창이 닫힐 때까지 대기한다.
	-- opts는 대화창(7단계 message.lua)이 해석한다: face = { file, index }, name = 화자.
	function ctx.message(text, opts)
		return coroutine.yield{ message = tostring(text), messageOpts = opts }
	end

	--- 선택지. 고른 항목의 번호(1부터)를 돌려준다.
	-- opts.cancelIndex를 주면 취소키가 그 번호로 빠져나간다.
	function ctx.choice(options, opts)
		assert(type(options) == "table" and #options > 0, "ctx.choice: 항목이 필요하다")
		return coroutine.yield{ choice = options, choiceOpts = opts }
	end

	--- ms 만큼 대기 (고정 스텝이라 프레임으로 환산한다)
	function ctx.wait(ms)
		local frames = math.max(1, math.floor((tonumber(ms) or 0) / M.MS_PER_FRAME))
		return coroutine.yield{ wait = frames }
	end

	--- 다른 맵으로 이동. 이 호출 이후의 스크립트는 실행되지 않는다
	--- (맵이 통째로 바뀌므로 이벤트도 사라진다).
	function ctx.transfer(mapId, x, y, dir)
		return coroutine.yield{ transfer = { map = mapId, x = x, y = y, dir = dir } }
	end

	--- 이동 루트. who는 이벤트 id 또는 "player", route는 character.lua의 명령 배열.
	-- opts.wait = false 면 루트가 끝나기를 기다리지 않는다.
	function ctx.moveRoute(who, route, opts)
		return coroutine.yield{
			moveRoute = { who = who, route = route,
				wait = not (opts ~= nil and opts.wait == false),
				loop = opts ~= nil and opts.loop or false },
		}
	end

	--- 방향만 바꾼다.
	function ctx.turn(who, dir)
		return coroutine.yield{ turn = { who = who, dir = dir } }
	end

	-- 아래 넷은 씬에 위임한다 (9단계). 프레임워크는 오디오 장치도 화면 구성도
	-- 모르는 채로 두고, 무엇을 어떻게 낼지는 호스트가 정한다 — transfer와 같은 방식이다.

	--- 효과음 한 번. 기다리지 않는다.
	function ctx.playSe(file, id)
		return coroutine.yield{ playSe = { file = file, id = id } }
	end

	--- 배경음을 건다. 같은 곡이면 호스트 쪽에서 이어서 재생한다.
	function ctx.playBgm(file, opts)
		return coroutine.yield{ playBgm = { file = file, opts = opts } }
	end

	--- 화면에 장소 이름을 잠깐 띄운다.
	function ctx.showLocation(text, seconds)
		return coroutine.yield{ showLocation = { text = text, seconds = seconds } }
	end

	--- 다른 씬으로 나간다 (에필로그 뒤 타이틀 등). 이 호출 이후는 실행되지 않는다.
	function ctx.scene(name, opts)
		return coroutine.yield{ scene = { name = name, opts = opts } }
	end

	return ctx
end

-- ---- 실행 ----------------------------------------------------------------

local function entryFor(event)
	return {
		event = event,
		co = coroutine.create(event.script),
		wait = nil,
		started = false,
	}
end

--- 이벤트 실행 시작. parallel이면 병렬 목록에, 그 외에는 단 하나의 슬롯에 놓는다.
-- @return 시작했으면 true
function Interp:start(event)
	if event == nil or event.script == nil then return false end

	if event.trigger == "parallel" then
		for _, e in ipairs(self.parallels) do
			if e.event == event then return false end   -- 이미 돌고 있다
		end
		if self.onStart ~= nil then self.onStart(event) end
		local entry = entryFor(event)
		self:step(entry)
		if not entry.dead then
			table.insert(self.parallels, entry)
		end
		return true
	end

	if self.running ~= nil then return false end
	if self.onStart ~= nil then self.onStart(event) end
	local entry = entryFor(event)
	self:step(entry)
	-- 한 프레임 만에 끝나는 스크립트도 있다. 그런 이벤트가 조작을 잠그면 안 된다.
	if not entry.dead then
		self.running = entry
	end
	return true
end

--- 막는 이벤트가 도는 중인가 (조작 잠금 판단)
function Interp:isBusy()
	return self.running ~= nil
end

--- 지금까지 받은 transfer 와 scene 요청 수. 이벤트 관리자가 맵을 떠나는 중인지 본다.
function Interp:leaveCount()
	return self.leaves
end

--- 전부 중단한다 (맵 전환).
function Interp:clear()
	self.running = nil
	self.parallels = {}
end

-- 요청 하나를 대기 객체로 바꾼다.
--
-- "즉시 끝나는" 요청(turn, wait 없는 moveRoute 등)도 프레임 0짜리 대기를 돌려주지
-- 곧바로 재개하지는 않는다. 한 프레임에 한 번만 재개한다는 규칙이 있어야
-- `while true do ctx.turn(...) end` 같은 스크립트가 게임을 얼려 버리지 않는다.
function Interp:beginWait(request)
	if request == nil then
		return { kind = "frames", frames = 0 }
	end

	if request.wait ~= nil then
		return { kind = "frames", frames = request.wait }
	end

	if request.message ~= nil then
		self.messagePort.showMessage(request.message, request.messageOpts)
		return { kind = "message" }
	end

	if request.choice ~= nil then
		self.messagePort.showChoice(request.choice, request.choiceOpts)
		return { kind = "choice" }
	end

	if request.transfer ~= nil then
		self.leaves = self.leaves + 1
		local t = request.transfer
		if self.host.transfer ~= nil then
			self.host.transfer(t.map, t.x, t.y, t.dir)
		end
		-- 맵이 통째로 바뀌었으므로 이 스크립트는 여기서 끝낸다. 씬이 clear를
		-- 부르지 않더라도 조작 잠금이 남지 않게 스스로 죽는다.
		return { kind = "kill" }
	end

	if request.moveRoute ~= nil then
		local r = request.moveRoute
		local who = self:resolve(r.who)
		if who == nil then
			return { kind = "frames", frames = 0 }
		end
		who:setRoute(r.route, { loop = r.loop })
		if not r.wait then
			return { kind = "frames", frames = 0 }
		end
		return { kind = "route", who = who }
	end

	if request.turn ~= nil then
		local who = self:resolve(request.turn.who)
		if who ~= nil then who:turn(request.turn.dir) end
		return { kind = "frames", frames = 0 }
	end

	if request.playSe ~= nil then
		if self.host.playSe ~= nil then
			self.host.playSe(request.playSe.file, request.playSe.id)
		end
		return { kind = "frames", frames = 0 }
	end

	if request.playBgm ~= nil then
		if self.host.playBgm ~= nil then
			self.host.playBgm(request.playBgm.file, request.playBgm.opts)
		end
		return { kind = "frames", frames = 0 }
	end

	if request.showLocation ~= nil then
		if self.host.showLocation ~= nil then
			self.host.showLocation(request.showLocation.text, request.showLocation.seconds)
		end
		return { kind = "frames", frames = 0 }
	end

	if request.scene ~= nil then
		self.leaves = self.leaves + 1
		if self.host.scene ~= nil then
			self.host.scene(request.scene.name, request.scene.opts)
		end
		-- 씬이 통째로 바뀐다. transfer와 같은 이유로 여기서 스크립트를 끝낸다.
		return { kind = "kill" }
	end

	-- 모르는 요청은 한 프레임 쉬고 넘어간다 (스크립트가 멈춰 서는 것보다 낫다)
	return { kind = "frames", frames = 0 }
end

--- "player" 또는 이벤트 id를 Character로 바꾼다.
function Interp:resolve(who)
	if who == nil then return nil end
	if type(who) == "table" then return who end          -- 캐릭터를 직접 넘긴 경우
	if self.host.characterById ~= nil then
		return self.host.characterById(who)
	end
	return nil
end

-- 대기가 끝났는가. 끝났으면 재개할 값도 함께 돌려준다.
function Interp:pollWait(wait)
	if wait == nil then return true, nil end

	if wait.kind == "frames" then
		if wait.frames <= 0 then return true, nil end
		wait.frames = wait.frames - 1
		return false, nil
	end

	if wait.kind == "message" then
		return not self.messagePort.isBusy(), nil
	end

	if wait.kind == "choice" then
		if self.messagePort.isBusy() then return false, nil end
		return true, self.messagePort.result()
	end

	if wait.kind == "route" then
		return wait.who:isRouteDone(), nil
	end

	return true, nil
end

-- 코루틴을 한 번 재개한다.
function Interp:step(entry)
	local ok, request
	if not entry.started then
		entry.started = true
		ok, request = coroutine.resume(entry.co, entry.event, self.ctx)
	else
		ok, request = coroutine.resume(entry.co, entry.resumeValue)
		entry.resumeValue = nil
	end

	if not ok then
		-- 스크립트 오류는 게임 전체를 멈추지 않는다. 기록하고 그 이벤트만 끝낸다.
		local msg = string.format("이벤트 '%s' 실행 오류: %s",
			tostring(entry.event.id), tostring(request))
		print(msg)
		table.insert(self.errors, msg)
		entry.dead = true
		return
	end

	if coroutine.status(entry.co) == "dead" then
		entry.dead = true
		return
	end

	entry.wait = self:beginWait(request)
	if entry.wait ~= nil and entry.wait.kind == "kill" then
		entry.wait = nil
		entry.dead = true
	end
end

-- 대기 중인 항목 하나를 굴린다.
function Interp:advance(entry)
	if entry.dead then return end
	local done, value = self:pollWait(entry.wait)
	if not done then return end
	entry.wait = nil
	entry.resumeValue = value
	self:step(entry)
end

--- 매 프레임 호출한다.
function Interp:update()
	-- 병렬 이벤트가 먼저 (조작 잠금과 무관하게 항상 돈다)
	local i = 1
	while i <= #self.parallels do
		local entry = self.parallels[i]
		self:advance(entry)
		if entry.dead then
			table.remove(self.parallels, i)
		else
			i = i + 1
		end
	end

	if self.running ~= nil then
		self:advance(self.running)
		if self.running.dead then
			self.running = nil
		end
	end
end

return M
