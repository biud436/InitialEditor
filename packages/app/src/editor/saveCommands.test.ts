import { Document, MemoryBackend, type SaveConflictChoice, type SaveGuard, type SaveOutcome } from "@initial-editor/core";
import { describe, expect, it } from "vitest";
import { createDocumentSaver, saveActiveDocument, saveAllDocuments, saveAllMessage, type SaveHost } from "./saveCommands";

class Doc extends Document {
  constructor(title: string) {
    super("test", title, title);
    this.markDirty();
  }
  async save() {}
  async reload() {}
}

/** 문서 제목마다 정한 결과(또는 오류)를 돌려주는 호스트 */
function host(docs: Doc[], outcomes: Record<string, SaveOutcome | Error>, active: Doc | null = docs[0] ?? null) {
  const toasts: string[] = [];
  const calls: string[] = [];
  const toast = (level: string) => (text: string) => void toasts.push(`${level}: ${text}`);
  const h: SaveHost = {
    documents: { active, dirtyDocuments: docs },
    toasts: { success: toast("success"), info: toast("info"), error: toast("error") },
    saveDocument: async (d) => {
      calls.push(d.title);
      const r = outcomes[d.title];
      if (r instanceof Error) throw r;
      return r;
    },
  };
  return { h, toasts, calls };
}

describe("파일 > 저장", () => {
  it("저장하면 성공, 다시 읽었으면 안내, 취소면 조용히, 실패면 오류를 띄운다", async () => {
    const a = new Doc("a.lua");
    for (const [outcome, toast] of [
      ["saved", ["success: 저장했다: a.lua"]],
      ["reloaded", ["info: 저장하지 않고 디스크 내용으로 다시 읽었다: a.lua"]],
      ["cancelled", []],
    ] as const) {
      const { h, toasts } = host([a], { "a.lua": outcome });
      expect(await saveActiveDocument(h)).toBe(outcome);
      expect(toasts).toEqual(toast);
    }
    const { h, toasts } = host([a], { "a.lua": new Error("디스크가 가득 찼다") });
    expect(await saveActiveDocument(h)).toBeNull();
    expect(toasts).toEqual(["error: a.lua을(를) 저장하지 못했다: 디스크가 가득 찼다"]);
  });

  it("활성 문서가 없으면 아무것도 하지 않는다", async () => {
    const { h, toasts, calls } = host([], {}, null);
    expect(await saveActiveDocument(h)).toBeNull();
    expect(calls).toEqual([]);
    expect(toasts).toEqual([]);
  });
});

describe("파일 > 모두 저장", () => {
  it("모두 저장하면 수를 알린다", async () => {
    const docs = [new Doc("a.lua"), new Doc("b.json")];
    const { h, toasts, calls } = host(docs, { "a.lua": "saved", "b.json": "saved" });
    const r = await saveAllDocuments(h);
    expect(calls).toEqual(["a.lua", "b.json"]);
    expect(r.saved).toEqual(["a.lua", "b.json"]);
    expect(toasts).toEqual(["success: 2개 문서를 저장했다"]);
  });

  it("충돌 모달에서 취소한 문서는 건너뛰고 나머지를 이어 저장하며, 다시 읽은 것과 저장하지 않은 것을 알린다", async () => {
    const docs = [new Doc("main.json"), new Doc("main.lua"), new Doc("forest.json")];
    const { h, toasts, calls } = host(docs, { "main.json": "cancelled", "main.lua": "saved", "forest.json": "reloaded" });
    const r = await saveAllDocuments(h);
    expect(calls).toEqual(["main.json", "main.lua", "forest.json"]);
    expect(r).toEqual({ saved: ["main.lua"], reloaded: ["forest.json"], cancelled: ["main.json"], failed: [] });
    expect(toasts).toEqual(["info: 1개 문서를 저장했다. 다시 읽은 것: forest.json. 저장하지 않은 것: main.json"]);
  });

  it("실패가 있으면 오류로 이유와 함께 알린다", async () => {
    const docs = [new Doc("a.lua"), new Doc("b.json"), new Doc("c.json")];
    const { h, toasts } = host(docs, { "a.lua": "saved", "b.json": new Error("쓰지 못했다"), "c.json": "cancelled" });
    await saveAllDocuments(h);
    expect(toasts).toEqual(["error: 1개를 저장했고 1개는 저장하지 못했다: b.json (쓰지 못했다). 저장하지 않은 것: c.json"]);
  });

  it("문구만 따로: 아무것도 저장하지 않고 취소만 했으면 안내다", () => {
    expect(saveAllMessage({ saved: [], reloaded: [], cancelled: ["a.lua"], failed: [] })).toEqual({ level: "info", text: "0개 문서를 저장했다. 저장하지 않은 것: a.lua" });
  });
});

