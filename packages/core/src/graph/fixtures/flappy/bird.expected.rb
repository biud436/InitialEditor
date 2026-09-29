# 그래프에서 만든 파일: scripts/components/flappy/bird.graph.json (이 파일이 아니라 그래프를 편집합니다)
require "scripts/ruby/components/flappy/common"

module Components
  module Flappy
    class Bird
      def init(obj, scene)
        st = FlappyCommon.state(scene)
        st[:bird] = obj
        obj.x = FlappyCommon::BIRD_X
        obj.y = st[:h] / 2.0 - FlappyCommon::BIRD_H / 2.0
      end

      def update(obj, scene, elapsed)
        st = FlappyCommon.state(scene)
        dt = FlappyCommon.dt(elapsed)
        case st[:state]
        when :ready
          obj.y = st[:h] / 2.0 - FlappyCommon::BIRD_H / 2.0 + Math.sin(st[:ready_time] * 4) * 14
          st[:bird_angle] = Math.sin(st[:ready_time] * 4) * 6
        when :play
          st[:bird_vy] = st[:bird_vy] + FlappyCommon::GRAVITY * dt
          if st[:bird_vy] > FlappyCommon::MAX_FALL
            st[:bird_vy] = FlappyCommon::MAX_FALL
          end
          obj.y = obj.y + st[:bird_vy] * dt
          if obj.y < 0
            obj.y = 0.0
            st[:bird_vy] = 0.0
          end
          if FlappyCommon.flap_pressed?(st)
            st[:bird_vy] = FlappyCommon::FLAP
            FlappyCommon.sfx("flap")
          end
          if st[:autoplay] && st[:bird_vy] > 0 && obj.y > st[:h] * 0.5
            st[:bird_vy] = FlappyCommon::FLAP
          end
          st[:bird_angle] = [-22, [60, st[:bird_vy] * 0.075].min].max
          if obj.y + FlappyCommon::BIRD_H >= st[:ground_y]
            obj.y = st[:ground_y] - FlappyCommon::BIRD_H
            FlappyCommon.die(st)
          end
        when :dead
          if obj.y + FlappyCommon::BIRD_H < st[:ground_y]
            st[:bird_vy] = st[:bird_vy] + FlappyCommon::GRAVITY * dt
            obj.y = obj.y + st[:bird_vy] * dt
            st[:bird_angle] = [90, st[:bird_angle] + 220 * dt].min
            if obj.y + FlappyCommon::BIRD_H > st[:ground_y]
              obj.y = st[:ground_y] - FlappyCommon::BIRD_H
            end
          end
        end
        obj.props["angle"] = st[:bird_angle]
        obj.animate = st[:state] != :dead
      end
    end
  end
end
