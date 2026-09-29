# 그래프에서 만든 파일: scripts/components/graphtest/sampler.graph.json (이 파일이 아니라 그래프를 편집합니다)

module Components
  module Graphtest
    class Sampler
      def initialize(params = {})
        @params = params
      end

      def init(obj, scene)
        st = scene.state
        st[:ticks] = 0 if st[:ticks].nil?
        st[:phase] = :start if st[:phase].nil?
        acc = 0
        puts("label=#{@params["label"]}")
        puts("count=#{@params["count"]}")
        case @params["mode"]
        when "a"
          puts("mode a")
        when "b"
          puts("mode b")
        end
        @params["count"].times do |_i_loop|
          acc = acc + _i_loop
        end
        puts("acc=#{acc}")
        half = 7.0 / 2.0
        puts("half=#{half}")
        puts("div=#{@params["count"] / 2.0}")
        puts("div2=#{@params["count"].to_f / 2.5.floor}")
        puts("mod=#{-7 % 3}")
        puts("floor=#{(-2.5).floor}")
        puts("abs=#{(-4).abs}")
        puts("clamp=#{[0, [10, 15].min].max}")
        puts("minmax=#{[3, 1.5].min}#{[2, 7].max}")
        puts("sqrt=#{Math.sqrt(16)}")
        puts("trig=#{Math.sin(0) + Math.cos(0)}")
        puts("and=#{3 > 2 && !(1 == 2)}")
        puts("or=#{5 < 4 || false}")
        puts("cmp=#{2 <= 2}#{1 >= 2}#{"x" != "y"}")
        obj.x = 12.5
        puts("x=#{obj.x}")
        obj.props["hp"] = 5
        puts("hp+1=#{obj.props["hp"] + 1}")
        puts("other=#{scene.find("other").id}")
        scene.find("other").y = 40.0
        puts("otherY=#{scene.find("other").y}")
        case obj.id
        when "sampler"
          puts("id sampler")
        else
          puts("id other")
        end
        puts("width>0=#{Graphics.width > 0}")
        puts("input=#{Input.key_press?(:space) || Input.mouse_down?(:left)}")
        puts("phase=#{st[:phase]}")
        puts("start?=#{st[:phase] == :start}")
        puts("rnd=#{4 + rand(4 - 4 + 1)}")
        puts("rnd01<1=#{rand < 1}")
        puts("quote\" hash\# brace\#{x} back\\slash")
      end

      def update(obj, scene, elapsed)
        st = scene.state
        st[:ticks] = st[:ticks] + 1
        case st[:ticks]
        when 1
          puts("tick one")
          st[:phase] = :run
        when 2
          puts("tick two")
        when 3
          puts("tick three elapsed>0=#{elapsed > 0}")
          st[:phase] = :done
          System.exit
        end
        case st[:phase]
        when :run
          puts("phase run")
        when :done
          puts("phase done")
        else
          puts("phase other")
        end
      end
    end
  end
end
