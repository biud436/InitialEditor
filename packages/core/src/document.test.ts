import { describe, expect, it } from "vitest";
import { type Command, Document, DocumentRegistry, UndoStack } from "./document";

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
  constructor() {
    super("test", "a.txt", "a.txt");
  }
  async save() {
    this.saved++;
    this.markSaved();
  }
  async reload() {
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

  it("markDirty 는 되돌리기와 무관하게 dirty", async () => {
    const d = new TestDoc();
    d.markDirty();
    expect(d.dirty).toBe(true);
    await d.save();
    expect(d.dirty).toBe(false);
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
