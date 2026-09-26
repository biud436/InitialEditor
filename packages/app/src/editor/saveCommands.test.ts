import { Document, type SaveOutcome } from "@initial-editor/core";
import { describe, expect, it } from "vitest";
import { saveActiveDocument, saveAllDocuments, saveAllMessage, type SaveHost } from "./saveCommands";

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
