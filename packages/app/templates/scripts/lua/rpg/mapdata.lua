-- mapdata.lua : 맵 파일에 실려 온 이벤트 (9단계 마일스톤 3, docs/plans/10-demo-v2.md)
--
-- 맵 포맷 v2는 타일 옆에 `events` 배열을 싣는다. 좌표와 커맨드가 전부 데이터라
-- 맵 에디터가 그 자리에서 만들고 저장할 수 있다 — 이슈 24의 "이벤트 커맨드 배치"가
-- 향하는 곳이다. v1 파일(events 없음)은 그대로 열린다.
--
--   { "version": 2, ..., "events": [
--       { "id": "sign", "x": 1, "y": 0, "trigger": "action",
--         "commands": [ { "code": "message", "text": "..." } ] } ] }
--
-- 한 맵의 이벤트는 두 곳에서 온다.
--   맵 JSON        에디터가 놓은 것 (순수 데이터)
--   맵 정의 Lua    사람이 쓴 것 (커맨드로 적기 어려운 script 함수, 배회 설정 등)
-- 같은 id면 Lua 쪽이 이긴다. 에디터가 놓은 이벤트에 Lua로 살을 붙이는 길을
-- 열어 두기 위해서다 (좌표는 에디터가, 스크립트는 사람이).
--
-- 엔진 바인딩을 늘리지 않는다. 맵 JSON은 1단계의 Json.Load로 읽는다.

local Commands = require("scripts/lua/rpg/commands")
local Assets = require("scripts/lua/rpg/assets")
local Event = require("scripts/lua/rpg/event")
local Character = require("scripts/lua/rpg/character")
local Shape = require("scripts/lua/rpg/jsonshape")

local M = {}

-- 이벤트 id 로 쓸 수 없는 이름 (moveRoute 와 turn 의 target 에서 플레이어를 가리킨다)
M.RESERVED_IDS = { player = true }

--- 맵 JSON에서 이벤트 배열만 읽는다.
-- @param mapPath  맵 파일 경로
-- @param loader   function(path) -> table, err (기본 전역 Json.Load)
-- @return 이벤트 배열 (없으면 빈 배열), 맵 버전, 오류 메시지
function M.loadEvents(mapPath, loader)
	loader = loader or (_G.Json ~= nil and _G.Json.Load) or nil
	if loader == nil or mapPath == nil then
		return {}, nil, "mapdata: Json.Load 사용 불가"
	end

	local data, err = loader(mapPath)
	if data == nil then
		return {}, nil, tostring(err)
	end
	return data.events or {}, data.version, nil
end

