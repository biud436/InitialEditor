# components/flappy/bird.rb : 새의 물리 (대기 부유, 플레이 중력과 날갯짓, 게임 오버 추락)
#
# scripts/lua/components/flappy/bird.lua 에 대응한다. 상태 전이는 Director 가 정하고,
# 이 컴포넌트는 st[:state] 를 읽어 새를 움직인다. 위치는 obj.y 에, 속도와 기울기는 scene.state 에 둔다.

require "scripts/ruby/components/flappy/common"

class Bird
  C = FlappyCommon

  def init(obj, scene)
    st = C.state(scene)
    st[:bird] = obj
    obj.x = C::BIRD_X
    obj.y = st[:h] / 2.0 - C::BIRD_H / 2.0
  end

  def update(obj, scene, elapsed)
    st = C.state(scene)
    dt = C.dt(elapsed)

    case st[:state]
    when :ready
      # 대기 중엔 새가 상하로 부유
      obj.y = (st[:h] / 2.0 - C::BIRD_H / 2.0) + Math.sin(st[:ready_time] * 4.0) * 14.0
      st[:bird_angle] = Math.sin(st[:ready_time] * 4.0) * 6.0
    when :play
      st[:bird_vy] += C::GRAVITY * dt
      st[:bird_vy] = C::MAX_FALL if st[:bird_vy] > C::MAX_FALL
      obj.y = obj.y + st[:bird_vy] * dt

      if obj.y < 0
        obj.y = 0.0
        st[:bird_vy] = 0.0
      end

      # 날갯짓
      if C.flap_pressed?(st)
        st[:bird_vy] = C::FLAP
        C.sfx("flap")
      end
      if st[:autoplay] && st[:bird_vy] > 0 && obj.y > st[:h] * 0.5
        st[:bird_vy] = C::FLAP # 자동 시연: 일정 높이 아래로 떨어지면 날갯짓
      end

      # 속도에 따른 기울기 (상승 시 -22도, 낙하 시 최대 60도)
      st[:bird_angle] = [-22.0, [60.0, st[:bird_vy] * 0.075].min].max

      # 지면 충돌
      if obj.y + C::BIRD_H >= st[:ground_y]
        obj.y = (st[:ground_y] - C::BIRD_H).to_f
        C.die(st)
      end
    when :dead
      # 게임 오버 후 새는 고꾸라지며 지면까지 낙하
      if obj.y + C::BIRD_H < st[:ground_y]
        st[:bird_vy] += C::GRAVITY * dt
        obj.y = obj.y + st[:bird_vy] * dt
        st[:bird_angle] = [90.0, st[:bird_angle] + 220.0 * dt].min
        obj.y = (st[:ground_y] - C::BIRD_H).to_f if obj.y + C::BIRD_H > st[:ground_y]
      end
    end

    obj.props["angle"] = st[:bird_angle]
    obj.animate = (st[:state] != :dead)   # 게임 오버에는 날갯짓 애니메이션을 멈춘다
  end
end
