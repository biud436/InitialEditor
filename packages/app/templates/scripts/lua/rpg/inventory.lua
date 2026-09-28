-- inventory.lua : 소지품 (10단계, docs/plans/11-game-systems.md)
--
-- 소지품은 상태 테이블 안의 표 하나다.
--
--   state.items = { silver = 2, warehouse_key = 1 }
--
-- 이 파일은 그 표를 다루는 순수 함수 묶음이며 엔진에 닿지 않는다. 맵을 넘는
-- 상태 공유는 6단계의 ctx.state가 이미 하고 있으므로, 소지품은 그 안에 얹혀
-- 따로 살 곳이 필요 없다 — 나중에 저장과 로드가 생기면 state를 통째로
-- 직렬화하는 것으로 소지품도 함께 저장된다.
--
-- 아이템 표(이름과 설명)는 게임 콘텐츠라 여기 있지 않다. list가 주입받는다.

local M = {}

M.KEY = "items"      -- state 안에서 소지품이 사는 자리

--- 소지품 표를 꺼낸다. 없으면 만들어 넣는다.
local function bag(state)
	local items = state[M.KEY]
	if items == nil then
		items = {}
		state[M.KEY] = items
	end
	return items
end

--- 몇 개 가졌는가 (없으면 0)
function M.count(state, id)
	if state == nil or id == nil then return 0 end
	local items = state[M.KEY]
	if items == nil then return 0 end
	return tonumber(items[id]) or 0
end

--- n개 이상 가졌는가 (기본 1)
function M.has(state, id, n)
	return M.count(state, id) >= (tonumber(n) or 1)
end

--- 더한다. 반환은 더한 뒤의 개수.
function M.give(state, id, n)
	assert(type(state) == "table", "inventory.give: state가 필요하다")
	assert(id ~= nil, "inventory.give: 아이템 id가 필요하다")
	local amount = tonumber(n) or 1
	if amount <= 0 then return M.count(state, id) end

	local items = bag(state)
	items[id] = (tonumber(items[id]) or 0) + amount
	return items[id]
end

--- 뺀다. 모자라면 아무것도 하지 않고 false를 낸다.
-- "반쯤 빼고 실패"가 없어야 이벤트를 되돌릴 필요가 없다.
function M.take(state, id, n)
	assert(type(state) == "table", "inventory.take: state가 필요하다")
	local amount = tonumber(n) or 1
	if amount <= 0 then return true end
	if not M.has(state, id, amount) then return false end

	local items = bag(state)
	local left = items[id] - amount
	items[id] = (left > 0) and left or nil    -- 0개는 지운다 (목록에 빈 줄이 남지 않게)
	return true
end

--- 창이 그릴 목록. db는 { [id] = { name, desc, order } } 표다.
--
-- db에 없는 id도 빠뜨리지 않고 내보낸다 (이름 자리에 id를 그대로 쓴다). 표를
-- 고치다가 물건이 조용히 사라지는 것보다 눈에 보이는 편이 낫다.
-- 정렬은 order → id 순이라 목록의 순서가 실행마다 흔들리지 않는다.
function M.list(state, db)
	db = db or {}
	local out = {}
	local items = (state ~= nil) and state[M.KEY] or nil
	if items == nil then return out end

	for id, count in pairs(items) do
		count = tonumber(count) or 0
		if count > 0 then
			local entry = db[id] or {}
			out[#out + 1] = {
				id = id,
				name = entry.name or tostring(id),
				desc = entry.desc,
				count = count,
				order = tonumber(entry.order) or 1000,
			}
		end
	end

	table.sort(out, function(a, b)
		if a.order ~= b.order then return a.order < b.order end
		return tostring(a.id) < tostring(b.id)
	end)
	return out
end

return M
