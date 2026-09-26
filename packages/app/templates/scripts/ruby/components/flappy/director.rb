# components/flappy/director.rb : 상태 기계(:ready -> :play -> :dead -> :ready), 자동 시연, 화면 글자
#
# scripts/lua/components/flappy/director.lua 에 대응한다.
# 조작: 마우스 클릭/터치 또는 스페이스 바로 날갯짓. 게임 오버 화면에서 화면 상단(1/3)을
# 누르면 게임을 끝낸다. ESC(Android 뒤로가기)는 언제나 종료.
# 자동 시연(INITIAL2D_AUTOPLAY)이면 상태 전이와 점수를 stdout 에 알리고 TICK_BUDGET 틱에
# 스스로 끝낸다 (tests/run_engine_tests.py 가 읽는 형식이다):
#   flappy:state:<상태>, flappy:score:<점수>, flappyFinal state=... score=... best=... ticks=...
# 화면 글자는 씬의 text 오브젝트(title, best, score, over, result, hint1, hint2)를 켜고 끈다.

require "scripts/ruby/components/flappy/common"

class Director
  C = FlappyCommon
  TEXT_IDS = ["title", "best", "score", "over", "result", "hint1", "hint2"]

  def init(obj, scene)
    st = C.state(scene)
    st[:state] = :ready
    st[:ticks] = 0
    st[:last_state] = nil
    st[:last_score] = nil
    st[:texts] = {}
    TEXT_IDS.each { |id| st[:texts][id] = scene.find(id) }
    update_hud(st)
  end

  def show(o, on, text = nil)
    return if o.nil?
    o.visible = on
    o.props["text"] = text unless text.nil?
  end

  def update_hud(st)
    t = st[:texts]
    state = st[:state]
    show(t["title"], state == :ready)
    show(t["best"], state == :ready, "최고 점수 #{st[:best]}")
    show(t["score"], state == :play, "점수 #{st[:score]}")
    show(t["over"], state == :dead)
    show(t["result"], state == :dead, "점수 #{st[:score]}  최고 #{st[:best]}")
    show(t["hint1"], state == :dead && st[:dead_time] > 0.6)
    show(t["hint2"], state == :dead && st[:dead_time] > 0.6)
  end

  def update(obj, scene, elapsed)
    st = C.state(scene)
    dt = C.dt(elapsed)

    # ESC (Android 뒤로가기): 어느 상태에서든 게임 종료
    if Input.key_down?(:escape)
      System.exit
      return
    end

    case st[:state]
    when :ready
      st[:ready_time] += dt
      if C.flap_pressed?(st) || (st[:autoplay] && st[:ready_time] > 1.0)
        st[:state] = :play
        st[:bird_vy] = C::FLAP
        C.sfx("flap")
      end
    when :dead
      st[:dead_time] += dt
      if st[:dead_time] > 0.6 && !st[:autoplay] && Input.mouse_down?(:left) && Input.mouse_y < st[:h] / 3.0
        System.exit # 화면 상단 터치: 종료
      elsif (st[:dead_time] > 0.6 && C.flap_pressed?(st)) || (st[:autoplay] && st[:dead_time] > 1.5)
        st[:state] = :ready
        C.reset_game(st)
      end
    end

    st[:ticks] += 1
    if st[:state] != st[:last_state]
      st[:last_state] = st[:state]
      puts "flappy:state:#{st[:state]}"
    end
    if st[:score] != st[:last_score]
      st[:last_score] = st[:score]
      puts "flappy:score:#{st[:score]}"
    end
    if st[:autoplay] && st[:ticks] >= C::TICK_BUDGET
      puts "flappyFinal state=#{st[:state]} score=#{st[:score]} best=#{st[:best]} ticks=#{st[:ticks]}"
      System.exit
    end

    update_hud(st)
  end
end
