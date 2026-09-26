# components/flappy/scroller.rb : 이어붙인 두 장을 왼쪽으로 흘리는 컴포넌트 (배경과 지면)
#
# scripts/lua/components/flappy/scroller.lua 에 대응한다. props["kind"] 가 "background" 면
# 원경 속도(SCROLL)로 항상, "ground" 면 파이프와 같은 속도로 (게임 오버에는 멈춘다).
# 두 장은 x 가 0 과 W 에서 시작해 -W 에 닿으면 2W 만큼 되돌아간다.

require "scripts/ruby/components/flappy/common"

class Scroller
  C = FlappyCommon

  def update(obj, scene, elapsed)
    st = C.state(scene)
    dt = C.dt(elapsed)
    if obj.props["kind"] == "background"
      obj.x = obj.x - C::SCROLL * dt
    elsif st[:state] != :dead
      ground_speed = st[:state] == :play ? C.speed(st) : C::BASE_SPEED * 0.4
      obj.x = obj.x - ground_speed * dt
    end
    obj.x = obj.x + st[:w] * 2 if obj.x <= -st[:w]
  end
end