--- 맵에서 온 이벤트와 정의 파일의 이벤트를 합친다. 같은 id면 정의 파일이 이긴다.
-- 순서는 "맵에 있던 것 먼저, 정의 파일에만 있는 것 나중"이며, 정의 파일이
-- 덮어쓴 이벤트는 원래 자리를 지킨다 (auto 이벤트의 실행 순서가 흔들리지 않게).
-- @return 합친 배열, 정의 파일이 덮어쓴 맵 이벤트의 id 배열 (맵 파일 순서)
function M.merge(mapEvents, defEvents)
	local byId, order = {}, {}
	local fromMap, overriddenSet = {}, {}

	local function put(def, isMap)
		if type(def) ~= "table" or def.id == nil then return end
		if byId[def.id] == nil then
			order[#order + 1] = def.id
		end
		byId[def.id] = def
		if isMap then
			fromMap[def.id] = true
		elseif fromMap[def.id] then
			overriddenSet[def.id] = true
		end
	end

	for _, def in ipairs(mapEvents or {}) do put(def, true) end
	for _, def in ipairs(defEvents or {}) do put(def, false) end

	local merged, overridden = {}, {}
	for _, id in ipairs(order) do
		merged[#merged + 1] = byId[id]
		if overriddenSet[id] then overridden[#overridden + 1] = id end
	end
	return merged, overridden
end

-- ---- 검사 -------------------------------------------------------------------
--
-- 맵 파일의 이벤트는 에디터와 도구가 쓴다. 게임이 맵을 열 때 전부 검사해 틀린
-- 이벤트만 건너뛴다. 경로는 1부터 세는 Lua 표기다 (docs/plans/m2-rpg-events.md 3절).

local isInteger = Shape.isInteger

local function isNonNegInt(v) return isInteger(v) and v >= 0 end

-- 배회 기본값 (character.lua 의 setWander 와 같다)
local WANDER_MIN, WANDER_MAX = 30, 120

local function checkWander(wander, here, add)
	if not Shape.isObject(wander) then
		add(here, "배회는 객체여야 함")
		return
	end
	if wander.minWait ~= nil and not isNonNegInt(wander.minWait) then
		add(here .. ".minWait", "0 이상의 정수여야 함")
	end
	if wander.maxWait ~= nil and not isNonNegInt(wander.maxWait) then
		add(here .. ".maxWait", "0 이상의 정수여야 함")
	end
	local minWait = wander.minWait == nil and WANDER_MIN or wander.minWait
	local maxWait = wander.maxWait == nil and WANDER_MAX or wander.maxWait
	if isNonNegInt(minWait) and isNonNegInt(maxWait) and minWait > maxWait then
		local where = wander.maxWait ~= nil and ".maxWait" or ".minWait"
		add(here .. where, "minWait 는 maxWait 이하여야 함 (현재: minWait " .. minWait .. ", maxWait " .. maxWait .. ")")
	end
	local area = wander.area
	if area ~= nil then
		if not Shape.isObject(area) then
			add(here .. ".area", "배회 영역은 객체여야 함")
		else
			for _, key in ipairs({ "x", "y" }) do
				if not isNonNegInt(area[key]) then
					add(here .. ".area." .. key, "0 이상의 정수여야 함")
				end
			end
			for _, key in ipairs({ "w", "h" }) do
				if not (isInteger(area[key]) and area[key] >= 1) then
					add(here .. ".area." .. key, "1 이상의 정수여야 함")
				end
			end
		end
	end
end

-- 이벤트 하나를 검사한다. seen 은 앞 이벤트들의 id 모음이다.
local function checkEvent(ev, here, seen, env, add)
	if not Shape.isObject(ev) then
		add(here, "이벤트는 객체여야 함")
		return
	end

	local id = ev.id
	if type(id) ~= "string" or id == "" then
		add(here .. ".id", "id 는 비어 있지 않은 문자열이어야 함")
	elseif M.RESERVED_IDS[id] then
		add(here .. ".id", "예약된 id: " .. id)
	elseif seen[id] ~= nil then
		add(here .. ".id", "id " .. id .. " 중복 (events[" .. seen[id] .. "])")
	end

	for _, key in ipairs({ "x", "y" }) do
		if not isNonNegInt(ev[key]) then
			add(here .. "." .. key, "0 이상의 정수여야 함 (현재: " .. tostring(ev[key]) .. ")")
		end
	end
	if ev.dir ~= nil and (type(ev.dir) ~= "string" or Character.DIR_VECTORS[ev.dir] == nil) then
		add(here .. ".dir", "지원하지 않는 방향: " .. tostring(ev.dir))
	end
	if ev.trigger ~= nil and (type(ev.trigger) ~= "string" or not Event.TRIGGERS[ev.trigger]) then
		add(here .. ".trigger", "지원하지 않는 트리거: " .. tostring(ev.trigger))
	end
	if ev.charset ~= nil then
		for _, p in ipairs(Assets.checkRef("charset", ev.charset)) do
			add(here .. ".charset" .. p.path, "외형: " .. p.message)
		end
	end
	for _, key in ipairs({ "through", "solid" }) do
		if ev[key] ~= nil and type(ev[key]) ~= "boolean" then
			add(here .. "." .. key, "불리언이어야 함")
		end
	end
	if ev.speed ~= nil and not (type(ev.speed) == "number" and ev.speed > 0
		and ev.speed ~= math.huge) then
		add(here .. ".speed", "0보다 큰 숫자여야 함")
	end
	if ev.wander ~= nil then
		checkWander(ev.wander, here .. ".wander", add)
	end
	if ev.commands ~= nil then
		for _, p in ipairs(Commands.problems(ev.commands, env, here .. ".commands")) do
			add(p.path, p.message)
		end
	end
end

--- 맵 파일의 이벤트 배열을 검사한다 (병합 전).
-- @param events  맵 파일의 events
-- @param env.scripts  script 커맨드가 이름으로 부를 함수 표 (정의 파일의 scripts)
-- @return ok, problems, valid, skipped
--   problems  { { index = i, path = "events[i].x", message = 이유 }, ... }
--   valid     문제가 없는 이벤트만 원래 순서로 모은 배열
--   skipped   문제가 있어 뺀 이벤트 수
function M.validateEvents(events, env)
	local problems, valid = {}, {}
	if events == nil then return true, problems, valid, 0 end
	if not Shape.isArray(events) then
		problems[1] = { index = nil, path = "events", message = "이벤트 목록은 배열이어야 함" }
		return false, problems, valid, 0
	end

	local seen, skipped = {}, 0
	for i = 1, Shape.length(events) do
		local ev = events[i]
		local here = "events[" .. i .. "]"
		local before = #problems
		checkEvent(ev, here, seen, env, function(path, message)
			problems[#problems + 1] = { index = i, path = path, message = message }
		end)
		if Shape.isObject(ev) and type(ev.id) == "string" and seen[ev.id] == nil then
			seen[ev.id] = i
		end
		if #problems == before then
			valid[#valid + 1] = ev
		else
			skipped = skipped + 1
		end
	end
	return #problems == 0, problems, valid, skipped
end

-- ---- 자산 풀기 --------------------------------------------------------------

local function copy(value)
	if type(value) ~= "table" then return value end
	local out = {}
	for k, v in pairs(value) do out[k] = copy(v) end
	return out
end

-- { set, index } 를 { file, index } 로 바꾼 사본. 풀 수 없으면 그대로 둔다.
local function resolveRef(assets, kind, ref)
	if type(ref) ~= "table" or ref.set == nil or ref.file ~= nil then return ref end
	local file = assets.resolveRef(kind, ref)
	if file == nil then return ref end
	local out = {}
	for k, v in pairs(ref) do
		if k ~= "set" then out[k] = v end
	end
	out.file = file
	return out
end

--- 이벤트의 외형(charset)과 대화의 얼굴(message.face)에 적힌 논리 이름을 파일로 푼다.
-- 하위 목록 안의 대화까지 푼다. 원본은 그대로 두고 사본을 돌려준다.
-- @param assets  scripts/lua/rpg/assets 모듈 (없으면 require)
function M.resolveAssets(events, assets)
	assets = assets or Assets
	local out = {}
	for i = 1, Shape.length(events) do
		local ev = events[i]
		if type(ev) == "table" then
			local resolved = {}
			for k, v in pairs(ev) do resolved[k] = v end
			resolved.charset = resolveRef(assets, "charset", ev.charset)
			if type(ev.commands) == "table" then
				resolved.commands = copy(ev.commands)
				Commands.walk(resolved.commands, function(cmd)
					if cmd.code == "message" and cmd.face ~= nil then
						cmd.face = resolveRef(assets, "face", cmd.face)
					end
				end)
			end
			out[i] = resolved
		else
			out[i] = ev
		end
	end
	return out
end

--- 맵 정의(Lua)와 맵 파일(JSON)을 합쳐 최종 이벤트 목록을 만든다.
-- @param def     맵 정의 테이블 (map, events, ...)
-- @param loader  Json.Load 대체 (테스트용)
-- @return 이벤트 배열, 오류 메시지, 정의 파일이 덮어쓴 id 배열
function M.eventsFor(def, loader)
	if def == nil then return {}, "mapdata: 맵 정의 없음", {} end
	local fromMap, _, err = M.loadEvents(def.map, loader)
	local merged, overridden = M.merge(fromMap, def.events)
	return merged, err, overridden
end

return M
