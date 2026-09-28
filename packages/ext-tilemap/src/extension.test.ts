import { describe, expect, it } from "vitest";
import { CommandRegistry, ExtensionHost, ExtensionRegistries, makeObject, MemoryBackend, MenuRegistry, SceneDocument } from "@initial-editor/core";
import { type MapFileProblem, readTilemapProps, TILEMAP_DEFAULTS, tilemapExtension, tilemapMapRefs, tilemapObjectType, validateTilemapMapFiles, validateTilemapObjects } from "./index";

function host() {
  const registries = new ExtensionRegistries();
  const h = new ExtensionHost({ commands: new CommandRegistry({ platform: "mac" }), menus: new MenuRegistry(), registries });
  return { h, registries };
}

describe("타일맵 확장", () => {
  it("오브젝트 타입 tilemap을 라벨, 기본 props, 런타임 짝과 함께 등록하고, 해제하면 거둔다", async () => {
    const { h, registries } = host();
    await h.activateAll([tilemapExtension]);
    const spec = registries.objectTypes.get("tilemap");
    expect(spec).toBeDefined();
    expect(spec!.label).toBe("타일맵");
    expect(spec!.icon).toBe("tilemap");
    expect(spec!.defaults).toEqual({ map: "", groundLayers: 1 });
    expect(spec!.runtime).toEqual({ lua: "scripts/lua/scene_types/tilemap.lua", ruby: "scripts/ruby/scene_types/tilemap.rb" });
    expect([...registries.validators]).toEqual([validateTilemapObjects]);
    await h.deactivate("tilemap");
    expect(registries.objectTypes.has("tilemap")).toBe(false);
    expect(registries.validators.length).toBe(0);
  });

  it("검사기는 엔진의 validate처럼 빈 맵과 음수나 수가 아닌 groundLayers를 오류로 알린다", () => {
    const scene = {
      objects: [
        { id: "ok", type: "tilemap", props: { map: "resources/maps/a.json", groundLayers: 0 } },
        { id: "noGround", type: "tilemap", props: { map: "resources/maps/a.json" } },
        { id: "empty", type: "tilemap", props: { map: "", groundLayers: 1 } },
        { id: "bad", type: "tilemap", props: { map: 3, groundLayers: -1 } },
        { id: "text", type: "tilemap", props: { map: "resources/maps/a.json", groundLayers: "2" } },
        { id: "sprite", type: "sprite", props: { map: "" } },
      ],
    };
    const problems = validateTilemapObjects(scene);
    expect(problems.map((p) => [p.severity, p.location])).toEqual([
      ["error", "objects[2].props.map"],
      ["error", "objects[3].props.map"],
      ["error", "objects[3].props.groundLayers"],
      ["error", "objects[4].props.groundLayers"],
    ]);
    expect(problems[0].message).toBe("타일맵 empty: 맵 파일(props.map)이 비어 있습니다. 실행하면 엔진에서 씬을 불러오지 못합니다.");
    expect(problems[3].message).toBe('타일맵 text의 groundLayers는 0 이상의 숫자여야 합니다: "2"');
    // props가 없는 타일맵, 씬이 아닌 값
    expect(validateTilemapObjects({ objects: [{ id: "bare", type: "tilemap" }] }).map((p) => p.location)).toEqual(["objects[0].props.map"]);
    expect(validateTilemapObjects(null)).toEqual([]);
    expect(validateTilemapObjects({ objects: "x" })).toEqual([]);
  });

  it("씬 문서의 검사 결과에 타일맵 검사가 들어가고, 맵을 고르면 사라진다", async () => {
    const { h, registries } = host();
    await h.activateAll([tilemapExtension]);
    const known = () => new Set(registries.objectTypes.keys());
    const doc = new SceneDocument(new MemoryBackend(), "resources/scenes/s.json", undefined, known, () => registries.validators);
    expect(doc.problems).toEqual([]);
    doc.apply(doc.scene.addObject(makeObject("tilemap", "tilemap", { ...TILEMAP_DEFAULTS })));
    expect(doc.revalidate().map((p) => p.location)).toEqual(["objects[0].props.map"]);
    doc.apply(doc.scene.setProp("tilemap", "map", "resources/maps/a.json"));
    expect(doc.revalidate()).toEqual([]);
  });

  it("명세는 부를 때마다 새 객체라 기본값을 고쳐도 다음 명세가 흔들리지 않는다", () => {
    const a = tilemapObjectType();
    a.defaults.map = "resources/maps/x.json";
    expect(tilemapObjectType().defaults).toEqual({ map: "", groundLayers: 1 });
    expect(TILEMAP_DEFAULTS).toEqual({ map: "", groundLayers: 1 });
  });

  it("props를 읽을 때 어긋난 값은 기본값이다", () => {
    expect(readTilemapProps({ map: "resources/maps/a.json", groundLayers: 2 })).toEqual({ map: "resources/maps/a.json", groundLayers: 2 });
    expect(readTilemapProps({ groundLayers: 2.7 })).toEqual({ map: "", groundLayers: 2 });
    expect(readTilemapProps({ map: 3, groundLayers: -1 })).toEqual({ map: "", groundLayers: 1 });
    expect(readTilemapProps({ groundLayers: "2" })).toEqual({ map: "", groundLayers: 1 });
    expect(readTilemapProps({ groundLayers: 0 })).toEqual({ map: "", groundLayers: 0 });
  });

  it("타일맵이 가리키는 맵 파일 목록은 비었거나 문자열이 아닌 map을 뺀다", () => {
    const scene = {
      objects: [
        { id: "a", type: "tilemap", props: { map: "resources/maps/a.json" } },
        { id: "s", type: "sprite", props: { map: "resources/maps/x.json" } },
        { id: "empty", type: "tilemap", props: { map: "" } },
        { id: "num", type: "tilemap", props: { map: 3 } },
        { type: "tilemap", props: { map: "resources/maps/b.json" } },
      ],
    };
    expect(tilemapMapRefs(scene)).toEqual([
      { index: 0, id: "a", map: "resources/maps/a.json" },
      { index: 4, id: "#4", map: "resources/maps/b.json" },
    ]);
    expect(tilemapMapRefs(null)).toEqual([]);
  });

  it("맵 파일 검사는 없거나 맵으로 읽히지 않는다고 답한 경로만 오류로 알린다 (문제없거나 모르면 알리지 않는다)", () => {
    const scene = {
      objects: [
        { id: "here", type: "tilemap", props: { map: "resources/maps/a.json", groundLayers: 1 } },
        { id: "gone", type: "tilemap", props: { map: "resources/maps/old.json", groundLayers: 1 } },
        { id: "blank", type: "tilemap", props: { map: "", groundLayers: 1 } },
        { id: "broken", type: "tilemap", props: { map: "resources/maps/broken.json", groundLayers: 1 } },
      ],
    };
    const asked: string[] = [];
    const answers: Record<string, MapFileProblem> = {
      "resources/maps/old.json": { kind: "missing" },
      "resources/maps/broken.json": { kind: "invalid", reason: "JSON 구문 오류: Unexpected token" },
    };
    const problems = validateTilemapMapFiles(scene, (path) => {
      asked.push(path);
      return answers[path] ?? null;
    });
    expect(asked).toEqual(["resources/maps/a.json", "resources/maps/old.json", "resources/maps/broken.json"]);
    expect(problems).toEqual([
      { severity: "error", message: "타일맵 gone: 맵 파일이 없습니다 (resources/maps/old.json). 실행하면 엔진에서 씬을 불러오지 못합니다.", location: "objects[1].props.map" },
      {
        severity: "error",
        message: "타일맵 broken: 맵 파일 형식이 올바르지 않습니다 (resources/maps/broken.json, JSON 구문 오류: Unexpected token). 실행하면 엔진에서 씬을 불러오지 못합니다.",
        location: "objects[3].props.map",
      },
    ]);
    expect(validateTilemapMapFiles(scene, () => null)).toEqual([]);
    expect(validateTilemapMapFiles({ objects: "x" }, () => ({ kind: "missing" }))).toEqual([]);
  });
});
