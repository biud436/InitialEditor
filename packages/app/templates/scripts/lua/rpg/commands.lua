-- commands.lua : 이벤트 커맨드 (9단계, docs/plans/10-demo-v2.md)
--
-- 이벤트 하나를 **데이터 목록**으로 적는다. 6단계에서는 이벤트가 Lua 함수였고
-- 그것은 사람이 쓰기에는 좋았지만 맵 에디터가 만들 수도 읽을 수도 없었다
-- (이슈 24). 커맨드 목록은 순수 데이터라 JSON으로 오갈 수 있다.
--
--   commands = {
--     { code = "message", name = "선장", text = "저녁 물때에 배가 뜨네." },
--     { code = "choice", options = { "떠난다", "더 둘러본다" }, cancel = 2,
--       branches = {
--         { { code = "scene", name = "title", fade = true } },
--         { { code = "message", text = "해가 지기 전에는 오게." } },
--       } },
--   }
--
-- 실행기(interpreter.lua)는 이 파일의 존재를 모른다. compile이 커맨드 목록을
-- 6단계와 똑같은 `function(self, ctx)` 하나로 바꿔 주고, 실행기는 그것을
-- 코루틴으로 돌릴 뿐이다. 그래서 `script = function(self, ctx) ... end`로 적은
-- 옛 이벤트도 그대로 돈다 — 커맨드로 적기 어려운 것(전투, 미니게임)은 계속
-- 그쪽에 남기라는 뜻이기도 하다 (`script` 커맨드가 그 통로다).
--
-- 분기는 중첩이지 점프가 아니다. RPG Maker는 평탄한 목록에 들여쓰기로 분기를
-- 표현하지만, JSON과 웹 에디터에는 중첩 배열이 다루기 쉽고 라벨 관리가 없다.

local Inventory = require("scripts/lua/rpg/inventory")
local Assets = require("scripts/lua/rpg/assets")
local Character = require("scripts/lua/rpg/character")
local Shape = require("scripts/lua/rpg/jsonshape")

local M = {}

-- ---- 조건 -----------------------------------------------------------------

local COMPARE = {
	["=="] = function(a, b) return a == b end,
	["="] = function(a, b) return a == b end,
	["~="] = function(a, b) return a ~= b end,
	["!="] = function(a, b) return a ~= b end,
	["<"] = function(a, b) return a < b end,
	["<="] = function(a, b) return a <= b end,
	[">"] = function(a, b) return a > b end,
	[">="] = function(a, b) return a >= b end,
}

-- 조건의 꼴. 키가 둘 이상인 조건은 이 순서의 앞 것으로 판정한다.
M.CONDITIONS = { "item", "flag", "var" }

local CONDITION_TESTS = {
	item = function(cond, state)
		local have = Inventory.count(state, cond.item)
		if cond.op == nil and cond.value == nil then
			return have >= 1
		end
		local op = COMPARE[cond.op or ">="]
		if op == nil then return false end
		return op(have, tonumber(cond.value) or 1)
	end,
	flag = function(cond, state)
		local v = state[cond.flag]
		if cond.equals ~= nil then return v == cond.equals end
		return v ~= nil and v ~= false
	end,
	var = function(cond, state)
		local op = COMPARE[cond.op or "=="]
		if op == nil then return false end
		return op(tonumber(state[cond.var]) or 0, tonumber(cond.value) or 0)
	end,
}

--- 조건 하나를 판정한다. 조건이 없으면 참.
--   { flag = "heardAltar" }                        깃발이 참인가
--   { flag = "booked", equals = false }            값 비교
--   { var = "silver", op = ">=", value = 2 }       수 비교
--   { item = "warehouse_key" }                     하나라도 가졌는가 (10단계)
--   { item = "silver", op = ">=", value = 2 }      개수 비교
function M.test(cond, state)
	if cond == nil then return true end
	state = state or {}
	for _, kind in ipairs(M.CONDITIONS) do
		if cond[kind] ~= nil then
			return CONDITION_TESTS[kind](cond, state)
		end
	end
	return true
end

