import { Document, MemoryBackend, ReloadFailedError, type SaveConflictChoice, type SaveGuard, type SaveOutcome } from "@initial-editor/core";
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

  it("충돌 모달의 다시 읽기가 실패하면 저장 실패가 아니라 다시 읽지 못했다고 알린다", async () => {
    const a = new Doc("field.json");
    const { h, toasts } = host([a], { "field.json": new ReloadFailedError("JSON 이 아니다: Expected property name") });
    expect(await saveActiveDocument(h)).toBeNull();
    expect(toasts).toEqual(["error: 다시 읽지 못했다: JSON 이 아니다: Expected property name"]);
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
    expect(r).toEqual({ saved: ["main.lua"], reloaded: ["forest.json"], cancelled: ["main.json"], failed: [], reloadFailed: [] });
    expect(toasts).toEqual(["info: 1개 문서를 저장했다. 다시 읽은 것: forest.json. 저장하지 않은 것: main.json"]);
  });

  it("실패가 있으면 오류로 이유와 함께 알린다", async () => {
    const docs = [new Doc("a.lua"), new Doc("b.json"), new Doc("c.json")];
    const { h, toasts } = host(docs, { "a.lua": "saved", "b.json": new Error("쓰지 못했다"), "c.json": "cancelled" });
    await saveAllDocuments(h);
    expect(toasts).toEqual(["error: 1개를 저장했고 1개는 저장하지 못했다: b.json (쓰지 못했다). 저장하지 않은 것: c.json"]);
  });

  it("다시 읽기에 실패한 문서는 저장 실패와 따로 오류로 알린다", async () => {
    const docs = [new Doc("a.lua"), new Doc("field.json")];
    const { h, toasts } = host(docs, { "a.lua": "saved", "field.json": new ReloadFailedError("JSON 이 아니다") });
    const r = await saveAllDocuments(h);
    expect(r).toEqual({ saved: ["a.lua"], reloaded: [], cancelled: [], failed: [], reloadFailed: ["field.json (JSON 이 아니다)"] });
    expect(toasts).toEqual(["error: 1개 문서를 저장했다. 다시 읽지 못한 것: field.json (JSON 이 아니다)"]);
  });

  it("문구만 따로: 아무것도 저장하지 않고 취소만 했으면 안내다", () => {
    expect(saveAllMessage({ saved: [], reloaded: [], cancelled: ["a.lua"], failed: [], reloadFailed: [] })).toEqual({ level: "info", text: "0개 문서를 저장했다. 저장하지 않은 것: a.lua" });
  });
});

/** 글 하나를 디스크에 쓰고 읽는 문서 */
class FileDoc extends Document {
  text = "mine";
  constructor(private readonly backend: MemoryBackend) {
    super("test", "notes.txt", "notes.txt");
  }
  /** 되돌리기 스택을 지나는 편집 (쓰는 동안의 편집이 dirty로 남는다) */
  edit(text: string): void {
    const before = this.text;
    this.apply({
      label: "글 고치기",
      execute: () => void (this.text = text),
      undo: () => void (this.text = before),
    });
  }
  /** 실제 문서처럼 쓰기 전에 내용과 상태를 잡아 둔다 */
  async save(): Promise<void> {
    this.assertCanSave();
    const state = this.undo.stateId;
    const text = this.text;
    await this.backend.writeText("notes.txt", text);
    this.noteDiskText(text);
    this.markSaved(state);
  }
  async reload(): Promise<void> {
    const text = await this.backend.readText("notes.txt");
    if (text.startsWith("{ broken")) throw new Error("JSON 이 아니다");
    this.text = text;
    this.noteDiskText(this.text);
    this.markSaved();
  }
}

/** 한 번 막아 두었다가 풀어 주는 문 */
function gate() {
  let open!: () => void;
  const opened = new Promise<void>((r) => (open = r));
  return { opened, open };
}

/** 조건이 맞을 때까지 기다린다 */
async function until(check: () => boolean) {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 0));
  expect(check()).toBe(true);
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
  const save = createDocumentSaver({
    guard,
    onSaved: (d) => void saved.push(d),
    log: { info: (_s, text) => void logs.push(text), error: (_s, text) => void logs.push(`error: ${text}`) },
  });
  const answer = async (c: SaveConflictChoice) => {
    // 디스크를 읽고 물을 때까지 기다린다
    for (let i = 0; i < 50 && pending.length === 0; i++) await Promise.resolve();
    pending.shift()!(c);
  };
  return { backend, doc, guard, asked, saved, logs, save, answer, setDiscard: (v: boolean) => (discard = v) };
}

