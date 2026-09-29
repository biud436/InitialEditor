import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateComponent, generatedFrom, GraphCodegenError } from "./codegen";
import { compileGraph } from "./compile";
import type { GraphFile, GraphNode } from "./format";
import { validateGraph } from "./validate";

const FIXTURES = join(__dirname, "fixtures");
const read = (...p: string[]) => readFileSync(join(FIXTURES, ...p), "utf8");

async function compileFixture(dir: string, name: string, path: string, libs: Record<string, string> = {}) {
  return compileGraph(path, read(dir, `${name}.graph.json`), async (p) => (libs[p] ? read(...libs[p].split("/")) : null));
}

function graph(nodes: GraphNode[], extra: Partial<GraphFile> = {}): GraphFile {
  return { version: 1, uses: [], params: null, state: null, locals: [], nodes, layout: {}, ...extra };
}

function gen(g: GraphFile) {
  return generateComponent(validateGraph(g, { libraries: new Map() }), "components/test/thing", "scripts/components/test/thing.graph.json");
}

/** update 안의 print 한 줄: 값 노드들과 print 의 입력 */
function printed(nodes: GraphNode[], value: string, extra: Partial<GraphFile> = {}) {
  const g = gen(graph([{ id: "u", kind: "event.update", next: "p" }, ...nodes, { id: "p", kind: "text.print", in: { value } }], extra));
  const pick = (text: string, prefix: string) => text.split("\n").find((l) => l.trim().startsWith(prefix))!.trim();
  return { lua: pick(g.lua.text, "print("), ruby: pick(g.ruby.text, "puts(") };
}

describe("코드 생성: 픽스처", () => {
  it("플래피 bird 는 기대한 Lua 와 Ruby 다", async () => {
    const r = await compileFixture("flappy", "bird", "scripts/components/flappy/bird.graph.json", { "scripts/components/flappy/common.nodes.json": "flappy/common.nodes.json" });
    expect(r.problems).toEqual([]);
    expect(r.generated!.lua).toMatchObject({ path: "scripts/lua/components/flappy/bird.lua", text: read("flappy", "bird.expected.lua") });
    expect(r.generated!.ruby).toMatchObject({ path: "scripts/ruby/components/flappy/bird.rb", text: read("flappy", "bird.expected.rb") });
    expect(r.generated!.declaration).toBeNull();
  });

  it("샘플러는 기대한 Lua, Ruby, 선언 파일이다", async () => {
    const r = await compileFixture("sampler", "sampler", "scripts/components/graphtest/sampler.graph.json");
    expect(r.problems).toEqual([]);
    expect(r.generated!.lua.text).toBe(read("sampler", "sampler.expected.lua"));
    expect(r.generated!.ruby.text).toBe(read("sampler", "sampler.expected.rb"));
    expect(r.generated!.declaration).toMatchObject({ path: "scripts/components/graphtest/sampler.json", text: read("sampler", "sampler.expected.json") });
  });

  it("줄마다 그 줄을 만든 노드를 안다", async () => {
    const r = await compileFixture("flappy", "bird", "scripts/components/flappy/bird.graph.json", { "scripts/components/flappy/common.nodes.json": "flappy/common.nodes.json" });
    for (const file of [r.generated!.lua, r.generated!.ruby]) {
      const lines = file.text.split("\n");
      expect(file.lines.length).toBe(lines.length - 1);
      const at = (needle: string) => file.lines[lines.findIndex((l) => l.includes(needle))];
      expect(at("die(st)")).toBe("die");
      expect(at("MAX_FALL")).toBe("cap_if");
      expect(at("= obj")).toBe("keep_bird");
      expect(file.lines[0]).toBeNull();
    }
  });

  it("생성 파일의 첫 줄에서 그래프 경로를 읽는다", () => {
    expect(generatedFrom(read("flappy", "bird.expected.lua"))).toBe("scripts/components/flappy/bird.graph.json");
    expect(generatedFrom(read("flappy", "bird.expected.rb"))).toBe("scripts/components/flappy/bird.graph.json");
    expect(generatedFrom("-- components/flappy/bird.lua : 새의 물리\n")).toBeNull();
  });

  it("오류가 있는 분석은 만들지 않는다", () => {
    expect(() => gen(graph([{ id: "x", kind: "nope" }]))).toThrow(GraphCodegenError);
  });
});

