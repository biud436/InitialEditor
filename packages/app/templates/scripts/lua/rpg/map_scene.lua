-- map_scene.lua : 타일맵 + 캐릭터들 + 카메라를 묶는 씬 (5단계, docs/plans/05-rpg-character.md)
--
-- RPG 프레임워크에서 엔진(Tilemap, Sprite)에 실제로 닿는 유일한 층이다.
-- character/player/camera는 순수 Lua로 두고, 여기서만 전역을 부른다. 그래서
-- 이 모듈도 tilemap과 imageFactory를 주입받을 수 있게 열어 둔다.
--
-- 그리는 순서 (2단계의 레이어 분할 그리기가 이걸 위해 있다):
--   하층 타일 → 캐릭터들(발 y좌표 오름차순) → 상층 타일
-- 캐릭터 프레임(24x32)은 타일(16x16)보다 커서 머리가 윗 칸으로 올라가므로,
-- 울타리나 지붕 같은 상층 타일 뒤로 자연스럽게 지나간다.
--
-- 사용:
--   local MapScene = require("scripts/lua/rpg/map_scene")
--   local scene, err = MapScene.new{ mapPath = "./resources/maps/sample.json" }
--   local player = scene:addCharacter{ tx = 40, ty = 35, charset = "...png" }
--   scene:setCameraTarget(player)
--   scene:update(dt) ; scene:draw() ; scene:dispose()

local Character = require("scripts/lua/rpg/character")
local Camera = require("scripts/lua/rpg/camera")
local Specs = require("scripts/lua/rpg/specs")
local Image = require("scripts/lua/image")

local M = {}

local MapScene = {}
MapScene.__index = MapScene
M.MapScene = MapScene

-- @param opts.mapPath       맵 파일 경로 (필수)
-- @param opts.tilemap       Tilemap 모듈 (기본 _G.Tilemap)
-- @param opts.imageFactory  Image 생성자 (기본 scripts/lua/image)
-- @param opts.viewW, viewH  화면 크기 (기본 WindowWidth/Height)
-- @param opts.groundLayers  캐릭터보다 아래에 그릴 레이어 수 (기본 1)
-- @return scene 또는 nil, 오류 메시지
function M.new(opts)
	opts = opts or {}
	assert(opts.mapPath ~= nil, "map_scene: mapPath가 필요하다")

	local tilemap = opts.tilemap or _G.Tilemap
	assert(tilemap ~= nil, "map_scene: Tilemap 모듈이 없다")

	local map, err = tilemap.Load(opts.mapPath)
	if map == nil then
		return nil, err
	end

	local self = setmetatable({}, MapScene)
	self.tilemap = tilemap
	self.imageFactory = opts.imageFactory or Image
	self.map = map
	self.mapPath = opts.mapPath

	self.width, self.height, self.tileW, self.tileH, self.layerCount = tilemap.GetSize(map)
	self.groundLayers = math.min(opts.groundLayers or 1, self.layerCount)

	self.viewW = opts.viewW or (WindowWidth ~= nil and WindowWidth()) or 0
	self.viewH = opts.viewH or (WindowHeight ~= nil and WindowHeight()) or 0

	self.camera = Camera.new{
		viewW = self.viewW, viewH = self.viewH,
		worldW = self.width * self.tileW, worldH = self.height * self.tileH,
	}
	self.cameraTarget = nil

	self.characters = {}   -- 등록 순서
	self.order = {}        -- 그리기 순서 (매 프레임 정렬)
	self.sprites = {}      -- character → Image
	self.textures = {}     -- 텍스처 id → Image (해제는 id마다 한 번)

	return self
end

--- 통행 판정: 맵의 충돌 레이어 + 다른 캐릭터의 점유 + 막는 이벤트.
function MapScene:isPassable(tx, ty, except)
	if not self.tilemap.IsPassable(self.map, tx, ty) then
		return false
	end
	if self:characterAt(tx, ty, except) ~= nil then
		return false
	end
	-- 이벤트는 자기 캐릭터로 이미 칸을 차지하지만, 외형 없는 이벤트가 나중에
	-- 통행을 막고 싶어질 수 있어 관리자에게도 물어본다 (6단계).
	if self.events ~= nil and self.events:blocksTile(tx, ty, except) then
		return false
	end
	return true
