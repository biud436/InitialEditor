import { describe, expect, it } from "vitest";
import {
  componentDeclarationPath,
  componentNameFromDeclarationPath,
  declarationTemplate,
  fieldValueProblem,
  mergedParams,
  parseComponentDeclaration,
  validateComponentParams,
  type ComponentDeclarationState,
} from "./componentParams";
import { parseScene } from "./scene";

const MOVER = `{
  "version": 1,
  "fields": [
    { "key": "dx", "type": "number", "label": "가로 속도", "default": 1, "min": -10, "max": 10 },
    { "key": "limit", "type": "integer", "default": 100, "min": 0 },
    { "key": "kind", "type": "enum", "values": ["ground", "pipes"], "default": "ground" },
    { "key": "loop", "type": "boolean" },
    { "key": "title", "type": "text" },
    { "key": "target", "type": "object", "label": "대상" }
  ]
}`;

describe("선언 파일", () => {
  it("경로와 논리 이름", () => {
    expect(componentDeclarationPath("components/flappy/bird")).toBe("scripts/components/flappy/bird.json");
    expect(componentNameFromDeclarationPath("scripts/components/flappy/bird.json")).toBe("components/flappy/bird");
    expect(componentNameFromDeclarationPath("scripts/lua/components/x.json")).toBeNull();
    expect(componentNameFromDeclarationPath("resources/x.json")).toBeNull();
  });

  it("읽는다", () => {
    const d = parseComponentDeclaration(MOVER);
    expect(d.fields.map((f) => `${f.key}:${f.type}`)).toEqual(["dx:number", "limit:integer", "kind:enum", "loop:boolean", "title:text", "target:object"]);
    expect(d.fields[0]).toEqual({
      key: "dx",
      type: "number",
      label: "가로 속도",
      default: 1,
      min: -10,
      max: 10,
    });
    expect(d.fields[2].values).toEqual(["ground", "pipes"]);
  });

  it("규칙에 어긋나면 이유를 말한다", () => {
    const bad =
      (fields: unknown, version: unknown = 1) =>
      () =>
        parseComponentDeclaration(JSON.stringify({ version, fields }));
    expect(() => parseComponentDeclaration("{")).toThrow(/JSON 구문 오류/);
    expect(bad([], 2)).toThrow(/지원하지 않는 선언 버전: 2/);
    expect(bad({ a: 1 })).toThrow(/fields는 배열/);
    expect(bad("x")).toThrow(/fields는 배열/);
    expect(bad([{ key: "1x", type: "number" }])).toThrow(/fields\[0\]\.key/);
    expect(bad([{ key: "a", type: "vector" }])).toThrow(/fields\[0\]\.type/);
    expect(
      bad([
        { key: "a", type: "number" },
        { key: "a", type: "string" },
      ]),
    ).toThrow(/fields\[1\]: key 중복: a/);
    expect(bad([{ key: "a", type: "enum" }])).toThrow(/values는 비어 있지 않은 문자열이 1개 이상 있는 배열/);
    expect(bad([{ key: "a", type: "string", values: ["x"] }])).toThrow(/values는 enum 타입에만 사용할 수 있습니다/);
    expect(bad([{ key: "a", type: "string", min: 1 }])).toThrow(/min: number와 integer 타입에만 사용할 수 있습니다/);
    expect(bad([{ key: "a", type: "integer", default: 1.5 }])).toThrow(/fields\[0\]\.default: 정수여야 합니다/);
    expect(bad([{ key: "a", type: "enum", values: ["x"], default: "y" }])).toThrow(/default: x 중 하나/);
    expect(bad([{ key: "a", type: "number", max: 3, default: 4 }])).toThrow(/3 이하/);
    expect(bad([{ key: "a", type: "number", min: 3, max: 2 }])).toThrow(/fields\[0\]: min이 max보다 큽니다/);
    expect(bad([{ key: "a", type: "enum", values: ["x", ""] }])).toThrow(/values는 비어 있지 않은 문자열이 1개 이상/);
    expect(bad([{ key: "a", type: "object", default: "" }])).toThrow(/default: 오브젝트 id/);
  });

  it("엔진처럼 null 은 없는 것, fields 가 없거나 {} 면 빈 목록이다", () => {
    expect(parseComponentDeclaration(`{ "version": 1 }`).fields).toEqual([]);
    expect(parseComponentDeclaration(`{ "version": 1, "fields": {} }`).fields).toEqual([]);
    expect(parseComponentDeclaration(`{ "version": 1, "fields": null, "note": "x" }`).fields).toEqual([]);
    const d = parseComponentDeclaration(`{ "version": 1, "fields": [{ "key": "a", "type": "number", "label": null, "default": null, "min": null }] }`);
    expect(d.fields).toEqual([{ key: "a", type: "number" }]);
  });

  it("값 검사와 합치기", () => {
    const d = parseComponentDeclaration(MOVER);
    const field = (key: string) => d.fields.find((f) => f.key === key)!;
    expect(fieldValueProblem(field("dx"), 11)).toBe("10 이하여야 합니다");
    expect(fieldValueProblem(field("loop"), 1)).toBe("true나 false여야 합니다");
    expect(fieldValueProblem(field("target"), "ghost", new Set(["a"]))).toBe("씬에 없는 오브젝트: ghost");
    expect(fieldValueProblem(field("target"), "ghost")).toBeNull();
    expect(mergedParams(d, { dx: 3 })).toEqual({
      dx: 3,
      limit: 100,
      kind: "ground",
    });
    expect(mergedParams(null, { free: true })).toEqual({ free: true });
  });

  it("처음 만드는 선언은 이미 있는 값의 형식을 짐작한다", () => {
    const d = parseComponentDeclaration(
      declarationTemplate({
        dx: 2,
        speed: 1.5,
        on: true,
        name: "x",
        "bad key": 1,
      }),
    );
    expect(d.fields).toEqual([
      { key: "dx", type: "integer", label: "dx" },
      { key: "speed", type: "number", label: "speed" },
      { key: "on", type: "boolean", label: "on" },
      { key: "name", type: "string", label: "name" },
    ]);
  });
});

