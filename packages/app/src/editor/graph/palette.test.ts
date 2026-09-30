import { parseGraph, parseNodeLibrary, validateGraph } from "@initial-editor/core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { filterPalette, paletteEntries } from "./palette";

const F = join(__dirname, "..", "..", "..", "..", "core", "src", "graph", "fixtures", "flappy");
const LIB = "scripts/components/flappy/common.nodes.json";

describe("노드 추가 목록", () => {
  const graph = parseGraph(readFileSync(join(F, "bird.graph.json"), "utf8"));
  const lib = parseNodeLibrary(LIB, readFileSync(join(F, "common.nodes.json"), "utf8"));
  const entries = paletteEntries(graph, validateGraph(graph, { libraries: new Map([[LIB, lib]]) }));

  it("있는 이벤트는 빼고, 상태 필드와 지역 변수와 라이브러리와 엔진 API 는 설정마다 한 항목이다", () => {
    const kinds = entries.map((e) => e.node.kind);
    expect(kinds).not.toContain("event.init");
    expect(kinds).not.toContain("event.update");
    expect(kinds).toContain("event.render");
    expect(entries.filter((e) => e.category === "상태").map((e) => `${e.node.kind}:${e.node.field}`)).toContain("state.set:birdVy");
    expect(entries.filter((e) => e.category === "지역 변수").length).toBe(2);
    expect(entries.find((e) => e.node.const === "flappy.GRAVITY")).toMatchObject({ category: "플래피", label: "중력 가속도", detail: "flappy.GRAVITY" });
    expect(entries.some((e) => e.node.fn === "flappy.state")).toBe(false);
    expect(entries.find((e) => e.node.fn === "Input.IsKeyDown")).toMatchObject({ category: "엔진 API" });
    expect(new Set(entries.map((e) => e.key)).size).toBe(entries.length);
  });

  it("검색은 이름, 설정, 분류, 종류로 거른다", () => {
    expect(filterPalette(entries, "콘솔").map((e) => e.node.kind)).toEqual(["text.print"]);
    expect(filterPalette(entries, "birdvy").every((e) => e.node.field === "birdVy")).toBe(true);
    expect(filterPalette(entries, "GRAVITY").map((e) => e.node.const)).toEqual(["flappy.GRAVITY"]);
    expect(filterPalette(entries, "  ").length).toBe(entries.length);
  });
});
