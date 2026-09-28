import { describe, expect, it } from "vitest";
import type { ValidationProblem, Validator } from "./extensions";
import { CORE_DEFAULT_PROPS, CORE_OBJECT_TYPES, makeObject, parseScene } from "./scene";
import { SceneDocument, sceneNameFromPath, scenePathFor } from "./sceneDocument";
import { MemoryBackend } from "./testing/memory-backend";

const known = () => new Set<string>(CORE_OBJECT_TYPES);

describe("SceneDocument", () => {
  it("열고, 명령으로 고치고, 저장하면 파일이 바뀌고, 되돌리면 dirty 가 풀린다", async () => {
    const be = new MemoryBackend({
      "resources/scenes/main.json": '{"version": 1, "name": "main", "objects": [{"id": "a", "type": "node"}], "keep": 1}',
    });
    await be.open("/mem");
    const doc = await SceneDocument.open(be, "resources/scenes/main.json", known);
    expect(doc.kind).toBe("scene");
    expect(doc.title).toBe("main.json");
    expect(doc.dirty).toBe(false);
    doc.apply(doc.scene.addObject(makeObject("sprite", "player", CORE_DEFAULT_PROPS.sprite, { x: 5 })));
    expect(doc.dirty).toBe(true);
    await doc.save();
    expect(doc.dirty).toBe(false);
    const saved = parseScene(await be.readText("resources/scenes/main.json"));
    expect(saved.objects.map((o) => o.id)).toEqual(["a", "player"]);
    expect(saved.extra).toEqual({ keep: 1 });
    doc.undo.undo();
    expect(doc.dirty).toBe(true);
    expect(doc.scene.ids()).toEqual(["a"]);
  });

  it("검사 결과와 선택", async () => {
    const be = new MemoryBackend({ "resources/scenes/x.json": '{"version": 1, "objects": [{"id": "a", "type": "ghost"}, {"id": "b", "type": "node"}]}' });
    await be.open("/mem");
    const doc = await SceneDocument.open(be, "resources/scenes/x.json", known);
    expect(doc.problems.map((p) => p.message)).toEqual(["등록되지 않은 오브젝트 타입: ghost"]);
    doc.select(["a"]);
    doc.select(["b"], true);
    expect(doc.selectedIds).toEqual(["a", "b"]);
    doc.apply(doc.scene.removeObject("a"));
    expect(doc.selectedIds).toEqual(["b"]);
    doc.clearSelection();
    expect(doc.selectedIds).toEqual([]);
  });

  it("외부 변경을 다시 읽으면 되돌리기와 선택이 비고 dirty 가 풀린다", async () => {
    const be = new MemoryBackend({ "resources/scenes/x.json": '{"version": 1, "objects": []}' });
    await be.open("/mem");
    const doc = await SceneDocument.open(be, "resources/scenes/x.json", known);
    doc.apply(doc.scene.addObject(makeObject("node", "n", {})));
    be.simulateExternalChange("resources/scenes/x.json", "modify", '{"version": 1, "objects": [{"id": "outside", "type": "text", "props": {"text": "밖"}}]}');
    await doc.reload();
    expect(doc.scene.ids()).toEqual(["outside"]);
    expect(doc.dirty).toBe(false);
    expect(doc.undo.canUndo).toBe(false);
  });

  it("확장 검사기는 씬 데이터를 받고, 결과가 씬 규칙 뒤에 붙는다. 비동기 결과는 끝나는 대로, 낡은 결과는 버린다", async () => {
    const be = new MemoryBackend({ "resources/scenes/x.json": '{"version": 1, "objects": [{"id": "a", "type": "ghost"}]}' });
    await be.open("/mem");
    const seen: unknown[] = [];
    const sync: Validator = (data) => {
      seen.push(data);
      const objects = (data as { objects: Array<{ id: string }> }).objects;
      return objects.map((o): ValidationProblem => ({ severity: "error", message: `동기 ${o.id}` }));
    };
    const resolvers: Array<(v: ValidationProblem[]) => void> = [];
    const later: Validator = () => new Promise<ValidationProblem[]>((resolve) => resolvers.push(resolve));
    const broken: Validator = () => {
      throw new Error("깨졌다");
    };
    const validators: Validator[] = [sync, later, broken];
    const doc = await SceneDocument.open(be, "resources/scenes/x.json", known, () => validators);
    expect((seen[0] as { objects: Array<{ id: string }> }).objects.map((o) => o.id)).toEqual(["a"]);
    expect(doc.problems.map((p) => p.message)).toEqual(["등록되지 않은 오브젝트 타입: ghost", "동기 a", "검사기 오류: 깨졌다"]);

    resolvers[0]([{ severity: "warning", message: "비동기" }]);
    await new Promise((r) => setTimeout(r, 0));
    expect(doc.problems.map((p) => p.message)).toEqual(["등록되지 않은 오브젝트 타입: ghost", "동기 a", "검사기 오류: 깨졌다", "비동기"]);

    // 다시 검사한 뒤에 끝난 옛 결과는 붙지 않는다
    doc.apply(doc.scene.addObject(makeObject("node", "b", {})));
    doc.revalidate();
    doc.revalidate();
    expect(resolvers).toHaveLength(3);
    resolvers[1]([{ severity: "warning", message: "옛 결과" }]);
    await new Promise((r) => setTimeout(r, 0));
    expect(doc.problems.map((p) => p.message)).not.toContain("옛 결과");
    resolvers[2]([]);
    await new Promise((r) => setTimeout(r, 0));
    expect(doc.problems.map((p) => p.message)).toEqual(["등록되지 않은 오브젝트 타입: ghost", "동기 a", "동기 b", "검사기 오류: 깨졌다"]);
  });

  it("경로 도우미", () => {
    expect(scenePathFor("main")).toBe("resources/scenes/main.json");
    expect(sceneNameFromPath("resources/scenes/stage 1.json")).toBe("stage 1");
  });
});
