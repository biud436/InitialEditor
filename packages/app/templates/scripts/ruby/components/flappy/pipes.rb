# components/flappy/pipes.rb : 파이프 3쌍을 spawn 으로 만들고 흘리고 되돌리고 점수를 센다
#
# scripts/lua/components/flappy/pipes.lua 에 대응한다. node 오브젝트에 붙는다. 파이프 스프라이트는
# props["after"] 가 가리키는 오브젝트 바로 뒤에 끼워 배경 위, 지면과 새 아래에 그려지게 한다
# (spawn 의 둘째 인자). 이 컴포넌트가 씬에서 새보다 뒤에 놓여 있으면 원래 게임과 같은 순서
# (새 물리 -> 파이프 이동과 충돌)로 돈다.

require "scripts/ruby/components/flappy/common"

class Pipes
  C = FlappyCommon
  PIPE_IMAGE = "resources/object_52x271.png"

  def init(obj, scene)
    st = C.state(scene)
    C.seed(st)
    st[:pipes] = []
    after = obj.props["after"]
    (1..3).each do |i|
      # 위 파이프는 180도 회전 (원점 회전이므로 place_pipes 가 위치를 보정한다)
      top = scene.spawn({
        "id" => "pipe_top_#{i}", "type" => "sprite",
        "props" => { "image" => PIPE_IMAGE, "width" => C::PIPE_W, "height" => C::PIPE_H, "angle" => 180 },
      }, after)
      bottom = scene.spawn({
        "id" => "pipe_bottom_#{i}", "type" => "sprite",
        "props" => { "image" => PIPE_IMAGE, "width" => C::PIPE_W, "height" => C::PIPE_H },
      }, after)
      st[:pipes].push({ x: 0.0, gap_y: 0, top: top, bottom: bottom, passed: false })
    end
    C.reset_pipes(st)
  end

  def update(obj, scene, elapsed)
    st = C.state(scene)
    if st[:state] == :play
      dt = C.dt(elapsed)
      st[:pipes].each do |p|
        p[:x] -= C.speed(st) * dt

        if p[:x] + C::PIPE_W < 0
          p[:x] += st[:pipes].size * C::PIPE_SPACING
          p[:gap_y] = C.random_gap(st)
          p[:passed] = false
        end

        if !p[:passed] && p[:x] + C::PIPE_W < C::BIRD_X
          p[:passed] = true
          st[:score] += 1
          C.sfx("point")
        end

        C.die(st) if !st[:bird].nil? && C.hit_pipe?(st, p)
      end
    end
    C.place_pipes(st)
  end
end
