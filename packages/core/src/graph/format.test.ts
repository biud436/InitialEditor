import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyGraph, GraphFormatError, parseGraph, serializeGraph } from "./format";

const BIRD = readFileSync(join(__dirname, "fixtures", "flappy", "bird.graph.json"), "utf8");

describe("그래프 파일 포맷", () => {
  it("플래피 bird 를 읽는다", () => {
    const g = parseGraph(BIRD);
    expect(g.uses).toEqual(["scripts/components/flappy/common.nodes.json"]);
    expect(g.state?.from).toBe("flappy.state");
    // 상태 필드는 라이브러리(common.nodes.json 의 state 함수)가 선언한다
    expect(g.state?.fields).toEqual([]);
    expect(g.locals).toEqual([{ key: "dt", type: "number", label: "틱 시간 (초)" }]);
    expect(g.nodes.length).toBe(80);
    expect(g.nodes.find((n) => n.id === "by_state")).toMatchObject({ kind: "flow.switch", in: { value: "st_state" }, cases: { ready: "float_y", play: "fall", dead: "tumble_if" }, next: "sync_angle" });
  });

  it("쓰고 다시 읽으면 같고, 두 번 써도 같은 글이다", () => {
    const g = parseGraph(BIRD);
    const text = serializeGraph(g);
    expect(parseGraph(text)).toEqual(g);
    expect(serializeGraph(parseGraph(text))).toBe(text);
  });

  it("노드와 변수는 한 줄에 하나, layout 은 노드 순서로 한 줄에 하나다", () => {
    const g = emptyGraph();
    g.nodes.push({ id: "p", kind: "text.print", args: { value: "hi" } });
    g.nodes[0].next = "p";
    g.layout = { p: [200, 0], update: [0, 0] };
    g.locals = [{ key: "n", type: "integer", default: 0 }];
    expect(serializeGraph(g)).toBe(`{
  "version": 1,
  "locals": [
    { "key": "n", "type": "integer", "default": 0 }
  ],
  "nodes": [
    { "id": "update", "kind": "event.update", "next": "p" },
    { "id": "p", "kind": "text.print", "args": { "value": "hi" } }
  ],
  "layout": {
    "update": [0, 0],
    "p": [200, 0]
  }
}
`);
  });

  it("모르는 키는 루트, 노드, 변수 선언, state 에서 보존한다", () => {
    const text = JSON.stringify({
      version: 1,
      note: "메모",
      state: { from: "scene", fields: [{ key: "hp", type: "integer", color: "red" }], extra: 1 },
      nodes: [{ id: "u", kind: "event.update", comment: "여기" }],
    });
    const g = parseGraph(text);
    expect(g.extra).toEqual({ note: "메모" });
    expect(g.state?.extra).toEqual({ extra: 1 });
    expect(g.state?.fields[0].extra).toEqual({ color: "red" });
    expect(g.nodes[0].extra).toEqual({ comment: "여기" });
    const again = parseGraph(serializeGraph(g));
    expect(again).toEqual(g);
  });

  it("메모 상자는 한 줄에 하나로 쓰고 다시 읽는다", () => {
    const g = emptyGraph();
    g.comments = [{ id: "note", text: "날갯짓\n두 줄", box: [0, -40, 300, 200] }];
    const text = serializeGraph(g);
    expect(text).toContain('  "comments": [\n    { "id": "note", "text": "날갯짓\\n두 줄", "box": [0, -40, 300, 200] }\n  ]');
    expect(parseGraph(text)).toEqual(g);
    expect(() => parseGraph('{"version":1,"nodes":[],"comments":[{"id":"a","text":"x","box":[1,2,3]}]}')).toThrow(/comments\[0\]\.box는 숫자 네 개/);
  });

  it("state.from 이 없으면 scene", () => {
    expect(parseGraph('{"version":1,"state":{"fields":[]},"nodes":[]}').state?.from).toBe("scene");
  });

  it("모양이 틀리면 GraphFormatError", () => {
    const bad = (text: string, message: RegExp) => expect(() => parseGraph(text)).toThrow(message);
    bad("{", /JSON 구문 오류/);
    bad("[]", /최상위 값은 객체/);
    bad('{"version":2,"nodes":[]}', /지원하지 않는 그래프 버전: 2/);
    bad('{"version":1}', /nodes는 배열/);
    bad('{"version":1,"nodes":[{"kind":"x"}]}', /nodes\[0\]\.id/);
    bad('{"version":1,"nodes":[{"id":"a","kind":"x","in":{"a":1}}]}', /nodes\[0\]\.in\.a는 문자열/);
    bad('{"version":1,"nodes":[{"id":"a","kind":"x","type":"table"}]}', /nodes\[0\]\.type/);
    bad('{"version":1,"nodes":[],"layout":{"a":[1]}}', /layout\.a는 숫자 두 개/);
    bad('{"version":1,"nodes":[],"locals":[{"key":"a","type":"list"}]}', /locals\[0\]\.type/);
    bad('{"version":1,"nodes":[],"uses":"x"}', /uses는 문자열 배열/);
    expect(() => parseGraph("{")).toThrow(GraphFormatError);
  });
});
