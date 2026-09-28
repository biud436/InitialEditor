-- scripts/lua/main.lua 템플릿: RPG 데모 「떠나기 전에」 (에디터가 새 프로젝트에 복사한다)
--
-- 타이틀(title)과 맵 씬(rpg) 두 씬을 등록하고 타이틀부터 연다. 맵 등록과 아이템 표는
-- resources/data/rpg-game.json, 맵 속성은 scripts/lua/maps/<이름>.lua 에 있다.
--
--   INITIAL2D_SCENE=rpg INITIAL2D_MAP=<맵 이름> ./Initial2D    맵 씬부터 연다 (에디터의 "이 맵에서 실행")
--   씬 안에서 SwitchScene("이름") 을 부르면 다음 Update 의 처음에 바뀐다
--   INITIAL2D_AUTOPLAY 가 있으면 타이틀이 "시작"을 고르고 맵 씬이 정해진 길을 걷는다

local Bgm = require("scripts/lua/bgm")

require("scripts/lua/games/rpgdemo/title")
require("scripts/lua/games/rpgdemo/game")

local scenes = {
	title = RpgDemoTitleScene,
	rpg = RpgDemoScene,
}

local current = nil
local pending = nil

-- 전역: 씬이 부르는 전환 요청. 등록되지 않은 이름은 무시한다
function SwitchScene(name)
	if scenes[name] ~= nil then
		pending = name
	end
end

function Initialize()
	AUTOPLAY = (os.getenv ~= nil) and (os.getenv("INITIAL2D_AUTOPLAY") ~= nil)
	math.randomseed(os.time())

	-- 두 씬이 함께 쓰는 32px 글꼴. 맵 씬은 들어갈 때 16px 글꼴로 바꾸고 나갈 때 되돌린다
	FontReady = PreparaFont("./resources/fonts/hangul.fnt")

	local wanted = (os.getenv ~= nil) and os.getenv("INITIAL2D_SCENE") or nil
	current = (wanted ~= nil and scenes[wanted]) or scenes.title
	current.init()
end

function Update(elapsed)
	if pending ~= nil then
		current.destroy()
		current = scenes[pending]
		pending = nil
		current.init()
	end

	current.update(elapsed)
end

function Render()
	current.render()
end

function Destroy()
	current.destroy()
	Bgm.stop()
end
