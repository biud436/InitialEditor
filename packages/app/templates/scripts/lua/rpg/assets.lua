-- assets.lua : 리소스 고르기 (8단계, docs/plans/08-demo.md)
--
-- 같은 그림이 두 벌 있다. RPG Maker 2003 RTP를 변환해 둔 로컬 자산과, 저장소에
-- 커밋된 플레이스홀더다. RTP 소재는 재배포할 수 없어 저장소에 없으므로 어느
-- 게임이든 "있으면 RTP, 없으면 플레이스홀더"를 골라야 하고, 그 규칙이 씬과 맵
-- 정의마다 복사되어 있었다. 여기 한 곳에 모은다.
--
-- 규격(어느 파일이 어떤 배치인가)은 specs.lua가, 어느 파일을 쓸 것인가는 여기가
-- 정한다.
--
--   local Assets = require("scripts/lua/rpg/assets")
--   local charset = Assets.charset()                 -- CharSet 한 장의 경로
--   local map = Assets.mapPath("village", "Exterior") -- 칩셋에 맞는 맵 파일

local Specs = require("scripts/lua/rpg/specs")
local Shape = require("scripts/lua/rpg/jsonshape")

local M = {}

-- INITIAL2D_NO_RTP 가 있으면 RTP 후보를 아예 보지 않는다. 검수는 어느 기계에서나
-- 같은 그림으로 돌아야 하고(골든 스크린샷), RTP 소재는 재배포할 수 없어 저장소에
-- 없기 때문이다. 개발 중 "RTP 없는 사람에게는 어떻게 보이는가"를 볼 때도 쓴다.
local function rtpAllowed()
	if os == nil or os.getenv == nil then return true end
	return os.getenv("INITIAL2D_NO_RTP") == nil
end

--- 지금 RTP 자산을 쓸 수 있는가 (환경 변수로 끌 수 있다)
function M.rtpEnabled()
	return rtpAllowed()
end

--- 파일이 실제로 있는가 (엔진 없이도 도는 순수 Lua)
function M.exists(path)
	if type(path) ~= "string" then return false end
	local f = io.open(path, "rb")
	if f == nil then return false end
	f:close()
	return true
end

--- 후보를 앞에서부터 보고 처음 있는 것을 고른다. 전부 없으면 마지막 후보.
-- 마지막(플레이스홀더)은 저장소에 있으므로 대개 없을 수가 없지만, 없더라도
-- nil 대신 경로를 돌려주어 오류가 "그림이 안 뜬다"가 아니라 "이 파일이 없다"로
-- 드러나게 한다.
function M.pick(candidates)
	assert(type(candidates) == "table" and #candidates > 0, "assets: 후보 1개 이상 필요")
	local allowRtp = rtpAllowed()
	for _, path in ipairs(candidates) do
		local isRtp = path:find("/rtp/", 1, true) ~= nil
		if (allowRtp or not isRtp) and M.exists(path) then return path end
	end
	return candidates[#candidates]
end

-- 후보 목록. 앞이 RTP(로컬), 뒤가 플레이스홀더(커밋됨).
M.PLAYER_CHARSET = { "./resources/rtp/CharSet/Actor1.png", "./resources/charsets/placeholder.png" }
M.NPC_CHARSET = { "./resources/rtp/CharSet/People1.png", "./resources/charsets/placeholder.png" }
M.FACESET = { "./resources/rtp/FaceSet/People1.png", "./resources/faces/placeholder.png" }
M.WINDOWSKIN = { "./resources/rtp/System/System.png", "./resources/ui/window.png" }

function M.playerCharset() return M.pick(M.PLAYER_CHARSET) end
function M.npcCharset() return M.pick(M.NPC_CHARSET) end
function M.faceset() return M.pick(M.FACESET) end
function M.windowskin() return M.pick(M.WINDOWSKIN) end

-- 맵 파일의 이벤트가 외형과 얼굴에 적는 논리 이름. { "set": "npc", "index": 6 } 꼴이며
-- resources/schema/event-commands.json 의 assets 와 같은 목록이다 (테스트가 대조한다).
M.SETS = {
	charset = { player = M.PLAYER_CHARSET, npc = M.NPC_CHARSET },
	face = { npc = M.FACESET },
}

--- 외형이나 얼굴 참조를 파일 경로로 푼다.
-- @param kind  "charset" | "face"
-- @param ref   { set = 이름, index = n } 또는 { file = 경로, index = n }
-- @return 경로, 또는 nil 과 이유
function M.resolveRef(kind, ref)
	if type(ref) ~= "table" then
		return nil, "assets: 참조는 객체여야 함"
	end
	if ref.file ~= nil then
		return ref.file
	end
	local sets = M.SETS[kind]
	if sets == nil then
		return nil, "assets: 지원하지 않는 종류: " .. tostring(kind)
	end
	local candidates = sets[ref.set]
	if candidates == nil then
		return nil, "assets: 스키마에 없는 " .. tostring(kind) .. " 이름: " .. tostring(ref.set)
	end
	return M.pick(candidates)
end

-- 참조 종류마다 한 시트에 든 칸 수 (번호는 0부터 이 수 미만)
local SHEET_COUNT = {
	charset = Specs.charset.perSheet,
	face = Specs.faceset.perSheet,
}

local isInteger = Shape.isInteger

--- 외형이나 얼굴 참조의 모양을 검사한다. 파일로 풀기 전의 값을 본다.
-- @return 문제 배열. 항목은 { path = "" | ".set" | ".file" | ".index", message = 이유 }
function M.checkRef(kind, ref)
	local problems = {}
	local function add(path, message)
		problems[#problems + 1] = { path = path, message = message }
	end

	if not Shape.isObject(ref) then
		add("", "객체여야 함")
		return problems
	end
	local hasSet, hasFile = ref.set ~= nil, ref.file ~= nil
	if hasSet and hasFile then
		add("", "set 과 file 중 하나만 허용")
	elseif not hasSet and not hasFile then
		add("", "set 또는 file 필요")
	end
	local sets = M.SETS[kind] or {}
	if hasSet and (type(ref.set) ~= "string" or sets[ref.set] == nil) then
		add(".set", "스키마에 없는 " .. tostring(kind) .. " 이름: " .. tostring(ref.set))
	end
	if hasFile and (type(ref.file) ~= "string" or ref.file == "") then
		add(".file", "경로는 비어 있지 않은 문자열이어야 함")
	end
	local count = SHEET_COUNT[kind]
	if ref.index ~= nil and count ~= nil
		and not (isInteger(ref.index) and ref.index >= 0 and ref.index < count) then
		add(".index", "0.." .. (count - 1) .. " 범위의 정수여야 함 (현재: "
			.. tostring(ref.index) .. ")")
	end
	return problems
end

--- 맵 파일. 같은 지오메트리를 타일 번호만 바꿔 두 벌 만들어 두었으므로
-- (tools/generate_demo_maps.py) 칩셋이 있으면 RTP 판을, 없으면 기본 판을 연다.
-- @param base   맵 이름 (village, room)
-- @param chipset RTP 칩셋 이름 (Exterior, Interior)
function M.mapPath(base, chipset)
	if chipset ~= nil and rtpAllowed()
		and M.exists("./resources/rtp/ChipSet/" .. chipset .. ".png") then
		return "./resources/maps/" .. base .. "_rtp.json"
	end
	return "./resources/maps/" .. base .. ".json"
end

return M
