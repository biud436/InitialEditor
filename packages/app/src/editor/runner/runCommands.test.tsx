// @vitest-environment jsdom
// 실행 커맨드 앞의 저장 질문: 저장 안 된 문서가 있으면 실행, 현재 씬부터 실행, 다시 시작이 먼저 묻는다.
// 모두 저장하고 실행, 저장하지 않고 실행, 취소. 저장에 실패하면 실행하지 않는다.
import { CommandRegistry, SceneDocument, type Document, type SaveOutcome } from "@initial-editor/core";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Editor } from "../Editor";
import { ModalStore } from "../modals";
import { registerRunCommands, runDirtyMessage, RUN_DIRTY_KEEP, RUN_DIRTY_SAVE } from "./runCommands";
import type { RunnerStore } from "./RunnerStore";

afterEach(cleanup);

interface FakeDoc {
  title: string;
  dirty: boolean;
  path?: string;
}

function setup(opts: { dirty?: FakeDoc[]; active?: Document | null; failSave?: string } = {}) {
  const commands = new CommandRegistry({ platform: "mac" });
  const modals = new ModalStore();
  const docs = opts.dirty ?? [];
  const saved: string[] = [];
  const starts: unknown[] = [];
  const restarts: number[] = [];
  const toasts: string[] = [];
  const runner = {
    canRun: true,
    isRunning: true,
    canReload: false,
    startHint: undefined,
    modeHint: undefined,
    reloadHint: undefined,
    start: async (o?: unknown) => void starts.push(o ?? {}),
    restart: async () => void restarts.push(1),
    stop: async () => {},
    reload: async () => {},
  } as unknown as RunnerStore;
  const editor = {
    commands,
    modals,
    documents: {
      get active() {
        return opts.active ?? null;
      },
      get dirtyDocuments() {
        return docs.filter((d) => d.dirty) as unknown as Document[];
      },
    },
    toasts: { success: (t: string) => toasts.push(t), info: (t: string) => toasts.push(t), warn: (t: string) => toasts.push(t), error: (t: string) => toasts.push(t) },
    async saveDocument(doc: Document): Promise<SaveOutcome> {
      if (doc.title === opts.failSave) throw new Error("디스크 가득 참");
      saved.push(doc.title);
      (doc as unknown as FakeDoc).dirty = false;
      return "saved";
    },
    setHint() {},
    setNote() {},
    setLabelProvider() {},
    commandHint: () => undefined,
    commandNote: () => undefined,
  } as unknown as Editor;
  registerRunCommands(editor, runner);
  /** 커맨드를 실행하고, 모달이 뜨면 그려서 answer 를 누른다 */
  const execute = async (id: string, answer?: string) => {
    let done = false;
    const running = commands.execute(id).then(() => (done = true));
    await act(async () => {
      await Promise.resolve();
    });
    const top = modals.top;
    if (answer !== undefined) {
      if (!top || top.kind !== "custom") throw new Error("저장 질문이 뜨지 않았다");
      render(<>{top.render(() => top.resolve())}</>);
      fireEvent.click(screen.getByRole("button", { name: answer }));
    } else expect(top ?? null).toBeNull();
    await running;
    expect(done).toBe(true);
  };
  return { execute, saved, starts, restarts, toasts, modals };
}

describe("실행 앞의 저장 질문", () => {
  it("저장 안 된 문서가 없으면 묻지 않고 실행한다", async () => {
    const t = setup({ dirty: [{ title: "main.lua", dirty: false }] });
    await t.execute("run.start");
    expect(t.starts).toEqual([{}]);
  });

  it("모두 저장하고 실행: 저장 안 된 문서를 저장한 뒤 실행한다", async () => {
    const t = setup({ dirty: [{ title: "main.lua", dirty: true }, { title: "start.json", dirty: true }] });
    await t.execute("run.start", RUN_DIRTY_SAVE);
    expect(t.saved).toEqual(["main.lua", "start.json"]);
    expect(t.starts).toEqual([{}]);
  });

  it("저장하지 않고 실행은 저장하지 않고, 취소는 실행하지 않는다", async () => {
    const keep = setup({ dirty: [{ title: "main.lua", dirty: true }] });
    await keep.execute("run.start", RUN_DIRTY_KEEP);
    expect(keep.saved).toEqual([]);
    expect(keep.starts).toEqual([{}]);
    cleanup();
    const cancel = setup({ dirty: [{ title: "main.lua", dirty: true }] });
    await cancel.execute("run.start", "취소");
    expect(cancel.saved).toEqual([]);
    expect(cancel.starts).toEqual([]);
  });

  it("하나라도 저장하지 못하면 실행하지 않는다", async () => {
    const t = setup({ dirty: [{ title: "a.lua", dirty: true }, { title: "b.json", dirty: true }], failSave: "b.json" });
    await t.execute("run.start", RUN_DIRTY_SAVE);
    expect(t.saved).toEqual(["a.lua"]);
    expect(t.starts).toEqual([]);
  });

  it("현재 씬부터 실행과 다시 시작도 먼저 묻는다", async () => {
    const scene = Object.create(SceneDocument.prototype) as SceneDocument;
    Object.defineProperty(scene, "path", { value: "resources/scenes/title.json" });
    const t = setup({ dirty: [{ title: "title.json", dirty: true }], active: scene });
    await t.execute("run.fromScene", RUN_DIRTY_SAVE);
    expect(t.starts).toEqual([{ scene: "title" }]);
    cleanup();
    const r = setup({ dirty: [{ title: "main.lua", dirty: true }] });
    await r.execute("run.restart", "취소");
    expect(r.restarts).toEqual([]);
  });

  it("문구: 문서 이름은 셋까지, 나머지는 개수", () => {
    expect(runDirtyMessage(["a", "b"])).toBe("저장 안 된 문서 2개 (a, b). 게임은 디스크의 파일을 읽으므로 저장하지 않은 변경은 실행에 반영되지 않음");
    expect(runDirtyMessage(["a", "b", "c", "d", "e"])).toContain("(a, b, c 외 2개)");
  });
});
