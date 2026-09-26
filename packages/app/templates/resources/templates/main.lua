-- scripts/lua/main.lua 템플릿 (에디터가 새 프로젝트에 복사한다). R1, docs/plans/r1-scene-loader.md
--
-- 씬 파일(resources/scenes/<이름>.json)을 씬 로더가 읽어 오브젝트를 만들고, 오브젝트에 붙은
-- 컴포넌트(scripts/lua/components/...)가 움직인다. 이 파일은 그 둘을 잇는 것이 전부다.
--
--   INITIAL2D_SCENE=<이름> ./Initial2D     이 씬부터 연다 (에디터의 "현재 씬부터 실행")
--   없으면 game.json 의 "startScene", 그것도 없으면 "main"

local SceneLoader = require("scripts/lua/scene_loader")

local scene

function Initialize()
	local game = Json.Load("./game.json") or {}
	local wanted = (os.getenv ~= nil) and os.getenv("INITIAL2D_SCENE") or nil
	scene = SceneLoader.open(wanted or game.startScene or "main")
end

function Update(elapsed)
	scene = scene:tick(elapsed)   -- scene:switch() 가 예약돼 있으면 새 씬이 돌아온다
end

function Render()
	scene:draw()
end

function Destroy()
	scene:close()
end
