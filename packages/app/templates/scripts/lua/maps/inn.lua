-- 항구 여관 1층의 맵 정의 (기획서 docs/design/port-town.md)
--
-- 이벤트는 맵 파일 resources/maps/inn.json 의 events 에 있고 에디터가 편집한다.
-- 여기에는 이벤트가 아닌 맵 속성만 둔다.
--
-- 실내의 곡은 저자의 《Port》 1번 트랙 "Inn"이다 (docs/music/inn-analysis.md).
-- 원본은 개인 소장이라 저장소에 없으므로, 파일이 있으면 그 곡을 걸고 없으면
-- 마을 곡을 조금 낮춰 쓴다 (그림을 고르는 규칙 assets.lua 와 같은 방식).

local Assets = require("scripts/lua/rpg/assets")

local INN_BGM = Assets.pick({
	"./resources/audio/inn.ogg",
	"./resources/audio/bless.ogg",
})

return {
	map = "./resources/maps/inn.json",
	start = { x = 10, y = 12, dir = "up" },

	-- 실내는 머리 위로 지나갈 것이 없다. 벽과 탁자는 전부 캐릭터보다 아래다.
	groundLayers = 2,

	bgm = { file = INN_BGM, volume = 80 },   -- 실내는 낮게
}
