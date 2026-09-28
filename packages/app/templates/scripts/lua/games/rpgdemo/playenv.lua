-- playenv.lua : 데모 맵 씬의 실행 환경 변수 해석 (docs/plans/m2-rpg-events.md 5.2절)
--
-- 에디터의 "여기서 실행"과 자동 재생, 엔진 테스트가 넘기는 값이다. 엔진에 닿지 않는
-- 순수 함수라 단위 테스트가 그대로 부른다.
--
--   INITIAL2D_RPG_AT     x,y[,dir]                    첫 맵의 시작 칸과 방향
--   INITIAL2D_RPG_STATE  arrived,booked=false,item:shell=1   새 게임의 시작 상태
--   INITIAL2D_RPG_ROUTE  talk,up,up,...               한 번만 걷는 자동 재생 경로
--   INITIAL2D_RPG_HOLD   kid                          첫 맵에서 배회하지 않고 제자리에 서 있는 이벤트

local Character = require("scripts/lua/rpg/character")
local Inventory = require("scripts/lua/rpg/inventory")

local M = {}

M.ITEM_PREFIX = "item:"

local function trim(s)
	return (s:gsub("^%s+", ""):gsub("%s+$", ""))
end

-- 쉼표로 가르고 앞뒤 공백을 뗀다. 빈 항목은 버린다.
local function split(text)
	local out = {}
	for part in (text .. ","):gmatch("([^,]*),") do
		part = trim(part)
		if part ~= "" then out[#out + 1] = part end
	end
	return out
end

local function isDir(v)
	return type(v) == "string" and Character.DIR_VECTORS[v] ~= nil
end

--- "x,y" 또는 "x,y,dir".
-- @return { x, y, dir } (dir 은 없을 수 있다), 또는 nil 과 이유
function M.parseAt(text)
	if type(text) ~= "string" then return nil, "값 없음" end
	local parts = {}
	for part in (text .. ","):gmatch("([^,]*),") do parts[#parts + 1] = trim(part) end
	if #parts < 2 or #parts > 3 then
		return nil, "x,y 또는 x,y,dir 형식이어야 함"
	end
	if not parts[1]:match("^%d+$") or not parts[2]:match("^%d+$") then
		return nil, "x, y 는 0 이상의 정수여야 함"
	end
	local at = { x = tonumber(parts[1]), y = tonumber(parts[2]) }
	if parts[3] ~= nil and parts[3] ~= "" then
		if not isDir(parts[3]) then return nil, "지원하지 않는 방향: " .. parts[3] end
		at.dir = parts[3]
	end
	return at
end

-- "true", "false", 수, 그 밖은 글
local function scalar(text)
	if text == "true" then return true end
	if text == "false" then return false end
	if text:match("^[+-]?%d+%.?%d*$") or text:match("^[+-]?%.%d+$") then
		return tonumber(text)
	end
	return text
end

--- 시작 상태. 항목마다 "이름"(참), "이름=값", "item:<id>=<n>", "item:<id>"(하나).
-- @param items  아이템 표 (id → 항목). 있으면 표에 없는 id 를 틀린 항목으로 본다
-- @return 상태 표, 틀린 항목 배열 { { entry = 항목 글, message = 이유 }, ... }
function M.parseState(text, items)
	local state, errors = {}, {}
	local function bad(entry, message)
		errors[#errors + 1] = { entry = entry, message = message }
	end
	if type(text) ~= "string" then return state, errors end

	for _, entry in ipairs(split(text)) do
		local key, value = entry:match("^([^=]*)=(.*)$")
		if key == nil then key = entry end
		key = trim(key)
		if value ~= nil then value = trim(value) end

		if key:sub(1, #M.ITEM_PREFIX) == M.ITEM_PREFIX then
			local id = key:sub(#M.ITEM_PREFIX + 1)
			local count = value == nil and 1 or (value:match("^%d+$") and tonumber(value))
			if id == "" then
				bad(entry, "아이템 id 비어 있음")
			elseif not count then
				bad(entry, "개수는 0 이상의 정수여야 함")
			elseif items ~= nil and items[id] == nil then
				bad(entry, "아이템 표에 없는 id: " .. id)
			else
				Inventory.give(state, id, count)
			end
		elseif key == "" then
			bad(entry, "이름 비어 있음")
		elseif key:find(":", 1, true) ~= nil then
			bad(entry, "지원하지 않는 접두사 (아이템은 item:<id>)")
		elseif key == Inventory.KEY then
			bad(entry, key .. ": 예약된 상태 키(소지품)라 사용 불가")
		elseif value == nil then
			state[key] = true
		elseif value == "" then
			bad(entry, "값 비어 있음")
		else
			state[key] = scalar(value)
		end
	end
	return state, errors
end

M.ROUTE_STEPS = { talk = true, up = true, down = true, left = true, right = true }

--- 자동 재생 경로. "talk" 은 결정키, 나머지는 방향이다. 빈 글이면 걸음이 없다.
-- @return 걸음 배열, 틀린 걸음 배열 { { entry, message }, ... }
function M.parseRoute(text)
	local steps, errors = {}, {}
	if type(text) ~= "string" then return steps, errors end
	for _, step in ipairs(split(text)) do
		if M.ROUTE_STEPS[step] then
			steps[#steps + 1] = step
		else
			errors[#errors + 1] = { entry = step, message = "지원하지 않는 경로 단계 (허용: talk, up, down, left, right)" }
		end
	end
	return steps, errors
end

--- 제자리에 세울 이벤트 id. 이벤트 id와 그대로 견주므로 앞뒤 공백도 떼지 않는다.
-- @return id, 또는 nil (값이 없거나 빈 글)
function M.parseHold(text)
	if type(text) ~= "string" or text == "" then return nil end
	return text
end

--- trace 줄에 실을 글. 줄바꿈은 \n 두 글자로 쓴다.
function M.escape(text)
	return (tostring(text or ""):gsub("\r", ""):gsub("\n", "\\n"))
end

-- 줄을 끊는 글자: CR, LF (CRLF 는 둘이 이어진 것), VT, FF, FS, GS, RS, NEL, U+2028, U+2029
-- (유니코드가 줄 끊김으로 치는 글자 전부. 파이썬 splitlines 도 이것들에서 끊는다)
local LINE_SEPARATOR = "\226\128\168"
local PARAGRAPH_SEPARATOR = "\226\128\169"
local NEXT_LINE = "\194\133"

--- 글을 한 줄로 만든다. 줄 끊김(위의 글자들)은 앞뒤 공백과 함께
-- 공백 하나가 되고, 이어진 끊김도 공백 하나다. 앞뒤 끝의 공백은 뗀다.
function M.oneLine(text)
	local s = tostring(text):gsub("\r\n?", "\n"):gsub("[\v\f\28\29\30]", "\n")
		:gsub(LINE_SEPARATOR, "\n"):gsub(PARAGRAPH_SEPARATOR, "\n"):gsub(NEXT_LINE, "\n")
	s = s:gsub("%s*\n%s*", " "):gsub("^%s+", ""):gsub("%s+$", "")
	return s
end

--- rpg:error 줄 하나. 자리와 이유를 합친 줄 전체를 oneLine 으로 한 줄로 만든다.
function M.errorLine(where, message)
	return M.oneLine("rpg:error:" .. tostring(where) .. ": " .. tostring(message))
end

--- 켜짐 값인가 (없음, 빈 글, "0" 은 꺼짐)
function M.enabled(value)
	return value ~= nil and value ~= "" and value ~= "0"
end

return M
