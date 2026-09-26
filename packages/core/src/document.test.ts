import { describe, expect, it } from "vitest";
import { type Command, Document, DocumentRegistry, UndoStack } from "./document";
import { CORE_DEFAULT_PROPS, makeObject } from "./scene";
import { SceneDocument } from "./sceneDocument";
import { MemoryBackend } from "./testing/memory-backend";

function setValue(target: { v: number }, value: number, coalesceKey?: string): Command {
  const before = target.v;
  const cmd: Command & { value: number } = {
    label: `값 ${value}`,
    value,
    coalesceKey,
    execute() {
      target.v = cmd.value;
    },
    undo() {
      target.v = before;
    },
    merge(next) {
      cmd.value = (next as typeof cmd).value;
      cmd.execute();
      return true;
    },
  };
  return cmd;
}

class TestDoc extends Document {
  saved = 0;
  /** 있으면 reload가 이 오류로 실패한다 */
  reloadFails: string | null = null;
  constructor() {
    super("test", "a.txt", "a.txt");
  }
  async save() {
    this.assertCanSave();
    this.saved++;
    this.markSaved();
  }
  async reload() {
    if (this.reloadFails) throw new Error(this.reloadFails);
    this.markSaved();
  }
}

describe("UndoStack", () => {
  it("실행, 되돌리기, 다시 실행", () => {
    const t = { v: 0 };
    const s = new UndoStack();
    s.push(setValue(t, 1));
    s.push(setValue(t, 2));
    expect(t.v).toBe(2);
    expect(s.undoLabel).toBe("값 2");
    expect(s.undo()).toBe(true);
    expect(t.v).toBe(1);
    expect(s.redoLabel).toBe("값 2");
    expect(s.redo()).toBe(true);
    expect(t.v).toBe(2);
    expect(s.undo() && s.undo()).toBe(true);
    expect(t.v).toBe(0);
    expect(s.undo()).toBe(false);
  });

  it("새 명령은 다시 실행 목록을 비운다", () => {
    const t = { v: 0 };
    const s = new UndoStack();
    s.push(setValue(t, 1));
    s.undo();
    s.push(setValue(t, 5));
    expect(s.canRedo).toBe(false);
    expect(t.v).toBe(5);
  });

  it("같은 키의 연속 명령은 하나로 합쳐진다", () => {
    const t = { v: 0 };
    const s = new UndoStack();
    s.push(setValue(t, 1, "drag"));
    s.push(setValue(t, 2, "drag"));
    s.push(setValue(t, 3, "drag"));
    expect(t.v).toBe(3);
    expect(s.depth).toBe(1);
    s.undo();
    expect(t.v).toBe(0);
    s.redo();
    expect(t.v).toBe(3);
  });

  it("한도를 넘으면 오래된 것을 버린다", () => {
    const t = { v: 0 };
    const s = new UndoStack(3);
    for (let i = 1; i <= 5; i++) s.push(setValue(t, i));
    expect(s.depth).toBe(3);
  });
});

describe("Document dirty", () => {
  it("명령을 적용하면 dirty, 저장하면 깨끗, 저장 지점까지 되돌리면 다시 깨끗", async () => {
    const d = new TestDoc();
    const t = { v: 0 };
    expect(d.dirty).toBe(false);
    d.apply(setValue(t, 1));
    expect(d.dirty).toBe(true);
    await d.save();
    expect(d.dirty).toBe(false);
    d.apply(setValue(t, 2));
    expect(d.dirty).toBe(true);
    d.undo.undo();
    expect(d.dirty).toBe(false);
    d.undo.undo();
    expect(d.dirty).toBe(true); // 저장 지점보다 뒤로 갔다
  });

  it("저장, 되돌리기, 다른 편집을 하면 깊이가 같아도 dirty", async () => {
    const d = new TestDoc();
    const t = { v: 0 };
    d.apply(setValue(t, 1));
    await d.save();
    d.undo.undo();
    d.apply(setValue(t, 2));
    expect(d.undo.depth).toBe(1);
    expect(d.dirty).toBe(true);
  });

  it("저장 뒤 저장된 명령에 합쳐진 편집은 dirty", async () => {
    const d = new TestDoc();
    const t = { v: 0 };
    d.apply(setValue(t, 1, "typing"));
    await d.save();
    d.apply(setValue(t, 2, "typing"));
    expect(d.undo.depth).toBe(1);
    expect(d.dirty).toBe(true);
    d.undo.undo();
    expect(d.dirty).toBe(true); // 합쳐진 명령을 되돌리면 저장 전으로 간다
  });

  it("저장 지점으로 되돌리면 깨끗, 그 너머로 다시 실행하면 dirty", async () => {
    const d = new TestDoc();
    const t = { v: 0 };
    d.apply(setValue(t, 1));
    await d.save();
    d.apply(setValue(t, 2));
    d.apply(setValue(t, 3));
    d.undo.undo();
    d.undo.undo();
    expect(d.dirty).toBe(false);
    d.undo.redo();
    expect(d.dirty).toBe(true);
    d.undo.undo();
    d.undo.undo();
    expect(d.dirty).toBe(true); // 저장 지점보다 뒤
    d.undo.redo();
    expect(d.dirty).toBe(false);
  });

  it("되돌리기 한도에 걸린 뒤에도 새 편집은 dirty 이고, 끝까지 되돌려도 로드 시점과 다르다", async () => {
    const t = { v: 0 };
    const full = new TestDoc();
    for (let i = 1; i <= 200; i++) full.apply(setValue(t, i));
    await full.save();
    full.apply(setValue(t, 201));
    expect(full.undo.depth).toBe(200);
    expect(full.dirty).toBe(true);
    full.undo.undo();
    expect(full.dirty).toBe(false);

    const evicted = new TestDoc();
    for (let i = 1; i <= 201; i++) evicted.apply(setValue(t, i));
    while (evicted.undo.undo());
    expect(evicted.undo.depth).toBe(0);
    expect(evicted.dirty).toBe(true); // 첫 명령은 버려져 되돌릴 수 없다
  });

  it("버려진 명령 뒤에서 저장했으면 끝까지 되돌려 그 상태로 오면 깨끗", async () => {
    const t = { v: 0 };
    const d = new TestDoc();
    d.apply(setValue(t, 1));
    await d.save();
    for (let i = 2; i <= 201; i++) d.apply(setValue(t, i));
    expect(d.dirty).toBe(true);
    while (d.undo.undo());
    expect(t.v).toBe(1);
    expect(d.dirty).toBe(false);
  });

  it("clear는 새 상태이므로 markSaved 전까지 dirty", () => {
    const d = new TestDoc();
    d.undo.clear();
    expect(d.dirty).toBe(true);
    d.markSaved();
    expect(d.dirty).toBe(false);
  });

  it("markDirty 는 되돌리기와 무관하게 dirty", async () => {
    const d = new TestDoc();
    d.markDirty();
    expect(d.dirty).toBe(true);
    await d.save();
    expect(d.dirty).toBe(false);
  });
});

