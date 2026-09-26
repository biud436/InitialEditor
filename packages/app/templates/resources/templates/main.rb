# scripts/ruby/main.rb 템플릿 (에디터가 새 프로젝트에 복사한다). R1, docs/plans/r1-scene-loader.md
#
# 씬 파일(resources/scenes/<이름>.json)을 씬 로더가 읽어 오브젝트를 만들고, 오브젝트에 붙은
# 컴포넌트(scripts/ruby/components/...)가 움직인다. 이 파일은 그 둘을 잇는 것이 전부다.
# Lua 판(main.lua)과 같은 흐름이다. 엔진이 mruby 를 고르게 하려면 game.json 에 "script": "mruby"
# 를 두거나 INITIAL2D_SCRIPT=mruby 로 실행한다 (scripts/lua/main.lua 가 있으면 언제나 Lua 다).
#
#   INITIAL2D_SCENE=<이름> ./Initial2D     이 씬부터 연다 (에디터의 "현재 씬부터 실행")
#   없으면 game.json 의 "startScene", 그것도 없으면 "main"

require "scripts/ruby/scene_loader"

$scene = nil

def init
  game = begin
    Json.load("./game.json")
  rescue RuntimeError
    nil
  end
  game = {} unless game.is_a?(Hash)
  $scene = SceneLoader.open(System.env("INITIAL2D_SCENE") || game["startScene"] || "main")
end

def update(elapsed)
  $scene = $scene.tick(elapsed) # scene.switch 가 예약돼 있으면 새 씬이 돌아온다
end

def render
  $scene.draw
end

def destroy
  $scene.close
end
