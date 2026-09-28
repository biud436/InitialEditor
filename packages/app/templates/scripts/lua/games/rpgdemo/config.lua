-- config.lua : 데모의 게임 설정 파일 resources/data/rpg-game.json 을 읽는다
-- (docs/plans/m2-rpg-events.md)
--
-- 맵 등록(이름, 맵 파일, 정의 파일)과 아이템 표의 경로가 이 파일에 있다. 에디터도 같은
-- 파일을 읽는다. 경로는 프로젝트 기준이고 "./" 을 붙이지 않고 적는다.

local Shape = require("scripts/lua/rpg/jsonshape")

local M = {}

M.PATH = "./resources/data/rpg-game.json"

--- 프로젝트 기준 경로를 엔진이 여는 꼴("./resources/...")로 바꾼다.
function M.projectPath(path)
	if type(path) ~= "string" then return nil end
	if path:sub(1, 2) == "./" then return path end
	return "./" .. path
end

--- "./" 을 뗀 경로 (두 꼴을 비교할 때 쓴다)
function M.bare(path)
	if type(path) ~= "string" then return nil end
	if path:sub(1, 2) == "./" then return path:sub(3) end
	return path
end

local function nonEmptyString(v)
	return type(v) == "string" and v ~= ""
end

-- maps 의 항목 하나. 문제를 add(경로, 이유) 로 알린다.
local function checkMapEntry(entry, here, seen, add)
	if not Shape.isObject(entry) then
		add(here, "맵 항목은 객체여야 함")
		return
	end
	if not nonEmptyString(entry.name) then
		add(here .. ".name", "이름은 비어 있지 않은 문자열이어야 함")
	elseif seen[entry.name] ~= nil then
		add(here .. ".name", "이름 " .. entry.name .. " 중복 (maps[" .. seen[entry.name] .. "])")
	end
	for _, key in ipairs({ "file", "def" }) do
		if not nonEmptyString(entry[key]) then
			add(here .. "." .. key, "경로는 비어 있지 않은 문자열이어야 함")
		end
	end
	if entry.alt ~= nil then
		if not Shape.isArray(entry.alt) then
			add(here .. ".alt", "alt 는 배열이어야 함")
		else
			for k = 1, Shape.length(entry.alt) do
				if not nonEmptyString(entry.alt[k]) then
					add(here .. ".alt[" .. k .. "]", "경로는 비어 있지 않은 문자열이어야 함")
				end
			end
		end
	end
end

--- 설정 파일을 읽는다. 틀린 maps 항목과 items 경로는 빼고 problems 로 알린다.
-- @param loader  function(path) -> table, err (기본 전역 Json.Load)
-- @return 설정 표(파일 전체를 쓸 수 없으면 nil), problems
--         ({ { path = "" | "maps" | "maps[2].name" | "items", message = 이유 }, ... })
function M.load(loader)
	loader = loader or (_G.Json ~= nil and _G.Json.Load) or nil
	local function fail(path, message)
		return nil, { { path = path, message = message } }
	end
	if loader == nil then return fail("", "Json.Load 사용 불가") end
	local data, err = loader(M.PATH)
	if type(data) ~= "table" then return fail("", tostring(err or "읽기 실패")) end
	if not Shape.isObject(data) then return fail("", "설정은 객체여야 함") end
	if data.version ~= 1 then return fail("version", "지원하지 않는 버전: " .. tostring(data.version)) end
	if not Shape.isArray(data.maps) then return fail("maps", "맵 목록은 배열이어야 함") end

	local problems = {}
	local function add(path, message)
		problems[#problems + 1] = { path = path, message = message }
	end
	local maps, seen = {}, {}
	for i = 1, Shape.length(data.maps) do
		local entry = data.maps[i]
		local before = #problems
		checkMapEntry(entry, "maps[" .. i .. "]", seen, add)
		if #problems == before then
			maps[#maps + 1] = entry
			seen[entry.name] = i
		end
	end
	local config = {}
	for k, v in pairs(data) do config[k] = v end
	config.maps = maps
	if config.items == nil then
		add("items", "아이템 표 경로 없음")
	elseif not nonEmptyString(config.items) then
		add("items", "아이템 표 경로는 비어 있지 않은 문자열이어야 함")
		config.items = nil
	end
	return config, problems
end

--- 맵 이름 → 정의 모듈 경로 ("scripts/lua/maps/port_town") 표.
function M.mapModules(config)
	local out = {}
	for _, entry in ipairs(config and config.maps or {}) do
		out[entry.name] = (entry.def:gsub("%.lua$", ""))
	end
	return out
end

--- 맵 이름으로 등록 항목을 찾는다.
function M.mapEntry(config, name)
	for _, entry in ipairs(config and config.maps or {}) do
		if entry.name == name then return entry end
	end
	return nil
end

-- items 의 항목 하나. 문제를 add(경로, 이유) 로 알린다.
local function checkItem(item, here, seen, add)
	if not Shape.isObject(item) then
		add(here, "아이템은 객체여야 함")
		return
	end
	if not nonEmptyString(item.id) then
		add(here .. ".id", "id 는 비어 있지 않은 문자열이어야 함")
	elseif seen[item.id] ~= nil then
		add(here .. ".id", "id " .. item.id .. " 중복 (items[" .. seen[item.id] .. "])")
	end
	for _, key in ipairs({ "name", "desc" }) do
		if item[key] ~= nil and type(item[key]) ~= "string" then
			add(here .. "." .. key, "문자열이어야 함 (현재 타입: " .. type(item[key]) .. ")")
		end
	end
	if item.order ~= nil and not Shape.isInteger(item.order) then
		add(here .. ".order", "정수여야 함 (현재: " .. tostring(item.order) .. ")")
	end
end

--- 아이템 표를 읽어 id → { name, desc, order } 표로 만든다. 틀린 항목은 빼고 알린다.
-- @return 표, problems ({ { path = "" | "items" | "items[2].id", message = 이유 }, ... }),
--         읽으려던 경로 (config.items 가 없으면 빈 표와 빈 problems 와 nil)
function M.loadItems(config, loader)
	loader = loader or (_G.Json ~= nil and _G.Json.Load) or nil
	local path = config and config.items or nil
	if not nonEmptyString(path) then return {}, {}, nil end
	if loader == nil then return {}, { { path = "", message = "Json.Load 사용 불가" } }, path end
	local data, err = loader(M.projectPath(path))
	if type(data) ~= "table" then
		return {}, { { path = "", message = tostring(err or "읽기 실패") } }, path
	end
	if not Shape.isObject(data) then
		return {}, { { path = "", message = "아이템 표는 객체여야 함" } }, path
	end
	if not Shape.isArray(data.items) then
		return {}, { { path = "items", message = "아이템 목록은 배열이어야 함" } }, path
	end

	local problems = {}
	local function add(where, message)
		problems[#problems + 1] = { path = where, message = message }
	end
	local out, seen = {}, {}
	for i = 1, Shape.length(data.items) do
		local item = data.items[i]
		local before = #problems
		checkItem(item, "items[" .. i .. "]", seen, add)
		if #problems == before then
			seen[item.id] = i
			out[item.id] = { name = item.name, desc = item.desc, order = item.order }
		end
	end
	return out, problems, path
end

--- rpg:error 의 자리 글. 경로가 있으면 "파일:경로", 없으면 파일.
function M.where(file, path)
	if path == nil or path == "" then return tostring(file) end
	return tostring(file) .. ":" .. path
end

return M
