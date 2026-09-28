-- 항구 마을의 맵 정의 (기획서 docs/design/port-town.md)
--
-- 이벤트는 맵 파일 resources/maps/port_town.json 의 events 에 있고 에디터가 편집한다.
-- 여기에는 이벤트가 아닌 맵 속성만 둔다.

return {
	map = "./resources/maps/port_town.json",
	start = { x = 16, y = 43, dir = "up" },   -- 배에서 막 내린 자리

	-- ground와 deco는 캐릭터보다 아래, over(빨래줄)만 위에 그린다.
	-- 집 벽과 울타리는 앞에 서는 것이라 아래여야 한다. 위에 두면 벽 앞에
	-- 섰을 때 캐릭터의 머리가 벽에 가려진다.
	groundLayers = 2,

	-- 마을의 곡. 저자의 자작곡이다 (docs/music/bless-analysis.md).
	bgm = { file = "./resources/audio/bless.ogg", volume = 96 },

	-- 자동 시연(INITIAL2D_AUTOPLAY)에서 따라 걷는 길. "talk"은 결정키.
	-- 부두에서 광장까지 올라가 생선 장수에게 말을 건다.
	autoRoute = {
		"talk", "up", "up", "up", "up", "up", "up", "up", "up",
		"left", "left", "talk", "talk", "talk",
		"up", "up", "up", "up", "up", "up",
	},
}
