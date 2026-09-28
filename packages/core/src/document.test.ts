import { describe, expect, it } from "vitest";
import { BackendError } from "./backend";
import { type Command, Document, DocumentRegistry, ReloadFailedError, type SaveConflict, type SaveConflictChoice, type SaveGuard, UndoStack } from "./document";
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

  it("바꾸는 것이 없는 명령(unchanged)은 실행하지도 쌓지도 않아 dirty가 되지 않는다", () => {
    const d = new TestDoc();
    const t = { v: 0 };
    let ran = 0;
    d.apply({ label: "그대로", unchanged: true, execute: () => void ran++, undo: () => {} });
    expect([ran, d.undo.depth, d.dirty, d.undo.canRedo]).toEqual([0, 0, false, false]);
    d.apply(setValue(t, 1, "typing"));
    const id = d.undo.stateId;
    // 같은 키의 합치기 자리에서도 버린다 (상태 id가 그대로다)
    d.apply({ ...setValue(t, 1, "typing"), unchanged: true });
    expect([t.v, d.undo.depth, d.undo.stateId]).toEqual([1, 1, id]);
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
    await expect(d.save()).rejects.toThrow(/다시 읽기 실패로 저장 차단/);
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
    await expect(doc.save()).rejects.toThrow(/다시 읽기 실패로 저장 차단/);
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

// 저장 직전 확인 (03-project-and-runtime.md 파일 규칙 4): 파일이 밖에서 바뀌었으면 모달로 묻는다
describe("저장 충돌", () => {
  const PATH = "resources/scenes/x.json";
  const DISK = '{"version": 1, "objects": []}';

  /** 묻는 것을 기록하고 정해 둔 답을 차례로 준다 */
  function guardFor(be: MemoryBackend, answers: { choices?: SaveConflictChoice[]; discard?: boolean[] } = {}) {
    const asked: SaveConflict[] = [];
    const discards: string[] = [];
    const choices = [...(answers.choices ?? [])];
    const discard = [...(answers.discard ?? [])];
    const guard: SaveGuard = {
      readText: (p) => be.readText(p),
      askConflict: async (_doc, conflict) => {
        asked.push(conflict);
        return choices.shift() ?? "cancel";
      },
      confirmDiscard: async (doc) => {
        discards.push(doc.title);
        return discard.shift() ?? false;
      },
    };
    return { guard, asked, discards };
  }

  async function openScene(text = DISK) {
    const be = new MemoryBackend({ [PATH]: text });
    await be.open("/mem");
    const doc = await SceneDocument.open(be, PATH, () => new Set(["node"]));
    doc.apply(doc.scene.addObject(makeObject("node", "mine", {})));
    return { be, doc };
  }

  const OUTSIDE = '{"version": 1, "objects": [{"id": "outside", "type": "node", "x": 0, "y": 0}]}';

  it("디스크가 연 때와 같으면 묻지 않고 저장하고, 저장한 뒤 다시 저장해도 묻지 않는다", async () => {
    const { be, doc } = await openScene();
    const { guard, asked } = guardFor(be);
    expect(await doc.saveChecked(guard)).toBe("saved");
    expect(await be.readText(PATH)).toContain('"mine"');
    doc.apply(doc.scene.addObject(makeObject("node", "second", {})));
    expect(await doc.saveChecked(guard)).toBe("saved");
    expect(asked).toEqual([]);
  });

  it("알림이 오기 전이라도 저장 직전에 디스크가 바뀌었으면 묻고, 취소하면 디스크와 내 수정을 둔다", async () => {
    const { be, doc } = await openScene();
    // 알림 없이 바뀐 디스크 (감시가 아직 알리지 않았다)
    await be.writeText(PATH, OUTSIDE);
    expect(doc.externallyChanged).toBe(false);
    const { guard, asked } = guardFor(be, { choices: ["cancel"] });
    expect(await doc.saveChecked(guard)).toBe("cancelled");
    expect(asked).toEqual([{ kind: "changed" }]);
    expect(await be.readText(PATH)).toBe(OUTSIDE);
    expect(doc.dirty).toBe(true);
    expect(doc.scene.objects.map((o) => o.id)).toEqual(["mine"]);
  });

  it("덮어쓰기는 내 것을 쓰고 배너를 거두며, 그 뒤의 저장은 다시 묻지 않는다", async () => {
    const { be, doc } = await openScene();
    be.simulateExternalChange(PATH, "modify", OUTSIDE);
    doc.externallyChanged = true; // 수정 중이라 에디터가 배너를 띄운 상태
    const { guard, asked } = guardFor(be, { choices: ["overwrite"] });
    expect(await doc.saveChecked(guard)).toBe("saved");
    expect(asked).toEqual([{ kind: "changed" }]);
    expect(JSON.parse(await be.readText(PATH)).objects.map((o: { id: string }) => o.id)).toEqual(["mine"]);
    expect(doc.dirty).toBe(false);
    expect(doc.externallyChanged).toBe(false);
    doc.apply(doc.scene.addObject(makeObject("node", "later", {})));
    expect(await doc.saveChecked(guard)).toBe("saved");
    expect(asked).toHaveLength(1);
  });

  it("다시 읽기는 수정 중이면 한 번 더 묻고, 거절하면 취소, 받아들이면 디스크 내용으로 바꾼다", async () => {
    const { be, doc } = await openScene();
    be.simulateExternalChange(PATH, "modify", OUTSIDE);
    const { guard, asked, discards } = guardFor(be, { choices: ["reload", "reload"], discard: [false, true] });
    expect(await doc.saveChecked(guard)).toBe("cancelled");
    expect(discards).toEqual(["x.json"]);
    expect(doc.dirty).toBe(true);
    expect(doc.scene.objects.map((o) => o.id)).toEqual(["mine"]);
    expect(await be.readText(PATH)).toBe(OUTSIDE);

    expect(await doc.saveChecked(guard)).toBe("reloaded");
    expect(asked).toHaveLength(2);
    expect(discards).toHaveLength(2);
    expect(doc.scene.objects.map((o) => o.id)).toEqual(["outside"]);
    expect(doc.dirty).toBe(false);
    expect(await be.readText(PATH)).toBe(OUTSIDE);
    // 다시 읽은 내용이 새 기준이다
    doc.apply(doc.scene.addObject(makeObject("node", "after", {})));
    expect(await doc.saveChecked(guard)).toBe("saved");
    expect(asked).toHaveLength(2);
  });

  it("수정 중이 아니면 다시 읽기를 한 번 더 묻지 않는다", async () => {
    const { be, doc } = await openScene();
    await doc.save();
    expect(doc.dirty).toBe(false);
    be.simulateExternalChange(PATH, "modify", OUTSIDE);
    const { guard, discards } = guardFor(be, { choices: ["reload"] });
    expect(await doc.saveChecked(guard)).toBe("reloaded");
    expect(discards).toEqual([]);
    expect(doc.scene.objects.map((o) => o.id)).toEqual(["outside"]);
  });

  it("내용이 같은 외부 변경은 배너가 떠 있어도 묻지 않는다", async () => {
    const { be, doc } = await openScene();
    be.simulateExternalChange(PATH, "modify", DISK);
    doc.externallyChanged = true;
    const { guard, asked } = guardFor(be);
    expect(await doc.saveChecked(guard)).toBe("saved");
    expect(asked).toEqual([]);
    expect(doc.externallyChanged).toBe(false);
  });

  it("지워진 파일은 missing으로 묻고, 덮어쓰면 다시 만든다", async () => {
    const { be, doc } = await openScene();
    be.simulateExternalChange(PATH, "delete");
    const { guard, asked } = guardFor(be, { choices: ["cancel", "overwrite"] });
    expect(await doc.saveChecked(guard)).toBe("cancelled");
    expect(await be.exists(PATH)).toBe(false);
    expect(await doc.saveChecked(guard)).toBe("saved");
    expect(asked).toEqual([{ kind: "missing" }, { kind: "missing" }]);
    expect(await be.readText(PATH)).toContain('"mine"');
  });

  it("다시 읽지 못한 문서는 unreadable로 이유와 함께 묻고, 덮어쓰기를 고르면 막힘을 풀고 쓴다", async () => {
    const { be, doc } = await openScene();
    const broken = '{"version": 1, "objects": [';
    be.simulateExternalChange(PATH, "modify", broken);
    await expect(doc.reloadFromDisk()).rejects.toThrow();
    const reason = doc.reloadError!;
    const { guard, asked } = guardFor(be, { choices: ["cancel", "overwrite"] });
    expect(await doc.saveChecked(guard)).toBe("cancelled");
    expect(await be.readText(PATH)).toBe(broken);
    expect(doc.saveBlocked).toBe(true);
    expect(await doc.saveChecked(guard)).toBe("saved");
    expect(asked).toEqual([
      { kind: "unreadable", reason },
      { kind: "unreadable", reason },
    ]);
    expect(doc.saveBlocked).toBe(false);
    expect(JSON.parse(await be.readText(PATH)).objects.map((o: { id: string }) => o.id)).toEqual(["mine"]);
  });

  it("모달의 다시 읽기가 실패하면 ReloadFailedError로 이유를 던지고, 배너와 저장 막힘이 남으며 내 수정은 그대로다", async () => {
    const { be, doc } = await openScene();
    const broken = "{ broken";
    be.simulateExternalChange(PATH, "modify", broken);
    const { guard } = guardFor(be, { choices: ["reload"], discard: [true] });
    const error = await doc.saveChecked(guard).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ReloadFailedError);
    const reason = (error as ReloadFailedError).reason;
    expect(reason).toContain("JSON");
    expect((error as Error).message).toBe(`다시 읽기 실패: ${reason}`);
    expect(doc.reloadError).toBe(reason);
    expect(doc.externallyChanged).toBe(true);
    expect(doc.saveBlocked).toBe(true);
    expect(doc.dirty).toBe(true);
    expect(doc.scene.objects.map((o) => o.id)).toEqual(["mine"]);
    expect(await be.readText(PATH)).toBe(broken);
  });

  it("묻기를 마치고 쓰기나 다시 읽기를 시작할 때 acting을 한 번 부르고, 취소면 부르지 않는다", async () => {
    const { be, doc } = await openScene();
    const steps: string[] = [];
    const write = be.writeText.bind(be);
    be.writeText = async (p, text) => {
      steps.push("write");
      return write(p, text);
    };
    const acting = () => void steps.push("acting");
    const { guard } = guardFor(be, { choices: ["cancel", "overwrite", "reload"], discard: [true] });
    const ask = guard.askConflict;
    guard.askConflict = async (d, c) => {
      steps.push("ask");
      return ask(d, c);
    };
    // 충돌이 없으면 확인 뒤 바로 쓴다
    expect(await doc.saveChecked(guard, { acting })).toBe("saved");
    expect(steps).toEqual(["acting", "write"]);
    // 취소면 쓰지 않고 부르지 않는다
    steps.length = 0;
    be.simulateExternalChange(PATH, "modify", OUTSIDE);
    doc.apply(doc.scene.addObject(makeObject("node", "second", {})));
    expect(await doc.saveChecked(guard, { acting })).toBe("cancelled");
    expect(steps).toEqual(["ask"]);
    // 덮어쓰기: 고른 뒤에 부르고 쓴다
    steps.length = 0;
    expect(await doc.saveChecked(guard, { acting })).toBe("saved");
    expect(steps).toEqual(["ask", "acting", "write"]);
    // 다시 읽기: 버리기를 확인한 뒤에 부른다
    steps.length = 0;
    be.simulateExternalChange(PATH, "modify", OUTSIDE);
    doc.apply(doc.scene.addObject(makeObject("node", "third", {})));
    expect(await doc.saveChecked(guard, { acting })).toBe("reloaded");
    expect(steps).toEqual(["ask", "acting"]);
  });

  it("배너의 편집 내용으로 덮어쓰기(allowOverwrite) 뒤의 저장은 묻지 않고 쓴다", async () => {
    const { be, doc } = await openScene();
    be.simulateExternalChange(PATH, "modify", '{"version": 1, "objects": [');
    await expect(doc.reloadFromDisk()).rejects.toThrow();
    doc.allowOverwrite();
    const { guard, asked } = guardFor(be);
    expect(await doc.saveChecked(guard)).toBe("saved");
    expect(asked).toEqual([]);
    expect(await be.readText(PATH)).toContain('"mine"');
  });

  it("덮어쓰기를 고른 뒤 다시 읽기에 실패하면 다시 묻는다", async () => {
    const { be, doc } = await openScene();
    doc.allowOverwrite();
    be.simulateExternalChange(PATH, "modify", "{");
    await expect(doc.reloadFromDisk()).rejects.toThrow();
    const { guard, asked } = guardFor(be, { choices: ["cancel"] });
    expect(await doc.saveChecked(guard)).toBe("cancelled");
    expect(asked.map((c) => c.kind)).toEqual(["unreadable"]);
  });

  it("디스크를 읽지 못하면 저장하지 않고 이유를 던진다", async () => {
    const { be, doc } = await openScene();
    const guard: SaveGuard = {
      readText: async () => {
        throw new BackendError("연결이 끊겼다", "network");
      },
      askConflict: async () => "overwrite",
      confirmDiscard: async () => true,
    };
    await expect(doc.saveChecked(guard)).rejects.toThrow("디스크의 파일 확인 실패로 저장 중단: 연결이 끊겼다");
    expect(await be.readText(PATH)).toBe(DISK);
    expect(doc.dirty).toBe(true);
  });

  it("디스크와 맞춘 내용을 모르는 문서는 배너만 보고, 없는 파일은 새로 만든다", async () => {
    const be = new MemoryBackend();
    await be.open("/mem");
    const doc = new TestDoc();
    const { guard, asked } = guardFor(be, { choices: ["cancel"] });
    expect(await doc.findSaveConflict((p) => be.readText(p))).toBeNull();
    await be.writeText("a.txt", "밖");
    expect(await doc.findSaveConflict((p) => be.readText(p))).toBeNull();
    doc.externallyChanged = true;
    expect(await doc.saveChecked(guard)).toBe("cancelled");
    expect(asked).toEqual([{ kind: "changed" }]);
    expect(doc.saved).toBe(0);
    doc.noteDiskText("밖");
    expect(await doc.findSaveConflict((p) => be.readText(p))).toBeNull();
  });

  it("경로가 없는 문서는 확인하지 않는다", async () => {
    const doc = new TestDoc();
    doc.path = null;
    doc.externallyChanged = true;
    expect(await doc.findSaveConflict(() => Promise.reject(new Error("읽으면 안 된다")))).toBeNull();
  });
});
