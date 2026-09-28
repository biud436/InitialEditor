-- bgm.lua : 배경음 한 곡만 걸어 두는 얇은 층 (8단계, docs/plans/08-demo.md)
--
-- Audio.PlayMusic은 부를 때마다 곡을 처음부터 다시 시작한다. 씬이나 맵이 바뀔
-- 때마다 "이 맵의 곡을 틀어라"를 그대로 부르면 같은 곡이 계속 끊긴다. 여기서
-- 지금 걸린 곡을 기억해 두고, 같은 곡이면 아무것도 하지 않는다.
--
-- 장르 중립이라 scripts/lua/rpg가 아니라 여기(공용)에 둔다 — 플래피버드에도 말이 된다.
--
--   local Bgm = require("scripts/lua/bgm")
--   Bgm.play("./resources/audio/bless.ogg")        -- 이미 그 곡이면 무시
--   Bgm.play("./resources/audio/town.ogg", { volume = 80 })
--   Bgm.stop()
--
-- 곡마다 음압이 다르므로(docs/music/ 의 LUFS 비교표) 볼륨을 곡과 함께 준다.

local M = {}

M.DEFAULT_ID = "bgm"
M.DEFAULT_VOLUME = 96

local audio = nil       -- 주입된 Audio (없으면 호출 시점의 전역 Audio)
local playing = nil     -- 지금 걸려 있는 파일 경로
local playingId = nil

--- 테스트가 가짜 Audio를 주입한다. nil을 주면 전역 Audio로 되돌아간다.
function M.bind(mock)
	audio = mock
end

local function backend()
	return audio or _G.Audio
end

--- 지금 걸려 있는 곡의 경로 (없으면 nil)
function M.current()
	return playing
end

--- 곡을 건다. 이미 같은 곡이 걸려 있으면 아무것도 하지 않는다.
-- @param path      OGG/WAV 경로. nil이면 아무것도 하지 않는다 (곡 없는 맵)
-- @param opts.id       Audio 쪽 식별자 (기본 "bgm")
-- @param opts.loop     기본 true
-- @param opts.volume   0~128, 기본 96
-- @param opts.force    같은 곡이어도 처음부터 다시 시작
-- @return 실제로 곡을 걸었으면 true
function M.play(path, opts)
	if path == nil then return false end
	opts = opts or {}
	local a = backend()
	if a == nil or type(a.PlayMusic) ~= "function" then return false end

	if playing == path and not opts.force then
		if opts.volume ~= nil and a.SetVolume ~= nil then a.SetVolume(opts.volume) end
		return false
	end

	local id = opts.id or M.DEFAULT_ID
	-- 곡을 바꿀 때는 앞 곡을 놓아 준다 (엔진은 메모리를 수동 해제한다)
	if playingId ~= nil and playingId ~= id and a.ReleaseMusic ~= nil then
		a.ReleaseMusic(playingId)
	end

	local loop = opts.loop
	if loop == nil then loop = true end
	a.PlayMusic(path, id, loop)
	if a.SetVolume ~= nil then
		a.SetVolume(opts.volume or M.DEFAULT_VOLUME)
	end

	playing, playingId = path, id
	return true
end

--- 곡을 멈추고 놓아 준다.
function M.stop()
	local a = backend()
	if a == nil then
		playing, playingId = nil, nil
		return
	end
	if a.StopMusic ~= nil then a.StopMusic() end
	if playingId ~= nil and a.ReleaseMusic ~= nil then a.ReleaseMusic(playingId) end
	playing, playingId = nil, nil
end

--- 재생은 건드리지 않고 기억만 지운다 (테스트와 씬 재시작용)
function M.forget()
	playing, playingId = nil, nil
end

return M