/** 글 하나를 디스크에 쓰고 읽는 문서 */
class FileDoc extends Document {
  text = "mine";
  constructor(private readonly backend: MemoryBackend) {
    super("test", "notes.txt", "notes.txt");
  }
  async save(): Promise<void> {
    this.assertCanSave();
    await this.backend.writeText("notes.txt", this.text);
    this.noteDiskText(this.text);
    this.markSaved();
  }
  async reload(): Promise<void> {
    this.text = await this.backend.readText("notes.txt");
    this.noteDiskText(this.text);
    this.markSaved();
  }
}

/** 충돌을 물으면 기다렸다가 answer로 답하는 확인 */
async function saverSetup() {
  const backend = new MemoryBackend({ "notes.txt": "disk" });
  await backend.open("/mem");
  const doc = new FileDoc(backend);
  doc.noteDiskText("disk");
  doc.markDirty();
  const asked: string[] = [];
  const pending: Array<(c: SaveConflictChoice) => void> = [];
  let discard = true;
  const guard: SaveGuard = {
    readText: (p) => backend.readText(p),
    askConflict: (_doc, conflict) => {
      asked.push(conflict.kind);
      return new Promise((resolve) => pending.push(resolve));
    },
    confirmDiscard: async () => discard,
  };
  const saved: Document[] = [];
  const logs: string[] = [];
  const save = createDocumentSaver({ guard, onSaved: (d) => void saved.push(d), log: { info: (_s, text) => void logs.push(text) } });
  const answer = async (c: SaveConflictChoice) => {
    // 디스크를 읽고 물을 때까지 기다린다
    for (let i = 0; i < 50 && pending.length === 0; i++) await Promise.resolve();
    pending.shift()!(c);
  };
  return { backend, doc, asked, saved, logs, save, answer, setDiscard: (v: boolean) => (discard = v) };
}

describe("문서 저장 (Editor.saveDocument)", () => {
  it("디스크가 그대로면 묻지 않고 저장하고 onSaved를 부른다", async () => {
    const t = await saverSetup();
    expect(await t.save(t.doc)).toBe("saved");
    expect(t.asked).toEqual([]);
    expect(await t.backend.readText("notes.txt")).toBe("mine");
    expect(t.saved).toEqual([t.doc]);
  });

  it("같은 문서의 저장이 겹치면 한 번만 묻고 같은 결과를 함께 받는다. 끝나면 다음 저장은 새로 묻는다", async () => {
    const t = await saverSetup();
    await t.backend.writeText("notes.txt", "outside");
    const first = t.save(t.doc);
    const second = t.save(t.doc);
    expect(second).toBe(first);
    await t.answer("cancel");
    expect(await Promise.all([first, second])).toEqual(["cancelled", "cancelled"]);
    expect(t.asked).toEqual(["changed"]);
    expect(await t.backend.readText("notes.txt")).toBe("outside");
    expect(t.saved).toEqual([]);
    expect(t.logs).toEqual(["저장을 취소했다: notes.txt"]);

    const third = t.save(t.doc);
    expect(third).not.toBe(first);
    await t.answer("overwrite");
    expect(await third).toBe("saved");
    expect(t.asked).toEqual(["changed", "changed"]);
    expect(await t.backend.readText("notes.txt")).toBe("mine");
    expect(t.saved).toEqual([t.doc]);
  });

  it("다른 문서의 저장은 따로 묻는다", async () => {
    const t = await saverSetup();
    const other = new FileDoc(t.backend);
    other.noteDiskText("disk");
    other.markDirty();
    await t.backend.writeText("notes.txt", "outside");
    const a = t.save(t.doc);
    const b = t.save(other);
    expect(b).not.toBe(a);
    await t.answer("cancel");
    await t.answer("cancel");
    expect(await Promise.all([a, b])).toEqual(["cancelled", "cancelled"]);
    expect(t.asked).toEqual(["changed", "changed"]);
  });

  it("다시 읽기는 디스크 내용으로 바꾸고 onSaved 대신 콘솔에 남긴다. 버리기를 거절하면 취소다", async () => {
    const t = await saverSetup();
    await t.backend.writeText("notes.txt", "outside");
    t.setDiscard(false);
    const declined = t.save(t.doc);
    await t.answer("reload");
    expect(await declined).toBe("cancelled");
    expect(t.doc.text).toBe("mine");

    t.setDiscard(true);
    const reloaded = t.save(t.doc);
    await t.answer("reload");
    expect(await reloaded).toBe("reloaded");
    expect(t.doc.text).toBe("outside");
    expect(t.doc.dirty).toBe(false);
    expect(t.saved).toEqual([]);
    expect(t.logs).toEqual(["저장을 취소했다: notes.txt", "저장하지 않고 디스크 내용으로 다시 읽었다: notes.txt"]);
  });

  it("저장이 실패하면 오류가 그대로 오고, 다음 저장은 다시 시도한다", async () => {
    const t = await saverSetup();
    const broken = new FileDoc(t.backend);
    broken.save = async () => {
      throw new Error("디스크가 가득 찼다");
    };
    broken.noteDiskText("disk");
    await expect(t.save(broken)).rejects.toThrow("디스크가 가득 찼다");
    await expect(t.save(broken)).rejects.toThrow("디스크가 가득 찼다");
    expect(t.saved).toEqual([]);
  });
});
