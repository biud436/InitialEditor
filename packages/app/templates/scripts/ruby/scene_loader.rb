# scene_loader.rb : 씬 파일(씬 포맷 v1)을 읽어 실행 오브젝트를 만드는 로더 (R1, docs/plans/r1-scene-loader.md)
#
# 에디터가 저장한 resources/scenes/<이름>.json 을 읽어 코어 타입(node, sprite, text)을 만들고, 확장 타입(tilemap 등)은
# scripts/ruby/scene_types/<타입>.rb 의 SceneTypes::<CamelCase> 에 맡긴다. Lua 의 scripts/lua/scene_loader.lua 와
# 같은 파일을 같은 규칙으로 읽는다. 오브젝트에 붙은 스크립트 컴포넌트(scripts/ruby/components/...)는 논리 이름
# 전체의 모듈 경로 클래스(components/flappy/bird -> Components::Flappy::Bird)이거나, 그것이 없으면 파일 이름
# 마지막 조각의 CamelCase 클래스이며(components/pipe_spawner -> PipeSpawner) 오브젝트마다 하나씩 만들어
# init, update, render, destroy 를 부른다.
#
#   require "scripts/ruby/scene_loader"
#   scene = SceneLoader.open("flappy")             # resources/scenes/flappy.json
#   scene = scene.tick(elapsed)                    # switch 가 예약돼 있으면 새 씬을 돌려준다
#   scene.draw
#   scene.close
#
# 컴포넌트 계약 (인스턴스 메서드, 전부 선택):
#   def init(obj, scene); end
#   def update(obj, scene, elapsed); end          # elapsed 는 ms
#   def render(obj, scene); end                   # 로더가 스프라이트와 글자를 그린 뒤에 불린다
#   def destroy(obj, scene); end
# initialize 가 위치 인자를 받으면 new(params) 로 만든다. params 는 선언 파일(scripts/components/<경로>.json)의
# 기본값 위에 오브젝트의 params[논리 이름] 을 덮은 문자열 키 Hash 다 (계획 문서 5.4절). 아니면 new.
#
# obj 는 실행 오브젝트(SceneObject)다: id, type, x, y, visible, props(문자열 키 Hash 복사본, 컴포넌트가
# 고쳐도 된다), sprite(Sprite 객체, sprite 타입만), scene, spec(파일의 원본 항목, 모르는 키 포함).
# Lua 표처럼 열려 있어 컴포넌트가 아무 필드나 붙일 수 있고(obj.target = ...), 없는 필드는 nil 이다.
# 로더가 매 틱 obj.x, obj.y, obj.visible 과 props 의 opacity, scale, angle 을 스프라이트에 옮기므로
# 컴포넌트는 obj.x 를 바꾸는 것으로 움직인다. obj.animate = false 면 프레임 애니메이션만 멈춘다.

# 확장 타입 모듈이 이 안에 정의된다 (scripts/ruby/scene_types/tilemap.rb -> SceneTypes::Tilemap)
module SceneTypes
end