-- ---- 커맨드 ---------------------------------------------------------------
--
-- 각 항목: 인자 명세와 run(cmd, self, ctx, env, runList).
-- 인자 명세는 resources/schema/event-commands.json 의 args 와 이름, 순서, 타입, 필수 여부,
-- min, max, enum 의 values, ref 의 종류가 같다 (rpg_event_schema_test [C] 가 대조한다).
-- 검증은 이 명세로 있는 인자마다 타입을 본다 (checkArg).

local HANDLERS = {}
local ARGS = {}

local function sortedKeys(t)
	local keys = {}
	for k in pairs(t) do keys[#keys + 1] = k end
	table.sort(keys)
	return keys
end

-- 검증이 아는 인자 타입과 이유 글에 쓰는 이름 (charset, wander, list 는 이벤트 칸이라 mapdata 가 본다)
local TYPE_NAMES = {
	string = "문자열", text = "문자열", enum = "문자열", ref = "id 문자열", file = "경로 문자열",
	integer = "정수", number = "숫자", boolean = "불리언", scalar = "불리언, 숫자, 문자열 중 하나",
	json = "JSON 값", face = "얼굴 객체", options = "항목 배열", route = "루트 단계 배열",
	condition = "조건 객체",
}

local function define(code, args, run)
	for _, arg in ipairs(args) do
		assert(TYPE_NAMES[arg.type] ~= nil,
			"commands: 지원하지 않는 인자 타입: " .. tostring(arg.type) .. " (" .. code .. "." .. tostring(arg.name) .. ")")
	end
	ARGS[code] = args
	HANDLERS[code] = run
end

-- 방향 enum 의 값
local DIRS = sortedKeys(Character.DIR_VECTORS)

-- setVar 의 op 값 (없으면 "=")
M.SET_VAR_OPS = { "=", "+", "-" }

define("message", {
	{ name = "text", type = "text", required = true },
	{ name = "name", type = "string" },
	{ name = "face", type = "face" },
}, function(cmd, _, ctx)
	local opts = nil
	if cmd.name ~= nil or cmd.face ~= nil then
		opts = { name = cmd.name, face = cmd.face }
	end
	ctx.message(cmd.text, opts)
end)

define("choice", {
	{ name = "options", type = "options", required = true, min = 1 },
	{ name = "cancel", type = "integer", min = 1 },
}, function(cmd, self, ctx, env, runList)
	local pick = ctx.choice(cmd.options, { cancelIndex = cmd.cancel })
	local branch = cmd.branches ~= nil and cmd.branches[pick] or nil
	if branch ~= nil then
		runList(branch, self, ctx, env)
	end
	return pick
end)

define("wait", {
	{ name = "ms", type = "integer", required = true, min = 0 },
}, function(cmd, _, ctx)
	ctx.wait(cmd.ms)
end)

define("transfer", {
	{ name = "map", type = "ref", ref = "map", required = true },
	{ name = "x", type = "integer", min = 0 },
	{ name = "y", type = "integer", min = 0 },
	{ name = "dir", type = "enum", values = DIRS },
}, function(cmd, _, ctx)
	-- 이 뒤의 커맨드는 실행되지 않는다 (맵이 통째로 바뀐다)
	ctx.transfer(cmd.map, cmd.x, cmd.y, cmd.dir)
end)

define("moveRoute", {
	{ name = "target", type = "ref", ref = "character", required = true },
	{ name = "route", type = "route", required = true },
	{ name = "wait", type = "boolean" },
	{ name = "loop", type = "boolean" },
}, function(cmd, _, ctx)
	ctx.moveRoute(cmd.target, cmd.route, { wait = cmd.wait, loop = cmd.loop })
end)

define("turn", {
	{ name = "target", type = "ref", ref = "character", required = true },
	{ name = "dir", type = "enum", values = DIRS, required = true },
}, function(cmd, _, ctx)
	ctx.turn(cmd.target, cmd.dir)
end)

define("setFlag", {
	{ name = "key", type = "ref", ref = "flag", required = true },
	{ name = "value", type = "scalar" },
}, function(cmd, _, ctx)
	local value = cmd.value
	if value == nil then value = true end
	ctx.state[cmd.key] = value
end)

define("setVar", {
	{ name = "key", type = "ref", ref = "var", required = true },
	{ name = "op", type = "enum", values = M.SET_VAR_OPS },
	{ name = "value", type = "number" },
}, function(cmd, _, ctx)
	local now = tonumber(ctx.state[cmd.key]) or 0
	local amount = tonumber(cmd.value) or 0
	local op = cmd.op or "="
	if op == "+" then
		ctx.state[cmd.key] = now + amount
	elseif op == "-" then
		ctx.state[cmd.key] = now - amount
	else
		ctx.state[cmd.key] = amount
	end
end)

define("giveItem", {
	{ name = "item", type = "ref", ref = "item", required = true },
	{ name = "count", type = "integer", min = 1 },
}, function(cmd, _, ctx)
	Inventory.give(ctx.state, cmd.item, cmd.count)
end)

define("takeItem", {
	{ name = "item", type = "ref", ref = "item", required = true },
	{ name = "count", type = "integer", min = 1 },
}, function(cmd, _, ctx)
	-- 모자라면 아무 일도 일어나지 않는다. 반쯤 빼고 실패하는 경우가 없어야
	-- 이벤트가 스스로를 되돌릴 필요가 없다 (inventory.take의 규칙).
	return Inventory.take(ctx.state, cmd.item, cmd.count)
end)

define("if", {
	{ name = "cond", type = "condition", required = true },
}, function(cmd, self, ctx, env, runList)
	-- `참 and thenDo or elseDo`로 쓰면 안 된다. thenDo가 없는 참 분기가
	-- elseDo로 새어 나간다 (Lua의 and/or 관용구가 nil에서 무너지는 자리).
	local branch
	if M.test(cmd.cond, ctx.state) then
		branch = cmd.thenDo
	else
		branch = cmd.elseDo
	end
	if branch ~= nil then
		runList(branch, self, ctx, env)
	end
end)

define("playSe", {
	{ name = "file", type = "file", required = true },
	{ name = "id", type = "string" },
}, function(cmd, _, ctx)
	ctx.playSe(cmd.file, cmd.id)
end)

define("playBgm", {
	{ name = "file", type = "file", required = true },
	{ name = "volume", type = "integer", min = 0, max = 128 },
	{ name = "fade", type = "integer", min = 0 },
}, function(cmd, _, ctx)
	ctx.playBgm(cmd.file, { volume = cmd.volume, fade = cmd.fade })
end)

define("showLocation", {
	{ name = "text", type = "string", required = true },
	{ name = "seconds", type = "number", min = 0 },
}, function(cmd, _, ctx)
	ctx.showLocation(cmd.text, cmd.seconds)
end)

define("scene", {
	{ name = "name", type = "string", required = true },
	{ name = "fade", type = "boolean" },
	{ name = "text", type = "string" },
}, function(cmd, _, ctx)
	-- 씬이 통째로 바뀌므로 이 뒤의 커맨드는 실행되지 않는다
	ctx.scene(cmd.name, { fade = cmd.fade, text = cmd.text })
end)

-- name 은 스키마에서 필수지만 Lua 정의 파일은 이름 대신 run 함수를 줄 수 있다.
-- 이름이 있는지와 등록되었는지는 validate 의 따로 규칙이 본다.
define("script", {
	{ name = "name", type = "string" },
	{ name = "args", type = "json" },
}, function(cmd, self, ctx, env)
	local fn = cmd.run
	if fn == nil and cmd.name ~= nil then
		fn = env ~= nil and env.scripts ~= nil and env.scripts[cmd.name] or nil
	end
	assert(type(fn) == "function",
		"commands: script 커맨드가 호출할 함수 없음 (" .. tostring(cmd.name) .. ")")
	return fn(self, ctx, cmd.args)
end)

define("comment", {
	{ name = "text", type = "text" },
}, function() end)

-- 조건의 비교 연산 (item 과 var 의 op). COMPARE 의 별칭 = 과 != 는 스키마에 없다.
M.COMPARE_OPS = { "==", "~=", "<", "<=", ">", ">=" }

-- 조건 꼴마다의 인자 명세. event-commands.json 의 conditions 와 같다 (테스트 [E] 가 대조한다).
local CONDITION_ARGS = {
	item = {
		{ name = "item", type = "ref", ref = "item", required = true },
		{ name = "op", type = "enum", values = M.COMPARE_OPS },
		{ name = "value", type = "integer", min = 0 },
	},
	flag = {
		{ name = "flag", type = "ref", ref = "flag", required = true },
		{ name = "equals", type = "scalar" },
	},
	var = {
		{ name = "var", type = "ref", ref = "var", required = true },
		{ name = "op", type = "enum", values = M.COMPARE_OPS },
		{ name = "value", type = "number" },
	},
}

-- 하위 목록을 품는 커맨드와 그 칸. perOption 이 있는 칸은 그 인자의 항목마다
-- 목록이 하나씩 있는 배열이다 (branches[i] 가 options[i] 의 가지).
local LISTS = {
	choice = { { name = "branches", perOption = "options" } },
	["if"] = { { name = "thenDo" }, { name = "elseDo" } },
}

-- 커맨드 하나가 품은 하위 목록들. { path = ".branches[1]", list = 값 } 의 배열이며
-- 목록 자리에 배열이 아닌 값(가지 자리의 null 포함)이 있으면 { path, notArray = true } 로 알린다.
local function childLists(cmd)
	local out = {}
	for _, spec in ipairs(LISTS[cmd.code] or {}) do
		local value = cmd[spec.name]
		local here = "." .. spec.name
		if value ~= nil and not Shape.isArray(value) then
			out[#out + 1] = { path = here, notArray = true }
		elseif value ~= nil and spec.perOption then
			for i = 1, Shape.length(value) do
				local branch = value[i]
				local at = here .. "[" .. i .. "]"
				if Shape.isArray(branch) then
					out[#out + 1] = { path = at, list = branch }
				else
					out[#out + 1] = { path = at, notArray = true }
				end
			end
		elseif value ~= nil then
			out[#out + 1] = { path = here, list = value }
		end
	end
	return out
end

--- 알고 있는 커맨드 이름 목록 (문서와 테스트가 읽는다)
function M.codes()
	local list = {}
	for code in pairs(HANDLERS) do list[#list + 1] = code end
	table.sort(list)
	return list
end

-- 인자 명세 하나의 사본 (values 같은 배열도 새로)
local function copyArg(arg)
	local out = {}
	for k, v in pairs(arg) do
		if type(v) == "table" then
			local list = {}
			for i, x in ipairs(v) do list[i] = x end
			out[k] = list
		else
			out[k] = v
		end
	end
	return out
end

local function copyArgs(args)
	local out = {}
	for i, arg in ipairs(args) do out[i] = copyArg(arg) end
	return out
end

--- 검증이 아는 인자 타입 (이름 → true)
function M.argTypes()
	local out = {}
	for t in pairs(TYPE_NAMES) do out[t] = true end
	return out
end

--- 커맨드마다 인자 명세와 하위 목록 (event-commands.json 과 대조된다). 사본을 돌려준다.
-- @return { [code] = { args = { { name, type, required, min, max, values, ref }, ... },
--                      required = { 인자 = 타입 }, lists = { 이름... },
--                      perOption = { 목록 이름 = 인자 이름 } } }
function M.describe()
	local out = {}
	for code, args in pairs(ARGS) do
		local required = {}
		for _, arg in ipairs(args) do
			if arg.required then required[arg.name] = arg.type end
		end
		local lists, perOption = {}, {}
		for _, list in ipairs(LISTS[code] or {}) do
			lists[#lists + 1] = list.name
			if list.perOption ~= nil then perOption[list.name] = list.perOption end
		end
		out[code] = { args = copyArgs(args), required = required, lists = lists, perOption = perOption }
	end
	return out
end

--- 조건 꼴마다의 인자 명세 (event-commands.json 의 conditions 와 대조된다). 사본을 돌려준다.
-- @return { [kind] = { { name, type, required, min, max, values, ref }, ... } }
function M.describeConditions()
	local out = {}
	for kind, args in pairs(CONDITION_ARGS) do out[kind] = copyArgs(args) end
	return out
end

--- 커맨드 목록을 하위 목록까지 적힌 순서대로 훑는다.
-- @param visit  function(cmd, path). path 는 "[2].branches[1][3]" 꼴
function M.walk(list, visit, path)
	path = path or ""
	if not Shape.isArray(list) then return end
	for i = 1, Shape.length(list) do
		local cmd = list[i]
		local here = path .. "[" .. i .. "]"
		if type(cmd) == "table" then
			visit(cmd, here)
			for _, child in ipairs(childLists(cmd)) do
				if not child.notArray then
					M.walk(child.list, visit, here .. child.path)
				end
			end
		end
	end
end

-- ---- 실행 -----------------------------------------------------------------

local function runList(list, self, ctx, env)
	for _, cmd in ipairs(list) do
		local run = HANDLERS[cmd.code]
		-- compile 전에 validate를 거치는 것이 정상 경로지만, 손으로 만든 목록이
		-- 바로 들어올 수도 있어 여기서도 분명하게 죽는다.
		assert(run ~= nil, "commands: 스키마에 없는 커맨드: " .. tostring(cmd.code))
		run(cmd, self, ctx, env, runList)
	end
end

--- 커맨드 목록을 이벤트 스크립트 함수 하나로 바꾼다.
-- @param list      커맨드 배열
-- @param env.scripts  script 커맨드가 이름으로 부를 함수 표
-- @return function(self, ctx)
function M.compile(list, env)
	assert(type(list) == "table", "commands: 커맨드 목록 필요")
	return function(self, ctx)
		runList(list, self, ctx, env)
	end
end

-- ---- 검증 -----------------------------------------------------------------

local function isNumber(v)
	return type(v) == "number" and v == v and v ~= math.huge and v ~= -math.huge
end

local function isString(v) return type(v) == "string" end

-- 값 하나짜리 타입의 판정
local VALUE_TESTS = {
	string = isString, text = isString, enum = isString, ref = isString, file = isString,
	integer = Shape.isInteger,
	number = isNumber,
	boolean = function(v) return type(v) == "boolean" end,
	scalar = function(v)
		return type(v) == "boolean" or isNumber(v) or type(v) == "string"
	end,
	json = function() return true end,
}

local function contains(list, value)
	for _, v in ipairs(list) do
		if v == value then return true end
	end
	return false
end

local checkArg

-- 글 배열 (options, route). 항목 수를 돌려준다.
local function checkStrings(value, here, add, what)
	if not Shape.isArray(value) then
		add(here, what .. " 목록은 배열이어야 함")
		return nil
	end
	local count = Shape.length(value)
	for k = 1, count do
		if type(value[k]) ~= "string" then
			add(here .. "[" .. k .. "]", what .. ": 문자열이어야 함 (현재 타입: " .. type(value[k]) .. ")")
		end
	end
	return count
end

-- 여러 값으로 된 타입의 검사
local COMPOUND_CHECKS = {
	face = function(_, value, here, add)
		for _, p in ipairs(Assets.checkRef("face", value)) do
			add(here .. p.path, "얼굴: " .. p.message)
		end
	end,
	options = function(arg, value, here, add)
		local count = checkStrings(value, here, add, "항목")
		if count ~= nil and arg.min ~= nil and count < arg.min then
			add(here, "항목 " .. arg.min .. "개 이상 필요")
		end
	end,
	route = function(_, value, here, add)
		checkStrings(value, here, add, "루트 단계")
	end,
	-- 판정하는 꼴(CONDITIONS 순서의 첫 키)의 인자만 본다. 꼴이 없는 조건은 참이다.
	condition = function(_, value, here, add)
		if not Shape.isObject(value) then
			add(here, "조건은 객체여야 함 (현재 타입: " .. type(value) .. ")")
			return
		end
		for _, kind in ipairs(M.CONDITIONS) do
			if value[kind] ~= nil then
				for _, a in ipairs(CONDITION_ARGS[kind]) do
					checkArg(a, value[a.name], here .. "." .. a.name, add)
				end
				return
			end
		end
	end,
}

-- 인자 하나를 명세로 검사한다. here 는 그 인자의 경로다.
checkArg = function(arg, value, here, add)
	if value == nil then
		if arg.required then
			add(here, "값 없음 (" .. TYPE_NAMES[arg.type] .. " 필요)")
		end
		return
	end
	local compound = COMPOUND_CHECKS[arg.type]
	if compound ~= nil then
		compound(arg, value, here, add)
		return
	end
	if not VALUE_TESTS[arg.type](value) then
		local shown = type(value) == "number" and tostring(value) or type(value)
		add(here, "타입 불일치: " .. TYPE_NAMES[arg.type] .. " 필요 (현재: " .. shown .. ")")
	elseif arg.type == "file" and value == "" then
		add(here, "경로 비어 있음")
	elseif arg.type == "ref" and (arg.ref == "flag" or arg.ref == "var") and value == Inventory.KEY then
		add(here, value .. ": 예약된 상태 키(소지품)라 플래그나 변수 이름으로 사용 불가")
	elseif arg.values ~= nil and not contains(arg.values, value) then
		add(here, table.concat(arg.values, ", ") .. " 중 하나여야 함 (현재: " .. tostring(value) .. ")")
	elseif type(value) == "number" and arg.min ~= nil and value < arg.min then
		add(here, arg.min .. " 이상이어야 함 (현재: " .. tostring(value) .. ")")
	elseif type(value) == "number" and arg.max ~= nil and value > arg.max then
		add(here, arg.max .. " 이하여야 함 (현재: " .. tostring(value) .. ")")
	end
end

local function checkList(list, path, problems, env)
	local function add(where, message)
		problems[#problems + 1] = { path = where, message = message }
	end

	if not Shape.isArray(list) then
		add(path, "커맨드 목록은 배열이어야 함")
		return
	end

	for i = 1, Shape.length(list) do
		local cmd = list[i]
		local here = path .. "[" .. i .. "]"
		if not Shape.isObject(cmd) then
			add(here, "커맨드는 객체여야 함")
		elseif HANDLERS[cmd.code] == nil then
			add(here, "스키마에 없는 커맨드: " .. tostring(cmd.code))
		else
			for _, arg in ipairs(ARGS[cmd.code]) do
				checkArg(arg, cmd[arg.name], here .. "." .. arg.name, add)
			end
			if cmd.code == "script" and (cmd.name == nil or type(cmd.name) == "string") then
				local hasRun = type(cmd.run) == "function"
				local named = cmd.name ~= nil
					and env ~= nil and env.scripts ~= nil and env.scripts[cmd.name] ~= nil
				if not hasRun and not named then
					add(here .. ".name", "등록되지 않은 스크립트: " .. tostring(cmd.name))
				end
			end
			for _, child in ipairs(childLists(cmd)) do
				if child.notArray then
					add(here .. child.path, "분기 목록은 배열이어야 함")
				else
					checkList(child.list, here .. child.path, problems, env)
				end
			end
		end
	end
end

--- 커맨드 목록의 문제를 경로와 이유로 모은다.
-- @param prefix  경로 앞에 붙일 글 (맵 파일의 이벤트면 "events[3].commands")
-- @return { { path = "events[3].commands[2].text", message = 이유 }, ... }
function M.problems(list, env, prefix)
	local problems = {}
	checkList(list, prefix or "", problems, env)
	return problems
end

--- 커맨드 목록을 검사한다. 실행 도중이 아니라 맵을 열 때 틀린 곳을 알기 위한 것이다.
-- @return ok, errors  (errors는 "[2].branches[1][3]: 스키마에 없는 커맨드: ..." 꼴의 배열)
function M.validate(list, env)
	local errors = {}
	for _, p in ipairs(M.problems(list, env)) do
		errors[#errors + 1] = p.path .. ": " .. p.message
	end
	return #errors == 0, errors
end

return M