describe("씬의 매개변수 검사", () => {
  const scene = parseScene(`{
    "version": 1, "name": "s",
    "objects": [
      { "id": "a", "type": "node", "scripts": ["components/mover", "components/free", "components/broken"],
        "params": { "components/mover": { "dx": 20, "kind": "air", "target": "b", "nope": 1 }, "components/free": { "anything": [1] } } },
      { "id": "b", "type": "node", "scripts": ["components/broken", "components/mover"], "params": { "components/mover": { "target": "ghost" } } }
    ]
  }`);
  const states: Record<string, ComponentDeclarationState> = {
    "components/mover": {
      kind: "declared",
      path: "scripts/components/mover.json",
      declaration: parseComponentDeclaration(MOVER),
    },
    "components/free": { kind: "none", path: "scripts/components/free.json" },
    "components/broken": {
      kind: "broken",
      path: "scripts/components/broken.json",
      message: "fields는 배열이어야 합니다",
    },
  };

  it("선언된 필드의 형식, 선언되지 않은 키, 없는 오브젝트, 깨진 선언 (씬마다 한 번)", () => {
    const problems = validateComponentParams(scene, (name) => states[name]);
    expect(problems.map((p) => `${p.location} ${p.message}`)).toEqual([
      "objects[0].scripts 컴포넌트 선언 오류 (scripts/components/broken.json): fields는 배열이어야 합니다",
      "objects[0].params.components/mover.dx a: components/mover.dx: 10 이하여야 합니다",
      "objects[0].params.components/mover.kind a: components/mover.kind: ground, pipes 중 하나여야 합니다",
      "objects[0].params.components/mover.nope a: components/mover에 선언되지 않은 매개변수: nope",
      "objects[1].params.components/mover.target b: components/mover.target: 씬에 없는 오브젝트: ghost",
    ]);
  });

  it("아직 모르는 선언은 건너뛴다", () => {
    expect(validateComponentParams(scene, () => undefined)).toEqual([]);
  });
});