/** 디스크에 쓰는 것을 세고, block이면 풀어 줄 때까지 쓰기를 붙잡는다 */
function holdWrites(backend: MemoryBackend) {
  const write = backend.writeText.bind(backend);
  const writes: string[] = [];
  let hold: ReturnType<typeof gate> | null = null;
  backend.writeText = async (path, text) => {
    writes.push(text);
    const h = hold;
    if (h) await h.opened;
    return write(path, text);
  };
  return {
    writes,
    block: () => (hold = gate()),
    release: () => {
      hold?.open();
      hold = null;
    },
  };
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

  it("디스크를 확인하는 중에 들어온 저장은 합쳐서 최신 내용을 한 번 쓴다 (아직 쓰기 전이다)", async () => {
    const t = await saverSetup();
    const reading = gate();
    const read = t.guard.readText;
    t.guard.readText = async (p) => {
      await reading.opened;
      return read(p);
    };
    const w = holdWrites(t.backend);
    const first = t.save(t.doc);
    t.doc.edit("mine 2");
    const second = t.save(t.doc);
    expect(second).toBe(first);
    reading.open();
    expect(await Promise.all([first, second])).toEqual(["saved", "saved"]);
    expect(w.writes).toEqual(["mine 2"]);
    expect(await t.backend.readText("notes.txt")).toBe("mine 2");
    expect(t.saved).toEqual([t.doc]);
  });

  it("쓰는 중에 들어온 저장은 그 쓰기를 기다렸다가 최신 내용으로 한 번 더 쓴다. 그동안의 저장은 하나로 모은다", async () => {
    const t = await saverSetup();
    const w = holdWrites(t.backend);
    w.block();
    const first = t.save(t.doc);
    await until(() => w.writes.length === 1);
    // 쓰는 중에 고치고 두 번 더 저장한다
    t.doc.edit("mine 2");
    const second = t.save(t.doc);
    const third = t.save(t.doc);
    expect(second).not.toBe(first);
    expect(third).toBe(second);
    expect(w.writes).toEqual(["mine"]);
    w.release();
    expect(await first).toBe("saved");
    // 먼저 끝난 저장은 쓰기 전의 내용만 썼으므로 아직 dirty다
    expect(t.doc.dirty).toBe(true);
    expect(await second).toBe("saved");
    expect(await third).toBe("saved");
    expect(w.writes).toEqual(["mine", "mine 2"]);
    expect(await t.backend.readText("notes.txt")).toBe("mine 2");
    expect(t.doc.dirty).toBe(false);
    // 저장했다는 알림은 실제로 쓴 저장마다 하나다
    expect(t.saved).toEqual([t.doc, t.doc]);
    expect(t.asked).toEqual([]);
  });

  it("덮어쓰기를 고른 뒤 쓰는 중에 들어온 저장도 기다렸다가 다시 쓰고, 방금 쓴 내용이 기준이라 다시 묻지 않는다", async () => {
    const t = await saverSetup();
    await t.backend.writeText("notes.txt", "outside");
    const w = holdWrites(t.backend);
    w.block();
    const first = t.save(t.doc);
    // 모달이 떠 있는 동안의 저장은 합친다
    expect(t.save(t.doc)).toBe(first);
    await t.answer("overwrite");
    await until(() => w.writes.length === 1);
    t.doc.edit("mine 2");
    const second = t.save(t.doc);
    expect(second).not.toBe(first);
    w.release();
    expect(await Promise.all([first, second])).toEqual(["saved", "saved"]);
    expect(t.asked).toEqual(["changed"]);
    expect(w.writes).toEqual(["mine", "mine 2"]);
    expect(await t.backend.readText("notes.txt")).toBe("mine 2");
  });

  it("쓰기가 실패해도 기다리던 저장은 다시 시도한다", async () => {
    const t = await saverSetup();
    const write = t.backend.writeText.bind(t.backend);
    const writes: string[] = [];
    const hold = gate();
    // 첫 쓰기는 붙잡았다가 쓰지 못하고 실패한다
    t.backend.writeText = async (p, text) => {
      writes.push(text);
      if (writes.length === 1) {
        await hold.opened;
        throw new Error("디스크가 가득 찼다");
      }
      return write(p, text);
    };
    const first = t.save(t.doc);
    await until(() => writes.length === 1);
    const second = t.save(t.doc);
    hold.open();
    await expect(first).rejects.toThrow("디스크가 가득 찼다");
    expect(await second).toBe("saved");
    expect(writes).toEqual(["mine", "mine"]);
    expect(await t.backend.readText("notes.txt")).toBe("mine");
    expect(t.saved).toEqual([t.doc]);
  });

  it("다시 읽는 중에 들어온 저장은 다시 읽기가 끝난 뒤 저장한다", async () => {
    const t = await saverSetup();
    await t.backend.writeText("notes.txt", "outside");
    const reading = gate();
    const reload = t.doc.reload.bind(t.doc);
    t.doc.reload = async () => {
      await reading.opened;
      return reload();
    };
    const first = t.save(t.doc);
    await t.answer("reload");
    await until(() => t.save(t.doc) !== first);
    const second = t.save(t.doc);
    reading.open();
    expect(await first).toBe("reloaded");
    expect(t.doc.text).toBe("outside");
    expect(await second).toBe("saved");
    expect(t.asked).toEqual(["changed"]);
    expect(t.logs).toEqual(["저장하지 않고 디스크 내용으로 다시 읽었다: notes.txt"]);
  });

  it("다시 읽기가 실패하면 ReloadFailedError가 오고 콘솔에 남기며 onSaved를 부르지 않는다", async () => {
    const t = await saverSetup();
    await t.backend.writeText("notes.txt", "{ broken");
    const saving = t.save(t.doc);
    await t.answer("reload");
    const error = await saving.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ReloadFailedError);
    expect((error as Error).message).toBe("다시 읽지 못했다: JSON 이 아니다");
    expect(t.logs).toEqual(["error: notes.txt을(를) 다시 읽지 못했다: JSON 이 아니다"]);
    expect(t.saved).toEqual([]);
    // 배너가 남고 저장은 막힌다 (내 수정도 그대로)
    expect(t.doc.reloadError).toBe("JSON 이 아니다");
    expect(t.doc.externallyChanged).toBe(true);
    expect(t.doc.text).toBe("mine");
    expect(await t.backend.readText("notes.txt")).toBe("{ broken");
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

describe("저장 전 질문 (beforeSave)", () => {
  function beforeSaveSetup(answers: boolean[]) {
    const asked: string[] = [];
    const pending: Array<(ok: boolean) => void> = [];
    const beforeSave = (d: Document) => {
      asked.push(d.title);
      return new Promise<boolean>((resolve) => pending.push(resolve));
    };
    const reply = async () => {
      for (let i = 0; i < 50 && pending.length === 0; i++) await Promise.resolve();
      pending.shift()!(answers.shift()!);
    };
    return { asked, beforeSave, reply };
  }

  it("아니라고 하면 디스크를 보지도 쓰지도 않고 취소다. 맞다고 하면 저장한다", async () => {
    const t = await saverSetup();
    const writes = holdWrites(t.backend);
    const q = beforeSaveSetup([false, true]);
    const save = createDocumentSaver({ guard: t.guard, beforeSave: q.beforeSave, onSaved: (d) => void t.saved.push(d), log: { info: (_s, text) => void t.logs.push(text), error: () => {} } });
    const first = save(t.doc);
    await q.reply();
    expect(await first).toBe("cancelled");
    expect(writes.writes).toEqual([]);
    expect(t.logs).toEqual(["저장을 취소했다: notes.txt"]);
    expect(t.doc.dirty).toBe(true);

    const second = save(t.doc);
    await q.reply();
    expect(await second).toBe("saved");
    expect(q.asked).toEqual(["notes.txt", "notes.txt"]);
    expect(await t.backend.readText("notes.txt")).toBe("mine");
    expect(t.saved).toEqual([t.doc]);
  });

  it("묻는 동안 들어온 같은 문서의 저장은 그 질문에 합친다", async () => {
    const t = await saverSetup();
    const q = beforeSaveSetup([true]);
    const save = createDocumentSaver({ guard: t.guard, beforeSave: q.beforeSave, onSaved: () => {}, log: { info: () => {}, error: () => {} } });
    const a = save(t.doc);
    const b = save(t.doc);
    expect(b).toBe(a);
    await q.reply();
    expect(await a).toBe("saved");
    expect(q.asked).toEqual(["notes.txt"]);
  });
});