describe("SceneDocument 저장", () => {
  it("쓰는 동안 들어온 편집은 저장 뒤에도 dirty", async () => {
    const be = new MemoryBackend({ "resources/scenes/x.json": '{"version": 1, "objects": []}' });
    await be.open("/mem");
    const doc = await SceneDocument.open(be, "resources/scenes/x.json", () => new Set(["node", "sprite"]));
    doc.apply(doc.scene.addObject(makeObject("node", "a", {})));
    let release!: () => void;
    const write = be.writeText.bind(be);
    be.writeText = async (rel, text) => {
      await new Promise<void>((r) => (release = r));
      return write(rel, text);
    };
    const saving = doc.save();
    await Promise.resolve();
    doc.apply(doc.scene.addObject(makeObject("sprite", "b", CORE_DEFAULT_PROPS.sprite)));
    release();
    await saving;
    expect(doc.dirty).toBe(true);
    expect(await be.readText("resources/scenes/x.json")).not.toContain('"b"');
  });
});

describe("다시 읽기 실패", () => {
  it("실패하면 이유를 남기고 저장을 막으며, 덮어쓰기를 고르면 저장된다", async () => {
    const d = new TestDoc();
    d.reloadFails = "JSON 이 아니다";
    await expect(d.reloadFromDisk()).rejects.toThrow("JSON 이 아니다");
    expect(d.externallyChanged).toBe(true);
    expect(d.reloadError).toBe("JSON 이 아니다");
    expect(d.saveBlocked).toBe(true);
    expect(d.dirty).toBe(false); // 다음 외부 변경에도 다시 읽기를 시도한다
    await expect(d.save()).rejects.toThrow(/저장을 막았다/);
    expect(d.saved).toBe(0);
    d.allowOverwrite();
    expect(d.saveBlocked).toBe(false);
    expect(d.externallyChanged).toBe(false);
    expect(d.dirty).toBe(true);
    await d.save();
    expect(d.saved).toBe(1);
    expect(d.dirty).toBe(false);
  });

  it("다시 읽기에 성공하면 막힘이 풀린다", async () => {
    const d = new TestDoc();
    d.reloadFails = "모르는 맵 버전이다: 3";
    await expect(d.reloadFromDisk()).rejects.toThrow();
    d.reloadFails = null;
    await d.reloadFromDisk();
    expect(d.saveBlocked).toBe(false);
    expect(d.externallyChanged).toBe(false);
    await d.save();
    expect(d.saved).toBe(1);
  });

  it("씬 파일을 다시 읽지 못하면 저장이 디스크를 덮어쓰지 않는다", async () => {
    const be = new MemoryBackend({ "resources/scenes/x.json": '{"version": 1, "objects": []}' });
    await be.open("/mem");
    const doc = await SceneDocument.open(be, "resources/scenes/x.json", () => new Set(["node"]));
    const broken = '{"version": 1, "objects": [{"id": "hand" "type": "node"}]}';
    be.simulateExternalChange("resources/scenes/x.json", "modify", broken);
    await expect(doc.reloadFromDisk()).rejects.toThrow();
    expect(doc.saveBlocked).toBe(true);
    doc.apply(doc.scene.addObject(makeObject("node", "mine", {})));
    await expect(doc.save()).rejects.toThrow(/저장을 막았다/);
    expect(await be.readText("resources/scenes/x.json")).toBe(broken);
  });
});

describe("DocumentRegistry", () => {
  it("같은 경로는 한 번만 열리고, 닫으면 이웃이 활성이 된다", () => {
    const r = new DocumentRegistry();
    const a = r.open(new TestDoc());
    const b = new TestDoc();
    b.path = "b.txt";
    r.open(b);
    expect(r.documents.length).toBe(2);
    expect(r.active).toBe(b);
    expect(r.open(new TestDoc())).toBe(a);
    expect(r.active).toBe(a);
    r.close(a);
    expect(r.active).toBe(b);
    r.close(b);
    expect(r.active).toBe(null);
  });
});
