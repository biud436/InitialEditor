-- scene_types/tilemap.lua : 씬 포맷 v1 의 확장 타입 "tilemap" (R1, docs/plans/r1-scene-loader.md)
--
-- 씬 로더가 모르는 타입을 만나면 scripts/lua/scene_types/<타입>.lua 를 게으르게 require 한다.
-- 확장 타입 모듈의 표면 (create 만 필수):
--   M.validate(spec) -> ok, err        타입 고유 props 검사 (에디터와 같은 규칙)
--   M.create(obj, scene)               엔진 자원을 만든다
--   M.update(obj, scene, elapsed)
--   M.drawBelow(obj, scene)            오브젝트들보다 먼저 그린다
--   M.draw(obj, scene)                 오브젝트 순서 자리에서 그린다
--   M.drawAbove(obj, scene)            오브젝트들 뒤에 그린다
--   M.destroy(obj, scene)              자원을 놓는다
--
-- props: map (엔진 맵 포맷 v2 경로), groundLayers (스프라이트 아래에 그리는 레이어 수, 기본 1).
-- 나머지 레이어는 오브젝트들 위에 그린다. obj.x, obj.y 는 맵의 화면 위치다 (카메라의 반대 부호).

local M = {}

local function resolvePath(p)
	if p:sub(1, 1) == "/" or p:sub(1, 2) == "./" or p:match("^%a:") then return p end
	return "./" .. p
end

function M.validate(spec)
	local p = spec.props or {}
	if type(p.map) ~= "string" or p.map == "" then
		return false, "tilemap needs props.map"
	end
	if p.groundLayers ~= nil and (type(p.groundLayers) ~= "number" or p.groundLayers < 0) then
		return false, "tilemap props.groundLayers must be a number >= 0"
	end
	return true
end

function M.create(obj, scene)
	local p = obj.props
	if p.groundLayers == nil then p.groundLayers = 1 end
	local handle, err = Tilemap.Load(resolvePath(p.map))
	if handle == nil then
		error(string.format("scene: tilemap '%s': cannot load %s (%s)", obj.id, p.map, tostring(err)), 0)
	end
	obj.tilemap = handle
	obj.mapWidth, obj.mapHeight, obj.tileWidth, obj.tileHeight, obj.layerCount = Tilemap.GetSize(handle)
end

local function groundLayers(obj)
	return math.min(math.floor(obj.props.groundLayers or 1), obj.layerCount)
end

function M.drawBelow(obj, scene)
	local ground = groundLayers(obj)
	if ground >= 1 then
		Tilemap.Draw(obj.tilemap, 1, ground, -math.floor(obj.x), -math.floor(obj.y))
	end
end

function M.drawAbove(obj, scene)
	local ground = groundLayers(obj)
	if ground < obj.layerCount then
		Tilemap.Draw(obj.tilemap, ground + 1, obj.layerCount, -math.floor(obj.x), -math.floor(obj.y))
	end
end

function M.destroy(obj, scene)
	if obj.tilemap then
		Tilemap.Dispose(obj.tilemap)
		obj.tilemap = nil
	end
end

return M