describe("코드 생성: 식과 문장", () => {
  const n = (id: string, kind: string, rest: Partial<GraphNode> = {}): GraphNode => ({ id, kind, ...rest });

  it("그래프의 계산 순서를 괄호로 지킨다", () => {
    const vars = [n("a", "math.random"), n("b", "math.random"), n("c", "math.random")];
    expect(printed([...vars, n("bc", "math.sub", { in: { a: "b", b: "c" } }), n("r", "math.sub", { in: { a: "a", b: "bc" } })], "r")).toEqual({
      lua: "print(math.random() - (math.random() - math.random()))",
      ruby: "puts(rand - (rand - rand))",
    });
    expect(printed([...vars, n("bc", "math.add", { in: { a: "b", b: "c" } }), n("r", "math.add", { in: { a: "a", b: "bc" } })], "r").lua).toBe("print(math.random() + (math.random() + math.random()))");
    expect(printed([...vars, n("ab", "math.add", { in: { a: "a", b: "b" } }), n("r", "math.add", { in: { a: "ab", b: "c" } })], "r").lua).toBe("print(math.random() + math.random() + math.random())");
    expect(printed([...vars, n("ab", "math.add", { in: { a: "a", b: "b" } }), n("r", "math.mul", { in: { a: "ab", b: "c" } })], "r").ruby).toBe("puts((rand + rand) * rand)");
    expect(printed([n("e", "cmp.eq", { args: { a: 1, b: 2 } }), n("r", "logic.not", { in: { a: "e" } })], "r")).toEqual({ lua: "print(not (1 == 2))", ruby: "puts(!(1 == 2))" });
    expect(printed([n("x", "math.neg", { args: { a: -2 } })], "x")).toEqual({ lua: "print(-(-2))", ruby: "puts(-(-2))" });
    expect(printed([n("a", "cmp.lt", { args: { a: 1, b: 2 } }), n("b", "cmp.lt", { args: { a: 2, b: 3 } }), n("c", "logic.and", { in: { a: "a", b: "b" } }), n("d", "logic.or", { in: { a: "c" }, args: { b: false } })], "d")).toEqual({
      lua: "print(1 < 2 and 2 < 3 or false)",
      ruby: "puts(1 < 2 && 2 < 3 || false)",
    });
  });

  it("나누기는 두 언어에서 늘 실수다", () => {
    const w = [n("w", "api.call", { fn: "Graphics.WindowWidth" }), n("h", "api.call", { fn: "Graphics.WindowHeight" })];
    expect(printed([...w, n("d", "math.div", { in: { a: "w", b: "h" } })], "d")).toEqual({ lua: "print(WindowWidth() / WindowHeight())", ruby: "puts(Graphics.width.to_f / Graphics.height)" });
    expect(printed([...w, n("d", "math.div", { in: { a: "w" }, args: { b: 2 } })], "d")).toEqual({ lua: "print(WindowWidth() / 2)", ruby: "puts(Graphics.width / 2.0)" });
    expect(printed([n("r", "math.random"), n("d", "math.div", { in: { b: "r" }, args: { a: 1 } })], "d").ruby).toBe("puts(1.0 / rand)");
  });

  it("값 분기: Lua 는 호출이면 값을 한 번만 구한다", () => {
    const g = gen(
      graph([
        n("u", "event.update", { next: "s" }),
        n("r", "math.randomInt", { args: { min: 1, max: 2 } }),
        n("s", "flow.switch", { in: { value: "r" }, cases: { "1": "p", "2": "q" }, else: "z" }),
        n("p", "text.print", { args: { value: "one" } }),
        n("q", "text.print", { args: { value: "two" } }),
        n("z", "text.print", { args: { value: "other" } }),
      ]),
    );
    expect(g.lua.text).toContain(`\tlocal _sw_s = math.random(1, 2)
\tif _sw_s == 1 then
\t\tprint("one")
\telseif _sw_s == 2 then
\t\tprint("two")
\telse
\t\tprint("other")
\tend`);
    expect(g.ruby.text).toContain(`        case 1 + rand(2 - 1 + 1)
        when 1
          puts("one")
        when 2
          puts("two")
        else
          puts("other")
        end`);
  });

  it("값만 정하고 잇지 않은 갈래는 빈 갈래다", () => {
    const g = graph([n("u", "event.update", { next: "s" }), n("s", "flow.switch", { args: { value: 3 }, cases: { "1": "", "2": "p" } }), n("p", "text.print", { args: { value: "two" } })]);
    expect(validateGraph(g, { libraries: new Map() }).problems).toEqual([]);
    const code = gen(g);
    expect(code.lua.text).toContain('\tif 3 == 1 then\n\telseif 3 == 2 then\n\t\tprint("two")\n\tend');
    expect(code.ruby.text).toContain('        case 3\n        when 1\n        when 2\n          puts("two")\n        end');
  });

  it("조건 분기의 else 만 있으면 부정한다", () => {
    const g = gen(graph([n("u", "event.update", { next: "b" }), n("k", "api.call", { fn: "Input.IsKeyPress", args: { key: "LEFT" } }), n("b", "flow.branch", { in: { cond: "k" }, else: "p" }), n("p", "text.print", { args: { value: "no" } })]));
    expect(g.lua.text).toContain("\tif not Input.IsKeyPress(37) then\n\t\tprint(\"no\")\n\tend");
    expect(g.ruby.text).toContain("        unless Input.key_press?(:left)\n          puts(\"no\")\n        end");
  });

  it("지역 변수는 처음 쓰는 곳이 맨 위의 대입이면 그 자리에서, 아니면 훅 맨 위에서 만든다", () => {
    const g = gen(
      graph(
        [
          n("u", "event.update", { next: "a" }),
          n("a", "local.set", { field: "first", args: { value: 1 }, next: "b" }),
          n("b", "flow.branch", { args: { cond: true }, then: "c" }),
          n("c", "local.set", { field: "later", args: { value: "x" } }),
        ],
        { locals: [{ key: "first", type: "integer" }, { key: "later", type: "string", default: "기본" }] },
      ),
    );
    expect(g.lua.text).toContain('function M.update(obj, scene, elapsed, params)\n\tlocal later = "기본"\n\tlocal first = 1\n\tif true then\n\t\tlater = "x"\n\tend\nend');
    expect(g.ruby.text).toContain('def update(obj, scene, elapsed)\n        later = "기본"\n        first = 1\n        if true\n          later = "x"\n        end\n      end');
  });

  it("엔진 API: 키와 마우스 버튼, Ruby 의 getter 와 setter", () => {
    const g = gen(
      graph([
        n("u", "event.update", { next: "v" }),
        n("v", "api.call", { fn: "Audio.SetVolume", args: { volume: 128 }, next: "s" }),
        n("s", "api.call", { fn: "Audio.PlaySound", args: { path: "./resources/audio/hit.wav", id: "hit" } }),
      ]),
    );
    expect(g.lua.text).toContain('\tAudio.SetVolume(128)\n\tAudio.PlaySound("./resources/audio/hit.wav", "hit", 0)');
    expect(g.ruby.text).toContain('        Audio.volume = 128\n        Audio.play_sound("./resources/audio/hit.wav", "hit", 0)');
    expect(printed([n("m", "api.call", { fn: "Input.IsMouseDown", args: { button: "right" } })], "m")).toEqual({ lua: "print(Input.IsMouseDown(1))", ruby: "puts(Input.mouse_down?(:right))" });
    expect(printed([n("m", "api.call", { fn: "Input.GetMouseX" })], "m")).toEqual({ lua: "print(Input.GetMouseX())", ruby: "puts(Input.mouse_x)" });
  });

  it("문자열 상수의 이스케이프", () => {
    expect(printed([n("t", "text.concat", { args: { a: 'a"b\\c', b: "#{x}\n" } })], "t")).toEqual({ lua: 'print("a\\"b\\\\c" .. "#{x}\\n")', ruby: 'puts("a\\"b\\\\c\\#{x}\\n")' });
  });

  it("props 와 다른 오브젝트", () => {
    const g = gen(
      graph([
        n("u", "event.update", { next: "s" }),
        n("f", "scene.find", { args: { id: "enemy" } }),
        n("hp", "prop.get", { field: "hp", type: "integer", in: { target: "f" } }),
        n("s", "prop.set", { field: "end", type: "integer", in: { value: "hp" } }),
      ]),
    );
    expect(g.lua.text).toContain('\tobj.props["end"] = scene:find("enemy").props.hp');
    expect(g.ruby.text).toContain('        obj.props["end"] = scene.find("enemy").props["hp"]');
  });

  it("상태의 기본값은 init 에서 채운다 (init 이벤트가 없어도)", () => {
    const g = gen(graph([n("u", "event.update")], { state: { from: "scene", fields: [{ key: "hiScore", type: "integer", default: 0 }, { key: "mode", type: "enum", values: ["a", "b"], default: "b" }] } }));
    expect(g.lua.text).toContain('function M.init(obj, scene, params)\n\tlocal st = scene.state\n\tif st.hiScore == nil then st.hiScore = 0 end\n\tif st.mode == nil then st.mode = "b" end\nend');
    expect(g.ruby.text).toContain("def init(obj, scene)\n        st = scene.state\n        st[:hi_score] = 0 if st[:hi_score].nil?\n        st[:mode] = :b if st[:mode].nil?\n      end");
  });

  it("빈 그래프도 모듈과 클래스다", () => {
    const g = gen(graph([]));
    expect(g.lua.text).toBe("-- 그래프에서 만든 파일: scripts/components/test/thing.graph.json (이 파일이 아니라 그래프를 편집합니다)\n\nlocal M = {}\n\nreturn M\n");
    expect(g.ruby.text).toBe(
      "# 그래프에서 만든 파일: scripts/components/test/thing.graph.json (이 파일이 아니라 그래프를 편집합니다)\n\nmodule Components\n  module Test\n    class Thing\n    end\n  end\nend\n",
    );
  });
});
