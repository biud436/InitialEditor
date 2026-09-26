# components/flappy/common.rb : 플래피 컴포넌트들이 나눠 쓰는 상수와 도우미 (컴포넌트가 아니다)
#
# scripts/lua/components/flappy/common.lua 에 대응한다. scripts/ruby/games/flappy.rb 의 상수와
# 규칙을 그대로 가져왔다. 상태는 scene.state[:flappy] 한 Hash 에 모아 두고 Bird, Pipes,
# Scroller, Director 컴포넌트가 함께 읽고 쓴다.
# 자동 시연(INITIAL2D_AUTOPLAY)이면 난수 씨앗을 INITIAL2D_FLAPPY_SEED(기본 1)로 고정해
# 매번 같은 판이 된다 (물리는 고정 스텝이다).

module FlappyCommon
  # 튜닝 상수 (px/초)
  GRAVITY      = 1500.0   # 중력 가속도
  FLAP         = -480.0   # 날갯짓 순간 속도
  MAX_FALL     = 820.0    # 최대 낙하 속도
  BASE_SPEED   = 210.0    # 파이프와 지면 기본 속도
  SCROLL       = 30.0     # 배경(원경) 스크롤 속도
  BASE_GAP     = 280      # 파이프 상하 간격(시작값)
  MIN_GAP      = 195      # 파이프 간격 하한
  PIPE_SPACING = 340      # 파이프 수평 간격
  PIPE_W       = 52
  PIPE_H       = 271
  GROUND_H     = 64
  BIRD_X       = 170
  BIRD_W       = 92
  BIRD_H       = 64
  TICK_BUDGET  = 900      # 자동 시연이 스스로 끝내는 틱 수 (60Hz 기준 15초)

  @seeded = false

  class << self
    # scene.state[:flappy] 를 (없으면 만들어) 돌려준다
    def state(scene)
      st = scene.state[:flappy]
      if st.nil?
        st = {
          state: :ready,
          score: 0,
          best: 0,
          ready_time: 0.0,
          dead_time: 0.0,
          bird_vy: 0.0,
          bird_angle: 0.0,
          pipes: [],
          ticks: 0,
          w: Graphics.width,
          h: Graphics.height,
          autoplay: !System.env("INITIAL2D_AUTOPLAY").nil?,
          bird: nil,
          texts: {},
          last_state: nil,
          last_score: nil,
        }
        st[:ground_y] = st[:h] - GROUND_H + 12   # 충돌 기준(잔디 약간 아래)
        scene.state[:flappy] = st
      end
      st
    end

    def dt(elapsed)
      [elapsed, 50].min / 1000.0   # 스파이크 방어
    end

    def speed(st)
      [BASE_SPEED + st[:score] * 3.0, 320.0].min
    end

    def gap(st)
      [BASE_GAP - st[:score] * 4, MIN_GAP].max
    end

    def sfx(name)
      # loop 에 숫자를 주면 추가 반복 횟수다 (1 = 2회 연속 재생).
      # 효과음 파일이 절반 길이로 만들어져 있어 2회 재생이 정상 길이가 된다.
      Audio.play_sound("./resources/audio/#{name}.wav", name, 1)
    end

    def flap_pressed?(st)
      return false if st[:autoplay] # 자동 시연은 별도 로직에서 처리
      Input.mouse_down?(:left) || Input.key_down?(:space)
    end

    def random_gap(st)
      # Lua 의 math.random(0, n) 은 양 끝을 포함한다
      200 + rand([1, (st[:h] - GROUND_H - gap(st) - 340).floor].max + 1)
    end

    # 난수 씨앗은 한 번만 (자동 시연이면 고정, 아니면 mruby 의 기본 씨앗)
    def seed(st)
      return if @seeded
      @seeded = true
      srand(Integer(System.env("INITIAL2D_FLAPPY_SEED") || 1)) if st[:autoplay]
    end

    # 파이프 자료(x, gap_y)를 스프라이트 위치에 옮긴다
    def place_pipes(st)
      st[:pipes].each do |p|
        # 위 파이프는 180도 원점 회전이라 (x+W, gap_y)에 놓아야 (x, gap_y-H)에 그려진다
        p[:top].x = p[:x] + PIPE_W
        p[:top].y = p[:gap_y]
        p[:bottom].x = p[:x]
        p[:bottom].y = p[:gap_y] + gap(st)
      end
    end

    def reset_pipes(st)
      st[:pipes].each_with_index do |p, i|
        p[:x] = (st[:w] + 160 + i * PIPE_SPACING).to_f
        p[:gap_y] = random_gap(st)
        p[:passed] = false
      end
      place_pipes(st)
    end

    def reset_game(st)
      st[:bird].y = st[:h] / 2.0 - BIRD_H / 2.0 unless st[:bird].nil?
      st[:bird_vy] = 0.0
      st[:bird_angle] = 0.0
      st[:score] = 0
      st[:ready_time] = 0.0
      reset_pipes(st)
    end

    def bird_rect(st)
      # 충돌 판정은 그림보다 약간 작게
      y = st[:bird].nil? ? 0 : st[:bird].y
      [BIRD_X + 12, y + 10, BIRD_X + BIRD_W - 16, y + BIRD_H - 10]
    end

    def overlap?(l1, t1, r1, b1, l2, t2, r2, b2)
      l1 < r2 && r1 > l2 && t1 < b2 && b1 > t2
    end

    def hit_pipe?(st, p)
      left, top, right, bottom = bird_rect(st)
      # 위 파이프: (x, gap_y-PIPE_H)..(x+PIPE_W, gap_y)
      return true if overlap?(left, top, right, bottom, p[:x], p[:gap_y] - PIPE_H, p[:x] + PIPE_W, p[:gap_y])
      # 아래 파이프: (x, gap_y+gap)..(x+PIPE_W, gap_y+gap+PIPE_H)
      g = gap(st)
      overlap?(left, top, right, bottom, p[:x], p[:gap_y] + g, p[:x] + PIPE_W, p[:gap_y] + g + PIPE_H)
    end

    def die(st)
      st[:state] = :dead
      st[:dead_time] = 0.0
      st[:best] = st[:score] if st[:score] > st[:best]
      sfx("hit")
    end
  end
end