module SceneLoader
  VERSION = 1
  SCENE_DIR = "resources/scenes/"      # 이름만 주면 여기서 <이름>.json 을 찾는다
  SCRIPT_ROOT = "scripts/ruby/"        # 논리 이름 "components/bird" 앞에 붙는다
  SCENE_TYPES_DIR = "scene_types/"     # 확장 타입 모듈 폴더 (SCRIPT_ROOT 아래)
  DECLARATION_ROOT = "scripts/"        # 컴포넌트 선언 파일: 논리 이름 + ".json" 을 여기서 찾는다
  CORE_TYPES = ["node", "sprite", "text"]
  DEFAULT_FRAME_DELAY = 100            # ms. 엔진 기본값 0 은 매 틱 프레임이 넘어가 버린다

  # sprite 와 text 의 props 기본값. 파일에 없는 키는 이 값으로 채운다.
  SPRITE_DEFAULTS = {
    "width" => 0, "height" => 0, "frames" => 1, "scale" => 1, "angle" => 0, "opacity" => 255,
    "loop" => true, "startFrame" => 0, "endFrame" => 0, "frameDelay" => DEFAULT_FRAME_DELAY,
  }
  TEXT_DEFAULTS = { "text" => "", "font" => "" }

  SPRITE_NUMBER_KEYS = ["width", "height", "frames", "scale", "angle", "opacity", "startFrame", "endFrame", "frameDelay"]
  SPRITE_INTEGER_KEYS = ["width", "height", "frames", "startFrame", "endFrame", "opacity"]

  # 선언 파일의 필드 타입
  FIELD_TYPES = ["string", "text", "number", "integer", "boolean", "enum", "object"]

  # 로더의 모든 오류. 메시지는 "scene: ..." 으로 시작한다 (Lua 판과 같은 문장)
  class Error < StandardError
  end

  HOOKS = [:init, :update, :render, :destroy]
  TYPE_HOOKS = [:validate, :create, :update, :draw_below, :draw, :draw_above, :destroy]

  @registered_types = {}   # 코드로 등록한 확장 타입 (이름 -> 모듈)
  @loaded_types = {}       # 파일에서 읽은 확장 타입 (이름 -> 모듈)
  @components = {}         # 논리 이름 -> 클래스
  @declarations = {}       # 논리 이름 -> 검사를 통과한 선언 Hash, 선언 파일이 없으면 false
  @takes_params = {}       # 컴포넌트 클래스 -> initialize 가 위치 인자를 받는가
  @hooks = {}              # 컴포넌트 클래스 -> { 훅 이름 => 있음 }
  @type_hooks = {}         # 확장 타입 모듈 -> { 훅 이름 => 있음 }
  @current_font = nil      # 엔진의 비트맵 폰트는 하나뿐이라 지금 준비된 .fnt 경로를 기억한다

  class << self
    # 어떤 훅이 있는지는 respond_to? 로 묻지 않는다. mruby 는 main.rb 의 최상위 def(init, update,
    # render, destroy)를 모든 객체의 private 메서드로 만들어 respond_to? 가 참이 되기 때문이다.
    # 컴포넌트는 클래스의 public 인스턴스 메서드(상속 포함), 확장 타입은 모듈의 singleton 메서드를 본다.
    def hooks_of(klass)
      h = @hooks[klass]
      return h unless h.nil?
      methods = klass.instance_methods
      h = {}
      HOOKS.each { |name| h[name] = methods.include?(name) }
      @hooks[klass] = h
    end

    def type_hooks(mod)
      h = @type_hooks[mod]
      return h unless h.nil?
      methods = mod.singleton_methods
      h = {}
      TYPE_HOOKS.each { |name| h[name] = methods.include?(name) }
      @type_hooks[mod] = h
    end

    # -----------------------------------------------------------------------
    # 도우미
    # -----------------------------------------------------------------------

    def err(message)
      raise Error, "scene: #{message}"
    end

    def deep_copy(v)
      if v.is_a?(Hash)
        out = {}
        v.each { |k, x| out[k] = deep_copy(x) }
        out
      elsif v.is_a?(Array)
        v.map { |x| deep_copy(x) }
      else
        v
      end
    end

    # 프로젝트 루트 기준 상대 경로에 "./" 를 붙인다 (절대 경로와 이미 "./" 인 것은 그대로)
    def resolve_path(p)
      return p if p.start_with?("/") || p.start_with?("./") || (p.size >= 2 && p[1] == ":")
      "./" + p
    end

    # PNG 헤더(IHDR)에서 이미지 크기를 읽는다. 엔진이 텍스처 크기를 스크립트에 주지 않아서다.
    def png_size(path)
      head = nil
      begin
        f = File.open(path, "rb")
        head = f.read(24)
        f.close
      rescue StandardError
        return nil
      end
      return nil if head.nil? || head.bytesize < 24
      return nil unless head.getbyte(0) == 0x89 && head[1, 3] == "PNG"
      w = (head.getbyte(16) << 24) | (head.getbyte(17) << 16) | (head.getbyte(18) << 8) | head.getbyte(19)
      h = (head.getbyte(20) << 24) | (head.getbyte(21) << 16) | (head.getbyte(22) << 8) | head.getbyte(23)
      [w, h]
    end

    # "pipe_spawner" -> "PipeSpawner"
    def camel(name)
      name.split("_").map { |s| s.empty? ? "" : s[0].upcase + s[1..-1] }.join
    end

    # 논리 이름 -> 파일 경로와 클래스 이름
    def component_path(name)
      SCRIPT_ROOT + name + ".rb"
    end

    def component_class_name(name)
      camel(name.split("/").last)
    end

    # "components/flappy/bird" -> "Components::Flappy::Bird"
    def component_class_path(name)
      name.split("/").map { |part| camel(part) }.join("::")
    end

    # 논리 이름 전체의 모듈 경로(Components::Flappy::Bird)에 클래스가 있으면 그것을, 없으면 nil.
    # 한 단계씩 상속을 보지 않고 (const_defined?(이름, false)) 따라간다.
    def nested_component_class(name)
      mod = Object
      name.split("/").each do |part|
        return nil if part.empty? || !mod.is_a?(Module)
        sym = camel(part).to_sym
        begin
          return nil unless mod.const_defined?(sym, false)
        rescue NameError
          return nil
        end
        mod = mod.const_get(sym)
      end
      mod.is_a?(Class) ? mod : nil
    end

    # 컴포넌트 클래스를 찾는다: 모듈 경로가 먼저, 없으면 마지막 조각의 클래스.
    # 없으면 논리 이름과 찾은 경로를 말하며 실패한다.
    def load_component(name)
      klass = @components[name]
      return klass unless klass.nil?
      path = component_path(name)
      err("component '#{name}' not found (#{path})") unless File.exist?(path)
      require path
      klass = nested_component_class(name)
      if klass.nil?
        cname = component_class_name(name)
        unless Object.const_defined?(cname.to_sym)
          full = component_class_path(name)
          names = full == cname ? cname : "#{full} or #{cname}"
          err("component '#{name}' must define class #{names} (#{path})")
        end
        klass = Object.const_get(cname.to_sym)
        err("component '#{name}': #{cname} is not a class (#{path})") unless klass.is_a?(Class)
      end
      @components[name] = klass
      klass
    end

    # 타입 이름을 푼다: 코어 타입이면 :core, 확장 타입이면 모듈, 모르면 nil.
    def resolve_type(type)
      return nil unless type.is_a?(String) && !type.empty?
      return :core if CORE_TYPES.include?(type)
      mod = @registered_types[type] || @loaded_types[type]
      return mod unless mod.nil?
      path = SCRIPT_ROOT + SCENE_TYPES_DIR + type + ".rb"
      return nil unless File.exist?(path)
      require path
      cname = camel(type)
      begin
        mod = SceneTypes.const_get(cname.to_sym)
      rescue NameError
        mod = nil
      end
      unless !mod.nil? && type_hooks(mod)[:create]
        err("scene type '#{type}' must define SceneTypes::#{cname} with create(obj, scene) (#{path})")
      end
      @loaded_types[type] = mod
      mod
    end

    # 확장 타입을 코드로 등록한다 (파일 없이). 테스트와 게임이 쓴다.
    def register_type(type, mod)
      @registered_types[type] = mod
    end

    # 이름이면 resources/scenes/<이름>.json, 경로("/" 가 있거나 .json 으로 끝난다)면 그대로
    def scene_path(name_or_path)
      if name_or_path.include?("/") || name_or_path.end_with?(".json")
        resolve_path(name_or_path)
      else
        resolve_path(SCENE_DIR + name_or_path + ".json")
      end
    end

    # 폰트를 준비한다. 같은 폰트면 다시 읽지 않는다.
    def use_font(path, label)
      return if path == "" || path == @current_font
      err("text '#{label}': cannot load font #{path}") unless Graphics.prepare_font(resolve_path(path))
      @current_font = path
    end

    # -----------------------------------------------------------------------
    # 컴포넌트 매개변수 (params, 계획 문서 5.4절)
    # -----------------------------------------------------------------------

    # JSON 객체인가: Hash, 또는 빈 Array (Lua 의 Json.Load 는 [] 과 {} 를 같은 빈 표로 읽으므로 같게 본다)
    def json_object?(v)
      v.is_a?(Hash) || (v.is_a?(Array) && v.empty?)
    end

    # JSON 배열인가: Array, 또는 빈 Hash
    def json_array?(v)
      v.is_a?(Array) || (v.is_a?(Hash) && v.empty?)
    end

    # 메시지 속의 숫자: 정수 값이면 정수로, 아니면 유효 숫자 14자리
    def num_text(v)
      return v.to_i.to_s if v == v.floor && v.abs < 1e15
      format("%.14g", v)
    end

    # [A-Za-z_][A-Za-z0-9_]*
    def identifier?(s)
      return false unless s.is_a?(String) && !s.empty?
      s.bytes.each_with_index do |b, i|
        letter = (b >= 65 && b <= 90) || (b >= 97 && b <= 122) || b == 95
        digit = b >= 48 && b <= 57
        return false unless letter || (i > 0 && digit)
      end
      true
    end

    # 값 하나가 필드에 맞는지 본다. 맞지 않으면 "must be ..." 꼴의 문장, 맞으면 nil.
    # has_id 를 주면 object 값이 가리키는 id 가 있는지도 본다 (선언의 default 검사는 주지 않는다).
    def check_field_value(field, v, has_id)
      t = field["type"]
      if t == "string" || t == "text"
        return "must be a string" unless v.is_a?(String)
      elsif t == "number" || t == "integer"
        return "must be a number" if t == "number" && !v.is_a?(Numeric)
        return "must be an integer" if t == "integer" && !integer_like?(v)
        min = field["min"]
        max = field["max"]
        return "must be >= #{num_text(min)}" if !min.nil? && v < min
        return "must be <= #{num_text(max)}" if !max.nil? && v > max
      elsif t == "boolean"
        return "must be a boolean" unless v == true || v == false
      elsif t == "enum"
        return nil if v.is_a?(String) && field["values"].include?(v)
        return "must be one of #{field['values'].join(', ')}"
      elsif t == "object"
        return "must be an object id" unless v.is_a?(String) && !v.empty?
        return "names no object '#{v}'" if !has_id.nil? && !has_id.call(v)
      end
      nil
    end

    # 선언 Hash 를 검사한다. 문제가 있으면 문장을, 없으면 nil 을 돌려준다.
    def check_declaration(decl)
      return "not an object" unless json_object?(decl)
      version = decl.is_a?(Hash) ? decl["version"] : nil
      return "unsupported version #{version.nil? ? 'nil' : version} (expected 1)" unless version == 1
      fields = decl["fields"]
      return "fields must be an array" if !fields.nil? && !json_array?(fields)
      seen = {}
      (fields.is_a?(Array) ? fields : []).each_with_index do |f, i|
        return "fields[#{i + 1}] is not an object" unless json_object?(f)
        key = f.is_a?(Hash) ? f["key"] : nil
        return "fields[#{i + 1}] needs a key ([A-Za-z_][A-Za-z0-9_]*)" unless identifier?(key)
        return "duplicate key '#{key}'" if seen.key?(key)
        seen[key] = true
        where = "field '#{key}'"
        type = f["type"]
        return "#{where} needs a type" unless type.is_a?(String)
        return "#{where}: unknown type '#{type}'" unless FIELD_TYPES.include?(type)
        return "#{where}: label must be a string" if !f["label"].nil? && !f["label"].is_a?(String)
        values = f["values"]
        if type == "enum"
          ok = json_array?(values) && !values.empty?
          ok = values.all? { |v| v.is_a?(String) && !v.empty? } if ok
          return "#{where}: values must be a non-empty array of strings" unless ok
        elsif !values.nil?
          return "#{where}: values is only for enum"
        end
        ["min", "max"].each do |bound|
          next if f[bound].nil?
          return "#{where}: #{bound} is only for number and integer" unless type == "number" || type == "integer"
          return "#{where}: #{bound} must be a number" unless f[bound].is_a?(Numeric)
        end
        return "#{where}: min must be <= max" if !f["min"].nil? && !f["max"].nil? && f["min"] > f["max"]
        unless f["default"].nil?
          problem = check_field_value(f, f["default"], nil)
          return "#{where}: default #{problem}" unless problem.nil?
        end
      end
      nil
    end

    # Json.load 의 파싱 오류에서 파서의 설명만 한 줄로 떼어 낸다
    def parse_error_detail(message)
      detail = message
      i = message.index("parse error in ")
      unless i.nil?
        j = message.index(": ", i)
        detail = message[(j + 2)..-1] unless j.nil?
      end
      detail.split(" ").join(" ")
    end

    # 논리 이름 -> 선언 파일 경로 ("components/mover" -> "scripts/components/mover.json")
    def declaration_path(name)
      DECLARATION_ROOT + name + ".json"
    end

    # 선언 파일을 읽어 검사한다. 선언 Hash 를, 파일이 없으면 nil 을 돌려주고 깨졌으면 Error.
    # 통과한 선언과 파일 없음은 기억해 두고 다시 읽지 않는다.
    def load_declaration(name)
      cached = @declarations[name]
      return (cached == false ? nil : cached) unless cached.nil?
      path = declaration_path(name)
      unless File.exist?(resolve_path(path))
        @declarations[name] = false
        return nil
      end
      decl = nil
      begin
        decl = Json.load(resolve_path(path))
      rescue RuntimeError => e
        err("declaration #{path}: not valid JSON (#{parse_error_detail(e.message)})")
      end
      problem = check_declaration(decl)
      err("declaration #{path}: #{problem}") unless problem.nil?
      decl["fields"] = [] unless decl["fields"].is_a?(Array)
      @declarations[name] = decl
      decl
    end

    # 컴포넌트의 선언 (검사를 통과한 Hash 의 복사본). 선언 파일이 없으면 nil, 깨졌으면 Error.
    def declaration(name)
      deep_copy(load_declaration(name))
    end

    # 오브젝트 항목의 params 를 검사한다. 문제가 있으면 Error.
    # has_id.call(id) 는 object 값이 가리킬 수 있는 id 인지 답한다. validate_object 를 통과한 항목에만 부른다.
    def validate_params(spec, has_id)
      label = spec["id"]
      params = spec["params"]
      err("params must be an object (#{label})") if !params.nil? && !json_object?(params)
      decls = {}
      (spec["scripts"] || []).each { |name| decls[name] = load_declaration(name) || false }
      return nil unless params.is_a?(Hash)
      params.keys.sort.each do |name|
        values = params[name]
        next if values.nil?
        err("params '#{name}': not in scripts (#{label})") unless decls.key?(name)
        err("params '#{name}' must be an object (#{label})") unless json_object?(values)
        decl = decls[name]
        next if decl == false || !values.is_a?(Hash)
        values.keys.sort.each do |key|
          v = values[key]
          next if v.nil?
          field = decl["fields"].find { |f| f["key"] == key }
          err("params '#{name}': unknown key '#{key}' (#{label})") if field.nil?
          problem = check_field_value(field, v, has_id)
          err("params '#{name}': #{key} #{problem} (#{label})") unless problem.nil?
        end
      end
      nil
    end

    # 컴포넌트 하나의 params Hash 를 만든다: 선언의 기본값 위에 오브젝트의 params[name] 을 덮는다 (깊은 복사).
    def component_params(name, spec)
      decl = load_declaration(name)
      out = {}
      unless decl.nil?
        decl["fields"].each { |f| out[f["key"]] = deep_copy(f["default"]) unless f["default"].nil? }
      end
      params = spec["params"]
      values = params.is_a?(Hash) ? params[name] : nil
      values.each { |k, v| out[k] = deep_copy(v) unless v.nil? } if values.is_a?(Hash)
      out
    end

    # initialize 가 위치 인자를 하나 이상 받는가 (def initialize(params), (params = {}), (*args)).
    # 정의하지 않은 initialize 는 BasicObject 의 것이고 인자를 받지 않는다.
    def takes_params?(klass)
      cached = @takes_params[klass]
      return cached unless cached.nil?
      kinds = klass.instance_method(:initialize).parameters.map { |p| p[0] }
      @takes_params[klass] = kinds.include?(:req) || kinds.include?(:opt) || kinds.include?(:rest)
    end

    # -----------------------------------------------------------------------
    # 검증 (에디터의 규칙과 같은 목록이어야 한다. 계획 문서 3절). 문제가 있으면 Error.
    # -----------------------------------------------------------------------

    def check_number(v, what, where)
      err("#{what} must be a number (#{where})") if !v.nil? && !v.is_a?(Numeric)
    end

    def integer_like?(v)
      v.is_a?(Integer) || (v.is_a?(Float) && v == v.floor)
    end

    # 오브젝트 항목 하나를 검사한다. ids 는 이미 쓰인 id 의 집합 (중복 검사).
    # allow_no_id 는 spawn 용 (id 자동 생성).
    def validate_object(spec, index, ids, allow_no_id)
      where = "object ##{index}"
      err("#{where} is not an object") unless spec.is_a?(Hash)
      if !spec["id"].nil? || !allow_no_id
        id = spec["id"]
        err("#{where} needs a non-empty string id") unless id.is_a?(String) && !id.empty?
        err("duplicate id '#{id}'") if ids.key?(id)
      end
      label = spec["id"] || where
      type = spec["type"]
      err("object '#{label}' needs a type") unless type.is_a?(String) && !type.empty?
      type_mod = resolve_type(type)
      err("unknown type '#{type}' (object '#{label}')") if type_mod.nil?
      check_number(spec["x"], "x", label)
      check_number(spec["y"], "y", label)
      visible = spec["visible"]
      err("visible must be a boolean (#{label})") if !visible.nil? && visible != true && visible != false
      props = spec["props"]
      err("props must be an object (#{label})") if !props.nil? && !props.is_a?(Hash)
      scripts = spec["scripts"]
      unless scripts.nil?
        err("scripts must be an array (#{label})") unless scripts.is_a?(Array)
        scripts.each_with_index do |s, i|
          err("scripts[#{i + 1}] must be a non-empty string (#{label})") unless s.is_a?(String) && !s.empty?
        end
      end
      p = props || {}
      if type == "sprite"
        image = p["image"]
        err("sprite '#{label}' needs props.image") unless image.is_a?(String) && !image.empty?
        SPRITE_NUMBER_KEYS.each { |k| check_number(p[k], "props.#{k}", label) }
        SPRITE_INTEGER_KEYS.each do |k|
          err("props.#{k} must be an integer (#{label})") if !p[k].nil? && !integer_like?(p[k])
        end
        err("props.frames must be >= 1 (#{label})") if !p["frames"].nil? && p["frames"] < 1
        if (!p["width"].nil? && p["width"] < 0) || (!p["height"].nil? && p["height"] < 0)
          err("props.width/height must be >= 0 (#{label})")
        end
        if (!p["startFrame"].nil? && p["startFrame"] < 0) || (!p["endFrame"].nil? && p["endFrame"] < 0)
          err("props.startFrame/endFrame must be >= 0 (#{label})")
        end
        if !p["opacity"].nil? && (p["opacity"] < 0 || p["opacity"] > 255)
          err("props.opacity must be 0..255 (#{label})")
        end
        loop_v = p["loop"]
        err("props.loop must be a boolean (#{label})") if !loop_v.nil? && loop_v != true && loop_v != false
      elsif type == "text"
        text = p["text"]
        err("props.text must be a string (#{label})") if !text.nil? && !text.is_a?(String) && !text.is_a?(Numeric)
        err("props.font must be a string (#{label})") if !p["font"].nil? && !p["font"].is_a?(String)
        color = p["color"]
        unless color.nil?
          unless color.is_a?(Array) && color.size >= 3 && color.size <= 4
            err("props.color must be [r, g, b] or [r, g, b, a] (#{label})")
          end
          color.each_with_index do |c, i|
            err("props.color[#{i + 1}] must be 0..255 (#{label})") unless c.is_a?(Numeric) && c >= 0 && c <= 255
          end
        end
      elsif type_mod != :core && type_hooks(type_mod)[:validate]
        begin
          type_mod.validate(spec)
        rescue Error => e
          raise Error, "#{e.message} (#{label})"
        end
      end
      nil
    end

    # 씬 Hash 전체를 검사한다. 문제가 있으면 Error, 없으면 true.
    def validate(hash)
      err("not an object") unless hash.is_a?(Hash)
      version = hash["version"]
      unless version == VERSION
        err("unsupported version #{version.nil? ? 'nil' : version} (expected #{VERSION})")
      end
      name = hash["name"]
      err("name must be a string") if !name.nil? && !name.is_a?(String)
      objects = hash["objects"]
      err("objects must be an array") if !objects.nil? && !objects.is_a?(Array)
      ids = {}
      (objects || []).each_with_index do |spec, i|
        validate_object(spec, i + 1, ids, false)
        ids[spec["id"]] = true
      end
      # params 는 id 를 다 모은 뒤에 본다 (object 값이 뒤의 오브젝트를 가리킬 수 있다)
      has_id = lambda { |id| ids.key?(id) }
      (objects || []).each { |spec| validate_params(spec, has_id) }
      true
    end

    # -----------------------------------------------------------------------
    # 열기
    # -----------------------------------------------------------------------

    # 이미 읽은 Hash 에서 씬을 만든다 (검증 -> 오브젝트 생성 -> 컴포넌트 init 순서대로)
    def from_hash(hash, name = nil, path = nil)
      validate(hash)
      scene = Scene.new(hash, name, path)
      scene.build
      scene
    end

    def open(name_or_path)
      err("open needs a scene name or path") unless name_or_path.is_a?(String) && !name_or_path.empty?
      path = scene_path(name_or_path)
      data = nil
      begin
        data = Json.load(path)
      rescue RuntimeError => e
        err("cannot open scene #{path} (#{e.message})")
      end
      from_hash(data, name_or_path, path)
    end
  end

  # 실행 오브젝트. Lua 표처럼 열려 있다 (없는 필드는 nil, 아무 필드나 붙일 수 있다).
  class SceneObject
    attr_accessor :id, :type, :x, :y, :visible, :props, :scripts, :sprite, :scene, :animate, :spec,
                  :texture, :frame_width, :frame_height, :removed, :type_module
    attr_reader :components

    def initialize(spec)
      @id = spec["id"]
      @type = spec["type"]
      @x = spec["x"] || 0
      @y = spec["y"] || 0
      @visible = spec["visible"].nil? ? true : spec["visible"]
      @props = SceneLoader.deep_copy(spec["props"] || {})
      @scripts = (spec["scripts"] || []).dup
      @sprite = nil
      @animate = true
      @spec = spec
      @removed = false
      @type_module = nil
      @components = []
      @fields = {}
      defaults = (@type == "sprite") ? SPRITE_DEFAULTS : ((@type == "text") ? TEXT_DEFAULTS : nil)
      unless defaults.nil?
        defaults.each { |k, v| @props[k] = v if @props[k].nil? }
      end
    end

    def [](key)
      @fields[key]
    end

    def []=(key, value)
      @fields[key] = value
    end

    # 정하지 않은 필드: 쓰면 붙고, 읽으면 nil (Lua 표와 같다)
    def method_missing(name, *args)
      s = name.to_s
      if s.end_with?("=") && args.size == 1
        @fields[s[0..-2].to_sym] = args[0]
      elsif args.empty?
        @fields[name]
      else
        super
      end
    end

    def respond_to_missing?(name, include_private = false)
      true
    end
  end

  class Scene
    attr_reader :name, :path, :state, :source

    def initialize(source, name, path)
      @source = source
      @name = source["name"] || name || "scene"
      @path = path
      @state = {}
      @order = []
      @by_id = {}
      @textures = {}
      @auto_count = 0
      @pending = nil
      @closed = false
    end

    # from_hash 가 부른다: 오브젝트 전부 만든 뒤 컴포넌트 init 을 순서대로
    def build
      (@source["objects"] || []).each do |spec|
        obj = create(spec)
        @order.push(obj)
        @by_id[obj.id] = obj
      end
      objects.each { |obj| init_components(obj) }
    end

    # ---------------------------------------------------------------------
    # 씬 API (컴포넌트가 쓴다)
    # ---------------------------------------------------------------------

    def find(id)
      @by_id[id]
    end

    # 그리기 순서대로의 오브젝트 목록 (복사본)
    def objects
      @order.dup
    end

    def closed?
      @closed
    end

    # spec 은 파일의 오브젝트 항목과 같은 Hash(문자열 키)다. id 가 없으면 만들어 준다.
    # after_id 를 주면 그 오브젝트 바로 뒤(그리기 순서)에 끼우고, 없으면 맨 뒤에 붙인다.
    # 만든 오브젝트의 컴포넌트 init 은 바로 불리고, update 는 다음 틱부터 불린다.
    def spawn(spec, after_id = nil)
      SceneLoader.err("scene '#{@name}' is closed") if @closed
      SceneLoader.err("spawn needs an object spec") unless spec.is_a?(Hash)
      if spec["id"].nil?
        spec = SceneLoader.deep_copy(spec)
        spec["id"] = auto_id(spec["type"])
      end
      SceneLoader.validate_object(spec, "spawn", @by_id, false)
      SceneLoader.validate_params(spec, lambda { |id| id == spec["id"] || @by_id.key?(id) })
      pos = @order.size
      unless after_id.nil?
        anchor = @by_id[after_id]
        SceneLoader.err("spawn: no object '#{after_id}' to insert after") if anchor.nil?
        pos = @order.index(anchor) + 1
      end
      obj = create(spec)
      @order.insert(pos, obj)
      @by_id[obj.id] = obj
      init_components(obj)
      obj
    end

    # 오브젝트를 없앤다 (컴포넌트 destroy, 스프라이트 해제). 없던 id 면 false.
    def remove(id)
      obj = @by_id[id]
      return false if obj.nil?
      destroy_object(obj)
      @by_id.delete(id)
      i = @order.index(obj)
      @order.delete_at(i) unless i.nil?
      true
    end

    # 다음 tick 에서 이 씬을 닫고 resources/scenes/<name>.json 을 연다 (경로도 된다)
    def switch(name)
      @pending = name
    end

    # 한 틱: 컴포넌트 update -> 스프라이트에 값 반영 -> 예약된 전환. 다음 프레임에 쓸 씬을 돌려준다.
    def tick(elapsed)
      SceneLoader.err("scene '#{@name}' is closed") if @closed
      objects.each do |obj|   # update 도중의 spawn, remove 가 순회를 흔들지 않게 복사본을 돈다
        next if obj.removed
        obj.components.each { |c| c.update(obj, self, elapsed) if SceneLoader.hooks_of(c.class)[:update] }
        tm = obj.type_module
        tm.update(obj, self, elapsed) if !tm.nil? && SceneLoader.type_hooks(tm)[:update]
      end
      @order.each { |obj| commit_sprite(obj, elapsed) unless obj.sprite.nil? }
      unless @pending.nil?
        target = @pending
        @pending = nil
        close
        return SceneLoader.open(target)
      end
      self
    end

    # 그리기: 확장 타입의 아래 층 -> 오브젝트 순서대로 (스프라이트, 글자, 컴포넌트 render) -> 위 층
    def draw
      return if @closed
      @order.each do |obj|
        tm = obj.type_module
        tm.draw_below(obj, self) if obj.visible && !tm.nil? && SceneLoader.type_hooks(tm)[:draw_below]
      end
      @order.each do |obj|
        next unless obj.visible
        tm = obj.type_module
        if !obj.sprite.nil?
          obj.sprite.draw
        elsif obj.type == "text"
          draw_text(obj)
        elsif !tm.nil? && SceneLoader.type_hooks(tm)[:draw]
          tm.draw(obj, self)
        end
        obj.components.each { |c| c.render(obj, self) if SceneLoader.hooks_of(c.class)[:render] }
      end
      @order.each do |obj|
        tm = obj.type_module
        tm.draw_above(obj, self) if obj.visible && !tm.nil? && SceneLoader.type_hooks(tm)[:draw_above]
      end
    end

    # 씬을 닫는다: 컴포넌트 destroy, 스프라이트와 텍스처, 확장 타입 자원 해제
    def close
      return if @closed
      @order.each { |obj| destroy_object(obj) }
      @textures.each_key { |path| TextureManager.remove(path) }
      @textures = {}
      @order = []
      @by_id = {}
      @closed = true
    end

    # ---------------------------------------------------------------------
    # 내부
    # ---------------------------------------------------------------------

    def auto_id(type)
      loop do
        @auto_count += 1
        id = "#{type || 'object'}_#{@auto_count}"
        return id if @by_id[id].nil?
      end
    end

    # 텍스처는 이미지 경로를 id 로 삼아 씬 안에서 참조 수를 센다 (같은 그림은 한 번만 읽는다)
    def acquire_texture(path)
      count = @textures[path]
      if count.nil?
        SceneLoader.err("cannot load image #{path}") unless TextureManager.load(path, path)
        count = 0
      end
      @textures[path] = count + 1
      path
    end

    def release_texture(path)
      count = @textures[path]
      return if count.nil?
      if count <= 1
        TextureManager.remove(path)
        @textures.delete(path)
      else
        @textures[path] = count - 1
      end
    end

    # sprite props -> 엔진 Sprite API. 대응은 계획 문서 4절에 적혀 있다.
    def create_sprite(obj)
      p = obj.props
      path = SceneLoader.resolve_path(p["image"])
      tex_id = acquire_texture(path)
      frames = [1, p["frames"].floor].max
      w = p["width"].floor
      h = p["height"].floor
      if w == 0 || h == 0
        size = SceneLoader.png_size(path)
        SceneLoader.err("sprite '#{obj.id}': cannot read the size of #{p['image']}") if size.nil?
        w = size[0] / frames if w == 0   # 0 은 이미지 폭을 frames 로 나눈 것
        h = size[1] if h == 0            # 0 은 이미지 높이 전체
      end
      sprite = Sprite.new(obj.x, obj.y, w, h, frames, tex_id)
      sprite.set_sheet_grid(frames, 1)       # 시트는 가로 한 줄이다
      first = p["startFrame"].floor
      last = p["endFrame"].floor
      last = first if last <= 0 || last < first   # endFrame 0 은 한 프레임
      sprite.set_frames(first, last + 1)     # 엔진의 둘째 인자는 끝의 다음이다
      sprite.current_frame = first
      sprite.frame_delay = p["frameDelay"].to_f
      sprite.loop = p["loop"] ? true : false
      sprite.scale = p["scale"].to_f
      sprite.angle = p["angle"].to_f
      sprite.opacity = p["opacity"].floor
      sprite.visible = obj.visible ? true : false
      obj.sprite = sprite
      obj.texture = tex_id
      obj.frame_width = w
      obj.frame_height = h
    end

    def create(spec)
      obj = SceneObject.new(spec)
      obj.scene = self
      if obj.type == "sprite"
        create_sprite(obj)
      elsif obj.type == "text"
        SceneLoader.use_font(obj.props["font"], obj.id)
      elsif obj.type != "node"
        obj.type_module = SceneLoader.resolve_type(obj.type)
        obj.type_module.create(obj, self)
      end
      obj.scripts.each do |name|
        klass = SceneLoader.load_component(name)
        params = SceneLoader.component_params(name, spec)
        obj.components.push(SceneLoader.takes_params?(klass) ? klass.new(params) : klass.new)
      end
      obj
    end

    def init_components(obj)
      obj.components.each { |c| c.init(obj, self) if SceneLoader.hooks_of(c.class)[:init] }
    end

    def destroy_object(obj)
      obj.components.each { |c| c.destroy(obj, self) if SceneLoader.hooks_of(c.class)[:destroy] }
      tm = obj.type_module
      tm.destroy(obj, self) if !tm.nil? && SceneLoader.type_hooks(tm)[:destroy]
      unless obj.sprite.nil?
        obj.sprite.dispose unless obj.sprite.disposed?
        obj.sprite = nil
        release_texture(obj.texture)
      end
      obj.removed = true
    end

    # 매 틱 오브젝트의 값을 스프라이트에 옮기고 애니메이션을 진행한다
    def commit_sprite(obj, elapsed)
      s = obj.sprite
      p = obj.props
      s.set_position(obj.x, obj.y)
      s.visible = obj.visible ? true : false
      opacity = (p["opacity"] || 255).floor
      opacity = 0 if opacity < 0
      opacity = 255 if opacity > 255
      s.opacity = opacity
      s.scale = (p["scale"] || 1).to_f
      s.angle = (p["angle"] || 0).to_f
      s.update(obj.animate == false ? 0 : elapsed)
    end

    def draw_text(obj)
      p = obj.props
      SceneLoader.use_font(p["font"], obj.id)
      # 줄바꿈은 엔진의 draw_text 가 처리한다 ("\n" 마다 x 로 돌아가 lineHeight 만큼 내려간다).
      # props["color"] 는 보존만 한다. 엔진의 비트맵 폰트 API 에 색 인자가 없다 (계획 문서 4절).
      Graphics.draw_text(obj.x, obj.y, p["text"].to_s)
    end
  end
end
