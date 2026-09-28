// @vitest-environment jsdom
import { MemoryBackend, SceneDocument, type SaveConflict } from "@initial-editor/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ModalStore } from "./modals";
import { askSaveConflict, modalSaveGuard, saveConflictMessage } from "./SaveConflictDialog";

afterEach(cleanup);

const doc = new SceneDocument(new MemoryBackend(), "resources/scenes/main.json", undefined, () => new Set(["node"]));

/** 맨 위의 사용자 정의 모달을 그린다 (Modals.tsx가 하는 것처럼 닫기는 resolve다) */
function renderTop(modals: ModalStore) {
  const spec = modals.top;
  if (!spec || spec.kind !== "custom") throw new Error("사용자 정의 모달이 없다");
  render(<>{spec.render(() => spec.resolve())}</>);
  return spec;
}

describe("저장 충돌 모달", () => {
  for (const [label, choice] of [
    ["덮어쓰기", "overwrite"],
    ["다시 읽기", "reload"],
    ["취소", "cancel"],
  ] as const) {
    it(`${label}를 누르면 ${choice}로 닫힌다`, async () => {
      const modals = new ModalStore();
      const answer = askSaveConflict(modals, doc, { kind: "changed" });
      const spec = renderTop(modals);
      expect(spec.title).toBe("외부에서 변경된 파일");
      expect(screen.getByTestId("save-conflict").getAttribute("data-kind")).toBe("changed");
      expect(screen.getByTestId("save-conflict").textContent).toBe(saveConflictMessage("main.json", { kind: "changed" }));
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(await answer).toBe(choice);
      expect(modals.stack).toHaveLength(0);
    });
  }

  it("Escape나 가림막으로 닫으면 취소다", async () => {
    const modals = new ModalStore();
    const answer = askSaveConflict(modals, doc, { kind: "changed" });
    modals.close(modals.top!.id);
    expect(await answer).toBe("cancel");
  });

  it("처음 초점은 취소에 간다 (Enter가 덮어쓰지 않게)", () => {
    const modals = new ModalStore();
    void askSaveConflict(modals, doc, { kind: "changed" });
    renderTop(modals);
    expect(screen.getByRole("button", { name: "취소" }).hasAttribute("data-autofocus")).toBe(true);
    expect(screen.getByRole("button", { name: "덮어쓰기" }).hasAttribute("data-autofocus")).toBe(false);
  });

  it("지워진 파일은 다시 읽기가 없고, 다시 읽기 실패한 파일은 이유를 보인다", () => {
    const modals = new ModalStore();
    void askSaveConflict(modals, doc, { kind: "missing" });
    expect(renderTop(modals).title).toBe("삭제된 파일");
    expect(screen.queryByRole("button", { name: "다시 읽기" })).toBeNull();
    expect(screen.getByTestId("save-conflict").textContent).toContain("main.json: 디스크에서 삭제됨. 덮어쓰기: 편집 내용으로 파일 다시 생성");
    cleanup();

    const unreadable: SaveConflict = { kind: "unreadable", reason: "JSON이 아니다" };
    void askSaveConflict(modals, doc, unreadable);
    expect(renderTop(modals).title).toBe("다시 읽기 실패한 파일");
    expect(screen.getByTestId("save-conflict").textContent).toContain("main.json 다시 읽기 실패: JSON이 아니다");
    expect(screen.getByRole("button", { name: "다시 읽기" })).toBeTruthy();
  });

  it("에디터의 저장 확인은 디스크를 readText로 읽고, 다시 읽기 전에 위험 색 확인으로 한 번 더 묻는다", async () => {
    const modals = new ModalStore();
    const reads: string[] = [];
    const guard = modalSaveGuard(modals, async (p) => {
      reads.push(p);
      return "";
    });
    expect(await guard.readText("a.json")).toBe("");
    expect(reads).toEqual(["a.json"]);
    const discard = guard.confirmDiscard(doc);
    const top = modals.top!;
    expect(top.kind).toBe("confirm");
    if (top.kind !== "confirm") return;
    expect(top.danger).toBe(true);
    expect(top.okLabel).toBe("버리고 다시 읽기");
    expect(top.message).toContain("main.json: 저장하지 않은 변경을 버리고 디스크 내용으로 다시 읽을까요?");
    top.resolve(true);
    expect(await discard).toBe(true);
  });
});
