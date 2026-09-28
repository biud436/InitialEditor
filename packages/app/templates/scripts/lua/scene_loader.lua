-- scene_loader.lua : 씬 파일(씬 포맷 v1)을 읽어 실행 오브젝트를 만드는 로더 (R1, docs/plans/r1-scene-loader.md)
--
-- 에디터가 저장한 resources/scenes/<이름>.json 을 읽어 코어 타입(node, sprite, text)을 만들고,
-- 확장 타입(tilemap 등)은 scripts/lua/scene_types/<타입>.lua 에 맡긴다. 오브젝트에 붙은
-- 스크립트 컴포넌트(scripts/lua/components/...)의 init, update, render, destroy 훅을 부른다.
-- C++ 은 이 포맷을 모른다 (맵 포맷 v2 의 events 와 같은 원칙). Ruby 판은 scripts/ruby/scene_loader.rb.
--
--   local SceneLoader = require("scripts/lua/scene_loader")
--   scene = SceneLoader.open("flappy")            -- resources/scenes/flappy.json
--   scene = scene:tick(elapsed)                   -- switch 가 예약돼 있으면 새 씬을 돌려준다
--   scene:draw()
--   scene:close()
--
-- 컴포넌트 계약 (모듈이 표 하나를 돌려준다. 훅은 전부 선택):
--   function M.init(obj, scene, params) end
--   function M.update(obj, scene, elapsed, params) end   -- elapsed 는 ms
--   function M.render(obj, scene, params) end            -- 로더가 스프라이트와 글자를 그린 뒤에 불린다
--   function M.destroy(obj, scene, params) end
-- params 는 그 컴포넌트의 매개변수 표다: 선언 파일(scripts/components/<경로>.json)의 기본값 위에
-- 오브젝트의 params[논리 이름] 을 덮은 것 (계획 문서 5.4절).
--
-- obj 는 실행 오브젝트다: id, type, x, y, visible, props(복사본, 컴포넌트가 고쳐도 된다),
-- sprite(스프라이트 핸들, sprite 타입만), scene, 그리고 spec(파일의 원본 항목, 모르는 키 포함).
-- 로더가 매 틱 obj.x, obj.y, obj.visible 과 props 의 opacity, scale, angle 을 스프라이트에 옮기므로
-- 컴포넌트는 obj.x 를 바꾸는 것으로 움직인다. obj.animate 를 false 로 두면 프레임 애니메이션만 멈춘다.

local SceneLoader = {}

SceneLoader.VERSION = 1
SceneLoader.SCENE_DIR = "resources/scenes/"     -- 이름만 주면 여기서 <이름>.json 을 찾는다
SceneLoader.SCRIPT_ROOT = "scripts/lua/"         -- 논리 이름 "components/bird" 앞에 붙는다
SceneLoader.SCENE_TYPES_DIR = "scene_types/"     -- 확장 타입 모듈 폴더 (SCRIPT_ROOT 아래)
SceneLoader.DECLARATION_ROOT = "scripts/"        -- 컴포넌트 선언 파일: 논리 이름 + ".json" 을 여기서 찾는다
SceneLoader.CORE_TYPES = { node = true, sprite = true, text = true }
SceneLoader.DEFAULT_FRAME_DELAY = 100            -- ms. 엔진 기본값 0 은 매 틱 프레임이 넘어가 버린다

-- sprite 와 text 의 props 기본값. 파일에 없는 키는 이 값으로 채운다.
local SPRITE_DEFAULTS = {
	width = 0, height = 0, frames = 1, scale = 1, angle = 0, opacity = 255,
	loop = true, startFrame = 0, endFrame = 0, frameDelay = SceneLoader.DEFAULT_FRAME_DELAY,
}
local TEXT_DEFAULTS = { text = "", font = "" }

local registeredTypes = {}   -- 코드로 등록한 확장 타입 (이름 -> 모듈)
local loadedTypes = {}       -- 파일에서 읽은 확장 타입 (이름 -> 모듈)
local declarations = {}      -- 컴포넌트 논리 이름 -> 검사를 통과한 선언 표, 선언 파일이 없으면 false
local currentFont = nil      -- 엔진의 비트맵 폰트는 하나뿐이라 지금 준비된 .fnt 경로를 기억한다

-- ---------------------------------------------------------------------------
-- 도우미
-- ---------------------------------------------------------------------------

local function fail(fmt, ...)
	error("scene: " .. string.format(fmt, ...), 0)
end

