-- jsonshape.lua : Json.Load 가 만든 Lua 표의 JSON 모양 판정 (docs/plans/m2-rpg-events.md 3.1절)
--
-- Json.Load 는 배열을 1부터 세는 정수 키 표로, 객체를 글 키 표로 만들고 null 은 nil 로 둔다.
-- 그래서 배열 가운데의 null 은 구멍이 되고, 빈 배열 [] 과 빈 객체 {} 는 같은 빈 표다.
--
--   배열 자리   정수 키만 있는 표. 빈 표({} 포함)는 빈 배열이다
--   객체 자리   글 키만 있는 표. 빈 표([] 포함)는 빈 객체다
--   칸 수       가장 큰 정수 키. 가운데의 null 도 한 칸이고, 끝의 null 은 보이지 않는다

local M = {}

--- 배열의 칸 수 (가장 큰 정수 키). 표가 아니면 0.
function M.length(t)
	if type(t) ~= "table" then return 0 end
	local n = 0
	for k in pairs(t) do
		if math.type(k) == "integer" and k > n then n = k end
	end
	return n
end

--- 배열인가: 표이고 키가 전부 1 이상의 정수다.
function M.isArray(v)
	if type(v) ~= "table" then return false end
	for k in pairs(v) do
		if math.type(k) ~= "integer" or k < 1 then return false end
	end
	return true
end

--- 정수인가: 값이 정수인 수 (2.0 도 정수다). NaN 과 무한대는 아니다.
function M.isInteger(v)
	return type(v) == "number" and v == v and v ~= math.huge and v ~= -math.huge
		and v == math.floor(v)
end

--- 객체인가: 표이고 키가 전부 글이다.
function M.isObject(v)
	if type(v) ~= "table" then return false end
	for k in pairs(v) do
		if type(k) ~= "string" then return false end
	end
	return true
end

return M