end

--- 이벤트 관리자를 붙인다 (6단계). 통행 판정이 이벤트도 보게 된다.
function MapScene:setEvents(manager)
	self.events = manager
	return self
end

--- 그 칸을 차지하고 있는 캐릭터 (이동 중이면 목적지 칸을 차지한다).
function MapScene:characterAt(tx, ty, except)
	for _, c in ipairs(self.characters) do
		if c ~= except and c.tx == tx and c.ty == ty then
			return c
		end
	end
	return nil
end

--- 캐릭터를 만들어 등록한다. opts는 character.lua의 것에 더해
-- charset(이미지 경로), sheetCols, sheetRows를 받는다.
function MapScene:addCharacter(opts)
	opts = opts or {}
	local scene = self

	local char = Character.new{
		tx = opts.tx, ty = opts.ty, dir = opts.dir,
		speed = opts.speed,
		tileW = self.tileW, tileH = self.tileH,
		frameW = opts.frameW, frameH = opts.frameH,
		charset = opts.charset,
		charIndex = opts.charIndex,
		name = opts.name,
		through = opts.through,
		animStepsPerTile = opts.animStepsPerTile,
		canPass = opts.canPass or function(tx, ty, who)
			return scene:isPassable(tx, ty, who)
		end,
	}

	table.insert(self.characters, char)
	table.insert(self.order, char)

	if char.charset ~= nil then
		local cols = opts.sheetCols or Specs.charset.gridCols
		local rows = opts.sheetRows or Specs.charset.gridRows
		local texId = "rpg:" .. char.charset
		local img = self.imageFactory(char.charset, 0, 0,
			char.frameW, char.frameH, cols * rows, texId)
		img.setSheetGrid(cols, rows)
		img.setLoop(false)
		img.setFrames(0, 0)     -- 프레임 전환은 캐릭터가 직접 지정한다
		img.setCurrentFrame(char:frameIndex())
		self.sprites[char] = img
		if self.textures[texId] == nil then
			self.textures[texId] = img
		end
	end

	return char
end

function MapScene:setCameraTarget(char)
	self.cameraTarget = char
	if char ~= nil then
		self.camera:follow(char)
	end
	return self
end

--- 매 프레임. dt는 초.
function MapScene:update(dt)
	for _, c in ipairs(self.characters) do
		c:update(dt)
	end

	if self.cameraTarget ~= nil then
		self.camera:follow(self.cameraTarget)
	end

	table.sort(self.order, Character.compareDepth)

	-- 스프라이트 동기화: 화면 좌표와 프레임 번호
	local camX, camY = self.camera:pos()
	for _, c in ipairs(self.order) do
		local img = self.sprites[c]
		if img ~= nil then
			local x, y = c:pixelPos()
			img.setPosition(math.floor(x) - camX, math.floor(y) - camY)
			img.setCurrentFrame(c:frameIndex())
			img.update(0)
		end
	end
end

--- 화면 밖 캐릭터는 그리지 않는다 (맵이 크면 NPC가 수십이 될 수 있다).
function MapScene:isOnScreen(char)
	local x, y = char:pixelPos()
	local camX, camY = self.camera:pos()
	x, y = x - camX, y - camY
	return x + char.frameW > 0 and x < self.viewW
		and y + char.frameH > 0 and y < self.viewH
end

function MapScene:draw()
	local camX, camY = self.camera:pos()

	self.tilemap.Draw(self.map, 1, self.groundLayers, camX, camY)

	for _, c in ipairs(self.order) do
		local img = self.sprites[c]
		if img ~= nil and c.visible and self:isOnScreen(c) then
			img.draw()
		end
	end

	if self.layerCount > self.groundLayers then
		self.tilemap.Draw(self.map, self.groundLayers + 1, self.layerCount, camX, camY)
	end
end

function MapScene:dispose()
	for _, img in pairs(self.textures) do
		img.dispose()
	end
	self.textures = {}
	self.sprites = {}
	self.characters = {}
	self.order = {}

	if self.map ~= nil then
		self.tilemap.Dispose(self.map)
		self.map = nil
	end
end

return M