local function deepcopy(v)
	if type(v) ~= "table" then return v end
	local out = {}
	for k, x in pairs(v) do out[k] = deepcopy(x) end
	return out
end

-- 프로젝트 루트 기준 상대 경로에 "./" 를 붙인다 (절대 경로와 이미 "./" 인 것은 그대로)
local function resolvePath(p)
	if p:sub(1, 1) == "/" or p:sub(1, 2) == "./" or p:match("^%a:") then return p end
	return "./" .. p
end

-- PNG 헤더(IHDR)에서 이미지 크기를 읽는다. 엔진이 텍스처 크기를 스크립트에 주지 않아서다.
local function pngSize(path)
	local f = io.open(path, "rb")
	if not f then return nil, "cannot open" end
	local head = f:read(24)
	f:close()
	if not head or #head < 24 or head:sub(1, 8) ~= "\137PNG\r\n\26\n" then
		return nil, "not a PNG"
	end
	local b = { head:byte(17, 24) }
	local w = ((b[1] * 256 + b[2]) * 256 + b[3]) * 256 + b[4]
	local h = ((b[5] * 256 + b[6]) * 256 + b[7]) * 256 + b[8]
	return w, h
end

local function isInteger(v)
	return type(v) == "number" and v == math.floor(v)
end

local function checkNumber(v, what, where)
	if v ~= nil and type(v) ~= "number" then
		return string.format("%s must be a number (%s)", what, where)
	end
end

-- 논리 이름 -> Lua 모듈 이름과 파일 경로
function SceneLoader.componentModule(name)
	return SceneLoader.SCRIPT_ROOT .. name
end

function SceneLoader.componentPath(name)
	return SceneLoader.componentModule(name) .. ".lua"
end

function SceneLoader.sceneTypeModule(typeName)
	return SceneLoader.SCRIPT_ROOT .. SceneLoader.SCENE_TYPES_DIR .. typeName
end

-- 모듈이 있으면 require 한 결과를, 없으면 nil 을 돌려준다 (문법 오류는 그대로 올라간다)
local function requireIfExists(modname)
	if package.loaded[modname] ~= nil then return package.loaded[modname] end
	if package.preload[modname] == nil then
		local found = package.searchpath(modname, package.path)
		if found == nil then return nil end
	end
	return require(modname)
end

-- 컴포넌트 모듈을 찾는다. 없으면 논리 이름과 찾은 경로를 말하며 실패한다.
local function loadComponent(name)
	local modname = SceneLoader.componentModule(name)
	local mod = requireIfExists(modname)
	if mod == nil then
		fail("component '%s' not found (%s)", name, SceneLoader.componentPath(name))
	end
	if type(mod) ~= "table" then
		fail("component '%s' must return a table (%s)", name, SceneLoader.componentPath(name))
	end
	return mod
end

-- 타입 이름을 푼다: 코어 타입이면 "core", 확장 타입이면 모듈, 모르면 nil.
function SceneLoader.resolveType(typeName)
	if type(typeName) ~= "string" or typeName == "" then return nil end
	if SceneLoader.CORE_TYPES[typeName] then return "core" end
	local mod = registeredTypes[typeName] or loadedTypes[typeName]
	if mod == nil then
		mod = requireIfExists(SceneLoader.sceneTypeModule(typeName))
		if mod ~= nil then
			if type(mod) ~= "table" or type(mod.create) ~= "function" then
				fail("scene type '%s' must return a table with create(obj, scene)", typeName)
			end
			loadedTypes[typeName] = mod
		end
	end
	return mod
end

-- 확장 타입을 코드로 등록한다 (파일 없이). 테스트와 게임이 쓴다.
function SceneLoader.registerType(typeName, mod)
	registeredTypes[typeName] = mod
end

-- ---------------------------------------------------------------------------
-- 컴포넌트 매개변수 (params, 계획 문서 5.4절)
-- ---------------------------------------------------------------------------

local FIELD_TYPES = {
	string = true, text = true, number = true, integer = true, boolean = true, enum = true, object = true,
}

-- JSON 객체인가: 키가 전부 문자열인 표. 빈 표도 된다 (Json.Load 는 [] 과 {} 를 같은 빈 표로 읽는다).
local function isObject(v)
	if type(v) ~= "table" then return false end
	for k in pairs(v) do
		if type(k) ~= "string" then return false end
	end
	return true
end

