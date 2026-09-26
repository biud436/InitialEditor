# scene_types/tilemap.rb : 씬 포맷 v1 의 확장 타입 "tilemap", Ruby 판 (R1, docs/plans/r1-scene-loader.md)
#
# scripts/lua/scene_types/tilemap.lua 에 대응한다. 씬 로더가 모르는 타입을 만나면
# scripts/ruby/scene_types/<타입>.rb 를 require 하고 SceneTypes::<CamelCase> 를 찾는다.
# 확장 타입 모듈의 표면 (create 만 필수):
#   validate(spec)              타입 고유 props 검사 (문제가 있으면 SceneLoader::Error)
#   create(obj, scene)          엔진 자원을 만든다
#   update(obj, scene, elapsed)
#   draw_below(obj, scene)      오브젝트들보다 먼저 그린다
#   draw(obj, scene)            오브젝트 순서 자리에서 그린다
#   draw_above(obj, scene)      오브젝트들 뒤에 그린다
#   destroy(obj, scene)         자원을 놓는다
#
# props: map (엔진 맵 포맷 v2 경로), groundLayers (스프라이트 아래에 그리는 레이어 수, 기본 1).
# 나머지 레이어는 오브젝트들 위에 그린다. obj.x, obj.y 는 맵의 화면 위치다 (카메라의 반대 부호).
# Ruby 의 Tilemap#draw 는 레이어 0 기준이다 (Lua 는 1 기준).

module SceneTypes
  module Tilemap
    class << self
      def validate(spec)
        p = spec["props"] || {}
        map = p["map"]
        SceneLoader.err("tilemap needs props.map") unless map.is_a?(String) && !map.empty?
        g = p["groundLayers"]
        if !g.nil? && (!g.is_a?(Numeric) || g < 0)
          SceneLoader.err("tilemap props.groundLayers must be a number >= 0")
        end
        true
      end

      def create(obj, scene)
        p = obj.props
        p["groundLayers"] = 1 if p["groundLayers"].nil?
        map = nil
        begin
          map = ::Tilemap.new(SceneLoader.resolve_path(p["map"]))
        rescue RuntimeError => e
          SceneLoader.err("tilemap '#{obj.id}': cannot load #{p['map']} (#{e.message})")
        end
        obj.tilemap = map
        obj.map_width = map.width
        obj.map_height = map.height
        obj.tile_width = map.tile_width
        obj.tile_height = map.tile_height
        obj.layer_count = map.layer_count
      end

      def ground_layers(obj)
        [(obj.props["groundLayers"] || 1).floor, obj.layer_count].min
      end

      def draw_below(obj, scene)
        ground = ground_layers(obj)
        obj.tilemap.draw(0, ground - 1, -obj.x.floor, -obj.y.floor) if ground >= 1
      end

      def draw_above(obj, scene)
        ground = ground_layers(obj)
        obj.tilemap.draw(ground, obj.layer_count - 1, -obj.x.floor, -obj.y.floor) if ground < obj.layer_count
      end

      def destroy(obj, scene)
        map = obj.tilemap
        map.dispose if !map.nil? && !map.disposed?
        obj.tilemap = nil
      end
    end
  end
end