-- JSON 배열인가: 키가 정확히 1..n 인 표. 빈 표도 된다.
local function isArray(v)
	if type(v) ~= "table" then return false end
	local n = 0
	for k in pairs(v) do
		if math.type(k) ~= "integer" or k < 1 then return false end
		n = n + 1
	end
	return n == #v
end

local function sortedKeys(t)
	local keys = {}
	for k in pairs(t) do keys[#keys + 1] = k end
	table.sort(keys)
	return keys
end

-- 메시지 속의 숫자: 정수 값이면 정수로, 아니면 유효 숫자 14자리
local function numText(v)
	if v == math.floor(v) and math.abs(v) < 1e15 then return string.format("%d", v) end
	return string.format("%.14g", v)
end

local function isIdentifier(s)
	return type(s) == "string" and s:match("^[A-Za-z_][A-Za-z0-9_]*$") ~= nil
end

-- 값 하나가 필드에 맞는지 본다. 맞지 않으면 "must be ..." 꼴의 문장, 맞으면 nil.
-- hasId 를 주면 object 값이 가리키는 id 가 있는지도 본다 (선언의 default 검사는 주지 않는다).
local function checkFieldValue(field, v, hasId)
	local t = field.type
	if t == "string" or t == "text" then
		if type(v) ~= "string" then return "must be a string" end
	elseif t == "number" or t == "integer" then
		if t == "number" and type(v) ~= "number" then return "must be a number" end
		if t == "integer" and not isInteger(v) then return "must be an integer" end
		if field.min ~= nil and v < field.min then return "must be >= " .. numText(field.min) end
		if field.max ~= nil and v > field.max then return "must be <= " .. numText(field.max) end
	elseif t == "boolean" then
		if type(v) ~= "boolean" then return "must be a boolean" end
	elseif t == "enum" then
		for _, allowed in ipairs(field.values) do
			if v == allowed then return nil end
		end
		return "must be one of " .. table.concat(field.values, ", ")
	elseif t == "object" then
		if type(v) ~= "string" or v == "" then return "must be an object id" end
		if hasId ~= nil and not hasId(v) then return string.format("names no object '%s'", v) end
	end
	return nil
end

-- 선언 표를 검사한다. 문제가 있으면 문장을, 없으면 nil 을 돌려준다. fields 가 없으면 빈 배열로 채운다.
local function checkDeclaration(decl)
	if not isObject(decl) then return "not an object" end
	if decl.version ~= 1 then
		return string.format("unsupported version %s (expected 1)", tostring(decl.version))
	end
	if decl.fields == nil then decl.fields = {} end
	if not isArray(decl.fields) then return "fields must be an array" end
	local seen = {}
	for i, f in ipairs(decl.fields) do
		if not isObject(f) then return string.format("fields[%d] is not an object", i) end
		if not isIdentifier(f.key) then
			return string.format("fields[%d] needs a key ([A-Za-z_][A-Za-z0-9_]*)", i)
		end
		if seen[f.key] then return string.format("duplicate key '%s'", f.key) end
		seen[f.key] = true
		local where = string.format("field '%s'", f.key)
		if type(f.type) ~= "string" then return where .. " needs a type" end
		if not FIELD_TYPES[f.type] then return string.format("%s: unknown type '%s'", where, f.type) end
		if f.label ~= nil and type(f.label) ~= "string" then return where .. ": label must be a string" end
		if f.type == "enum" then
			local ok = isArray(f.values) and #f.values > 0
			for _, v in ipairs(ok and f.values or {}) do
				if type(v) ~= "string" or v == "" then ok = false end
			end
			if not ok then return where .. ": values must be a non-empty array of strings" end
		elseif f.values ~= nil then
			return where .. ": values is only for enum"
		end
		for _, bound in ipairs({ "min", "max" }) do
			if f[bound] ~= nil then
				if f.type ~= "number" and f.type ~= "integer" then
					return string.format("%s: %s is only for number and integer", where, bound)
				end
				if type(f[bound]) ~= "number" then
					return string.format("%s: %s must be a number", where, bound)
				end
			end
		end
		if f.min ~= nil and f.max ~= nil and f.min > f.max then
			return where .. ": min must be <= max"
		end
		if f.default ~= nil then
			local problem = checkFieldValue(f, f.default, nil)
			if problem then return string.format("%s: default %s", where, problem) end
		end
	end
	return nil
end

-- Json.Load 의 파싱 오류에서 파서의 설명만 한 줄로 떼어 낸다
local function parseErrorDetail(message)
	message = tostring(message)
	local detail = message:match("parse error in .-: (.*)$") or message
	return (detail:gsub("%s+", " "):match("^%s*(.-)%s*$"))
end

-- 논리 이름 -> 선언 파일 경로 ("components/mover" -> "scripts/components/mover.json")
function SceneLoader.declarationPath(name)
	return SceneLoader.DECLARATION_ROOT .. name .. ".json"
end

-- 선언 파일을 읽어 검사한다. 선언 표를, 파일이 없으면 nil 을, 깨졌으면 nil 과 문장을 돌려준다.
-- 통과한 선언과 파일 없음은 기억해 두고 다시 읽지 않는다.
local function loadDeclaration(name)
	local cached = declarations[name]
	if cached ~= nil then return cached or nil end
	local path = SceneLoader.declarationPath(name)
	local f = io.open(resolvePath(path), "rb")
	if f == nil then
		declarations[name] = false
		return nil
	end
	f:close()
	local decl, err = Json.Load(resolvePath(path))
	if decl == nil and err ~= nil then
		return nil, string.format("declaration %s: not valid JSON (%s)", path, parseErrorDetail(err))
	end
	local problem = checkDeclaration(decl)
	if problem then return nil, string.format("declaration %s: %s", path, problem) end
	declarations[name] = decl
	return decl
end

-- 컴포넌트의 선언 (검사를 통과한 표의 복사본). 선언 파일이 없으면 nil, 깨졌으면 오류.
function SceneLoader.declaration(name)
	local decl, err = loadDeclaration(name)
	if err then error("scene: " .. err, 0) end
	return deepcopy(decl)
end

local function fieldOf(decl, key)
	for _, f in ipairs(decl.fields) do
		if f.key == key then return f end
	end
	return nil
end

-- 오브젝트 항목의 params 를 검사한다. 문제가 있으면 문장을, 없으면 nil 을 돌려준다.
-- hasId(id) 는 object 값이 가리킬 수 있는 id 인지 답한다. validateObject 를 통과한 항목에만 부른다.
local function validateParams(spec, hasId)
	local label = spec.id
	local params = spec.params
	if params ~= nil and not isObject(params) then
		return string.format("params must be an object (%s)", label)
	end
	local decls = {}
	for _, name in ipairs(spec.scripts or {}) do
		local decl, err = loadDeclaration(name)
		if err then return err end
		decls[name] = decl or false
	end
	if params == nil then return nil end
	for _, name in ipairs(sortedKeys(params)) do
		local values = params[name]
		if decls[name] == nil then
			return string.format("params '%s': not in scripts (%s)", name, label)
		end
		if not isObject(values) then
			return string.format("params '%s' must be an object (%s)", name, label)
		end
		local decl = decls[name]
		if decl then
			for _, key in ipairs(sortedKeys(values)) do
				local field = fieldOf(decl, key)
				if field == nil then
					return string.format("params '%s': unknown key '%s' (%s)", name, key, label)
				end
				local problem = checkFieldValue(field, values[key], hasId)
				if problem then
					return string.format("params '%s': %s %s (%s)", name, key, problem, label)
				end
			end
		end
	end
	return nil
end

-- 컴포넌트 하나의 params 표를 만든다: 선언의 기본값 위에 오브젝트의 params[name] 을 덮는다 (깊은 복사).
local function componentParams(name, spec)
	local decl, err = loadDeclaration(name)
	if err then error("scene: " .. err, 0) end
	local out = {}
	if decl then
		for _, f in ipairs(decl.fields) do
			if f.default ~= nil then out[f.key] = deepcopy(f.default) end
		end
	end
	local values = spec.params and spec.params[name]
	if type(values) == "table" then
		for k, v in pairs(values) do out[k] = deepcopy(v) end
	end
	return out
end

-- ---------------------------------------------------------------------------
-- 검증 (에디터의 규칙과 같은 목록이어야 한다. 계획 문서 3절)
-- ---------------------------------------------------------------------------

-- 오브젝트 항목 하나를 검사한다. 문제가 있으면 메시지를, 없으면 nil 을 돌려준다.
-- ids 는 이미 쓰인 id 의 집합이다 (중복 검사). allowNoId 는 spawn 용 (id 자동 생성).
local function validateObject(spec, index, ids, allowNoId)
	local where = "object #" .. tostring(index)
	if type(spec) ~= "table" then return where .. " is not an object" end
	if spec.id ~= nil or not allowNoId then
		if type(spec.id) ~= "string" or spec.id == "" then
			return where .. " needs a non-empty string id"
		end
		if ids[spec.id] then return string.format("duplicate id '%s'", spec.id) end
	end
	local label = spec.id or where
	if type(spec.type) ~= "string" or spec.type == "" then
		return string.format("object '%s' needs a type", label)
	end
	local typeMod = SceneLoader.resolveType(spec.type)
	if typeMod == nil then
		return string.format("unknown type '%s' (object '%s')", spec.type, label)
	end
	local err = checkNumber(spec.x, "x", label) or checkNumber(spec.y, "y", label)
	if err then return err end
	if spec.visible ~= nil and type(spec.visible) ~= "boolean" then
		return string.format("visible must be a boolean (%s)", label)
	end
	if spec.props ~= nil and type(spec.props) ~= "table" then
		return string.format("props must be an object (%s)", label)
	end
	if spec.scripts ~= nil then
		if type(spec.scripts) ~= "table" then
			return string.format("scripts must be an array (%s)", label)
		end
		for i, s in ipairs(spec.scripts) do
			if type(s) ~= "string" or s == "" then
				return string.format("scripts[%d] must be a non-empty string (%s)", i, label)
			end
		end
	end
	local p = spec.props or {}
	if spec.type == "sprite" then
		if type(p.image) ~= "string" or p.image == "" then
			return string.format("sprite '%s' needs props.image", label)
		end
		for _, k in ipairs({ "width", "height", "frames", "scale", "angle", "opacity",
				"startFrame", "endFrame", "frameDelay" }) do
			err = checkNumber(p[k], "props." .. k, label)
			if err then return err end
		end
		for _, k in ipairs({ "width", "height", "frames", "startFrame", "endFrame", "opacity" }) do
			if p[k] ~= nil and not isInteger(p[k]) then
				return string.format("props.%s must be an integer (%s)", k, label)
			end
		end
		if p.frames ~= nil and p.frames < 1 then
			return string.format("props.frames must be >= 1 (%s)", label)
		end
		if (p.width ~= nil and p.width < 0) or (p.height ~= nil and p.height < 0) then
			return string.format("props.width/height must be >= 0 (%s)", label)
		end
		if (p.startFrame ~= nil and p.startFrame < 0) or (p.endFrame ~= nil and p.endFrame < 0) then
			return string.format("props.startFrame/endFrame must be >= 0 (%s)", label)
		end
		if p.opacity ~= nil and (p.opacity < 0 or p.opacity > 255) then
			return string.format("props.opacity must be 0..255 (%s)", label)
		end
		if p.loop ~= nil and type(p.loop) ~= "boolean" then
			return string.format("props.loop must be a boolean (%s)", label)
		end
	elseif spec.type == "text" then
		if p.text ~= nil and type(p.text) ~= "string" and type(p.text) ~= "number" then
			return string.format("props.text must be a string (%s)", label)
		end
		if p.font ~= nil and type(p.font) ~= "string" then
			return string.format("props.font must be a string (%s)", label)
		end
		if p.color ~= nil then
			if type(p.color) ~= "table" or #p.color < 3 or #p.color > 4 then
				return string.format("props.color must be [r, g, b] or [r, g, b, a] (%s)", label)
			end
			for i = 1, #p.color do
				if type(p.color[i]) ~= "number" or p.color[i] < 0 or p.color[i] > 255 then
					return string.format("props.color[%d] must be 0..255 (%s)", i, label)
				end
			end
		end
	elseif typeMod ~= "core" and typeMod.validate then
		local ok, terr = typeMod.validate(spec)
		if not ok then
			return string.format("%s (%s)", tostring(terr), label)
		end
	end
	return nil
end

-- 씬 표 전체를 검사한다. ok, err 를 돌려준다 (err 는 "scene: ..." 으로 시작한다).
function SceneLoader.validate(tbl)
	if type(tbl) ~= "table" then return false, "scene: not an object" end
	if tbl.version ~= SceneLoader.VERSION then
		return false, string.format("scene: unsupported version %s (expected %d)",
			tostring(tbl.version), SceneLoader.VERSION)
	end
	if tbl.name ~= nil and type(tbl.name) ~= "string" then
		return false, "scene: name must be a string"
	end
	if tbl.objects ~= nil and type(tbl.objects) ~= "table" then
		return false, "scene: objects must be an array"
	end
	local ids = {}
	for i, spec in ipairs(tbl.objects or {}) do
		local err = validateObject(spec, i, ids, false)
		if err then return false, "scene: " .. err end
		ids[spec.id] = true
	end
	-- params 는 id 를 다 모은 뒤에 본다 (object 값이 뒤의 오브젝트를 가리킬 수 있다)
	local function hasId(id) return ids[id] == true end
	for _, spec in ipairs(tbl.objects or {}) do
		local err = validateParams(spec, hasId)
		if err then return false, "scene: " .. err end
	end
	return true
end

-- ---------------------------------------------------------------------------
-- 오브젝트 만들기
-- ---------------------------------------------------------------------------

-- 파일 항목에서 실행 오브젝트의 뼈대를 만든다 (기본값을 채운다)
local function normalizeObject(spec)
	local obj = {
		id = spec.id,
		type = spec.type,
		x = spec.x or 0,
		y = spec.y or 0,
		visible = (spec.visible == nil) and true or spec.visible,
		props = deepcopy(spec.props or {}),
		scripts = {},
		sprite = nil,
		animate = true,
		spec = spec,
		_components = {},
	}
	for i, s in ipairs(spec.scripts or {}) do obj.scripts[i] = s end
	local defaults = (spec.type == "sprite" and SPRITE_DEFAULTS)
		or (spec.type == "text" and TEXT_DEFAULTS) or nil
	if defaults then
		for k, v in pairs(defaults) do
			if obj.props[k] == nil then obj.props[k] = v end
		end
	end
	return obj
end

-- 폰트를 준비한다. 같은 폰트면 다시 읽지 않는다.
local function useFont(path, label)
	if path == "" or path == currentFont then return end
	if not PreparaFont(resolvePath(path)) then
		fail("text '%s': cannot load font %s", label, path)
	end
	currentFont = path
end

local Scene = {}
Scene.__index = Scene

-- 텍스처는 이미지 경로를 id 로 삼아 씬 안에서 참조 수를 센다 (같은 그림은 한 번만 읽는다)
function Scene:_acquireTexture(path)
	local count = self._textures[path]
	if count == nil then
		if not TextureManager.Load(path, path) then
			fail("cannot load image %s", path)
		end
		count = 0
	end
	self._textures[path] = count + 1
	return path
end

function Scene:_releaseTexture(path)
	local count = self._textures[path]
	if count == nil then return end
	if count <= 1 then
		TextureManager.Remove(path)
		self._textures[path] = nil
	else
		self._textures[path] = count - 1
	end
end

-- sprite props -> 엔진 Sprite API. 대응은 계획 문서 4절에 적혀 있다.
function Scene:_createSprite(obj)
	local p = obj.props
	local path = resolvePath(p.image)
	local texId = self:_acquireTexture(path)
	local frames = math.max(1, math.floor(p.frames))
	local w, h = math.floor(p.width), math.floor(p.height)
	if w == 0 or h == 0 then
		local iw, ih, err = pngSize(path)
		if not iw then
			fail("sprite '%s': cannot read the size of %s (%s)", obj.id, p.image, err)
		end
		if w == 0 then w = math.floor(iw / frames) end   -- 0 은 이미지 폭을 frames 로 나눈 것
		if h == 0 then h = ih end                          -- 0 은 이미지 높이 전체
	end
	local handle = Sprite.Create(obj.x, obj.y, w, h, frames, texId)
	if handle == nil or handle == 0 then
		fail("sprite '%s': Sprite.Create failed", obj.id)
	end
	Sprite.SetSheetGrid(handle, frames, 1)         -- 시트는 가로 한 줄이다
	local first = math.floor(p.startFrame)
	local last = math.floor(p.endFrame)
	if last <= 0 or last < first then last = first end   -- endFrame 0 은 한 프레임
	Sprite.SetFrames(handle, first, last + 1)      -- 엔진의 둘째 인자는 끝의 다음이다
	Sprite.SetCurrentFrame(handle, first)
	Sprite.SetFrameDelay(handle, p.frameDelay)
	Sprite.SetLoop(handle, p.loop and true or false)
	Sprite.SetScale(handle, p.scale)
	Sprite.SetAngle(handle, p.angle)
	Sprite.SetOpacity(handle, math.floor(p.opacity))
	Sprite.SetVisible(handle, obj.visible and true or false)
	obj.sprite = handle
	obj.texture = texId
	obj.frameWidth = w
	obj.frameHeight = h
end

function Scene:_create(spec)
	local obj = normalizeObject(spec)
	obj.scene = self
	if obj.type == "sprite" then
		self:_createSprite(obj)
	elseif obj.type == "text" then
		useFont(obj.props.font, obj.id)
	elseif obj.type ~= "node" then
		obj._type = SceneLoader.resolveType(obj.type)
		obj._type.create(obj, self)
	end
	for _, name in ipairs(obj.scripts) do
		obj._components[#obj._components + 1] = {
			name = name, module = loadComponent(name), params = componentParams(name, spec),
		}
	end
	return obj
end

function Scene:_initComponents(obj)
	for _, c in ipairs(obj._components) do
		if c.module.init then c.module.init(obj, self, c.params) end
	end
end

function Scene:_destroyObject(obj)
	for _, c in ipairs(obj._components) do
		if c.module.destroy then c.module.destroy(obj, self, c.params) end
	end
	if obj._type and obj._type.destroy then obj._type.destroy(obj, self) end
	if obj.sprite then
		Sprite.Dispose(obj.sprite)
		obj.sprite = nil
		self:_releaseTexture(obj.texture)
	end
	obj.removed = true
end

-- 매 틱 오브젝트의 값을 스프라이트에 옮기고 애니메이션을 진행한다
function Scene:_commitSprite(obj, elapsed)
	local h, p = obj.sprite, obj.props
	Sprite.SetPosition(h, obj.x, obj.y)
	Sprite.SetVisible(h, obj.visible and true or false)
	local opacity = math.floor(p.opacity or 255)
	if opacity < 0 then opacity = 0 elseif opacity > 255 then opacity = 255 end
	Sprite.SetOpacity(h, opacity)
	Sprite.SetScale(h, p.scale or 1)
	Sprite.SetAngle(h, p.angle or 0)
	Sprite.Update(h, (obj.animate ~= false) and elapsed or 0)
end

local function drawText(obj)
	local p = obj.props
	useFont(p.font, obj.id)
	-- 줄바꿈은 엔진의 DrawText 가 처리한다 ("\n" 마다 x 로 돌아가 lineHeight 만큼 내려간다).
	-- props.color 는 보존만 한다. 엔진의 비트맵 폰트 API 에 색 인자가 없다 (계획 문서 4절).
	DrawText(obj.x, obj.y, tostring(p.text))
end

-- ---------------------------------------------------------------------------
-- 씬 API (컴포넌트가 쓴다)
-- ---------------------------------------------------------------------------

function Scene:find(id)
	return self._byId[id]
end

-- 그리기 순서대로의 오브젝트 목록 (복사본)
function Scene:objects()
	local out = {}
	for i, obj in ipairs(self._order) do out[i] = obj end
	return out
end

function Scene:isClosed()
	return self._closed
end

local function indexOf(list, item)
	for i, v in ipairs(list) do
		if v == item then return i end
	end
	return nil
end

function Scene:_autoId(typeName)
	while true do
		self._autoCount = self._autoCount + 1
		local id = string.format("%s_%d", tostring(typeName or "object"), self._autoCount)
		if self._byId[id] == nil then return id end
	end
end

-- spec 은 파일의 오브젝트 항목과 같은 표다. id 가 없으면 만들어 준다.
-- afterId 를 주면 그 오브젝트 바로 뒤(그리기 순서)에 끼우고, 없으면 맨 뒤에 붙인다.
-- 만든 오브젝트의 컴포넌트 init 은 바로 불리고, update 는 다음 틱부터 불린다.
function Scene:spawn(spec, afterId)
	if self._closed then fail("scene '%s' is closed", self.name) end
	if type(spec) ~= "table" then fail("spawn needs an object spec") end
	if spec.id == nil then
		spec = deepcopy(spec)
		spec.id = self:_autoId(spec.type)
	end
	local err = validateObject(spec, "spawn", self._byId, false)
	if err then error("scene: " .. err, 0) end
	err = validateParams(spec, function(id) return id == spec.id or self._byId[id] ~= nil end)
	if err then error("scene: " .. err, 0) end
	local pos = #self._order + 1
	if afterId ~= nil then
		local anchor = self._byId[afterId]
		if anchor == nil then fail("spawn: no object '%s' to insert after", tostring(afterId)) end
		pos = indexOf(self._order, anchor) + 1
	end
	local obj = self:_create(spec)
	table.insert(self._order, pos, obj)
	self._byId[obj.id] = obj
	self:_initComponents(obj)
	return obj
end

-- 오브젝트를 없앤다 (컴포넌트 destroy, 스프라이트 해제). 없던 id 면 false.
function Scene:remove(id)
	local obj = self._byId[id]
	if obj == nil then return false end
	self:_destroyObject(obj)
	self._byId[id] = nil
	local i = indexOf(self._order, obj)
	if i then table.remove(self._order, i) end
	return true
end

-- 다음 tick 에서 이 씬을 닫고 resources/scenes/<name>.json 을 연다 (경로도 된다)
function Scene:switch(name)
	self._pending = name
end

-- 한 틱: 컴포넌트 update -> 스프라이트에 값 반영 -> 예약된 전환. 다음 프레임에 쓸 씬을 돌려준다.
function Scene:tick(elapsed)
	if self._closed then fail("scene '%s' is closed", self.name) end
	local snapshot = self:objects()   -- update 도중의 spawn, remove 가 순회를 흔들지 않게
	for _, obj in ipairs(snapshot) do
		if not obj.removed then
			for _, c in ipairs(obj._components) do
				if c.module.update then c.module.update(obj, self, elapsed, c.params) end
			end
			if obj._type and obj._type.update then obj._type.update(obj, self, elapsed) end
		end
	end
	for _, obj in ipairs(self._order) do
		if obj.sprite then self:_commitSprite(obj, elapsed) end
	end
	if self._pending ~= nil then
		local target = self._pending
		self._pending = nil
		self:close()
		return SceneLoader.open(target)
	end
	return self
end

-- 그리기: 확장 타입의 아래 층 -> 오브젝트 순서대로 (스프라이트, 글자, 컴포넌트 render) -> 위 층
function Scene:draw()
	if self._closed then return end
	for _, obj in ipairs(self._order) do
		if obj.visible and obj._type and obj._type.drawBelow then obj._type.drawBelow(obj, self) end
	end
	for _, obj in ipairs(self._order) do
		if obj.visible then
			if obj.sprite then
				Sprite.Draw(obj.sprite)
			elseif obj.type == "text" then
				drawText(obj)
			elseif obj._type and obj._type.draw then
				obj._type.draw(obj, self)
			end
			for _, c in ipairs(obj._components) do
				if c.module.render then c.module.render(obj, self, c.params) end
			end
		end
	end
	for _, obj in ipairs(self._order) do
		if obj.visible and obj._type and obj._type.drawAbove then obj._type.drawAbove(obj, self) end
	end
end

-- 씬을 닫는다: 컴포넌트 destroy, 스프라이트와 텍스처, 확장 타입 자원 해제
function Scene:close()
	if self._closed then return end
	for _, obj in ipairs(self._order) do
		self:_destroyObject(obj)
	end
	for path in pairs(self._textures) do
		TextureManager.Remove(path)
	end
	self._textures = {}
	self._order = {}
	self._byId = {}
	self._closed = true
end

-- ---------------------------------------------------------------------------
-- 열기
-- ---------------------------------------------------------------------------

-- 이름이면 resources/scenes/<이름>.json, 경로("/" 가 있거나 .json 으로 끝난다)면 그대로
function SceneLoader.scenePath(nameOrPath)
	if nameOrPath:find("/", 1, true) or nameOrPath:sub(-5) == ".json" then
		return resolvePath(nameOrPath)
	end
	return resolvePath(SceneLoader.SCENE_DIR .. nameOrPath .. ".json")
end

-- 이미 읽은 표에서 씬을 만든다 (검증 -> 오브젝트 생성 -> 컴포넌트 init 순서대로)
function SceneLoader.fromTable(tbl, opts)
	opts = opts or {}
	local ok, err = SceneLoader.validate(tbl)
	if not ok then error(err, 0) end
	local scene = setmetatable({
		name = tbl.name or opts.name or "scene",
		path = opts.path,
		state = {},
		source = tbl,
		_order = {},
		_byId = {},
		_textures = {},
		_autoCount = 0,
		_pending = nil,
		_closed = false,
	}, Scene)
	for _, spec in ipairs(tbl.objects or {}) do
		local obj = scene:_create(spec)
		scene._order[#scene._order + 1] = obj
		scene._byId[obj.id] = obj
	end
	for _, obj in ipairs(scene:objects()) do
		scene:_initComponents(obj)
	end
	return scene
end

function SceneLoader.open(nameOrPath)
	if type(nameOrPath) ~= "string" or nameOrPath == "" then
		fail("open needs a scene name or path")
	end
	local path = SceneLoader.scenePath(nameOrPath)
	local data, err = Json.Load(path)
	if data == nil then
		fail("cannot open scene %s (%s)", path, tostring(err))
	end
	return SceneLoader.fromTable(data, { name = nameOrPath, path = path })
end

return SceneLoader
