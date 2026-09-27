// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ModalStore } from "../modals";
import { askEngineTrust, TRUST_ALLOW, TRUST_DENY, TRUST_DENY_NO_BUNDLED, TRUST_TITLE, trustMessage } from "./EngineTrustDialog";
import type { TrustQuestion } from "./engineTrust";

afterEach(cleanup);

const question: TrustQuestion = {
  root: "/Users/u/Downloads/game",
  candidates: [
    { source: "project-file", path: "/Users/u/Downloads/game/tools/Initial2D", needsTrust: true },
    { source: "project-build", path: "/Users/u/Downloads/game/build/Initial2D", needsTrust: true },
  ],
  hasBundled: true,
};

function renderTop(modals: ModalStore) {
  const spec = modals.top;
  if (!spec || spec.kind !== "custom") throw new Error("사용자 정의 모달이 없다");
  render(<>{spec.render(() => spec.resolve())}</>);
  return spec;
}

describe("엔진 신뢰 확인 모달", () => {
  it("실행 파일의 절대 경로와 출처를 보인다", () => {
    const modals = new ModalStore();
    void askEngineTrust(modals, question);
    expect(renderTop(modals).title).toBe(TRUST_TITLE);
    const items = screen.getAllByTestId("engine-trust-path").map((el) => el.textContent);
    expect(items).toEqual([
      "/Users/u/Downloads/game/tools/Initial2D (출처: .initial-editor/engine)",
      "/Users/u/Downloads/game/build/Initial2D (출처: 프로젝트의 build/)",
    ]);
    expect(screen.getByTestId("engine-trust").textContent).toContain("엔진들을 실행할까?");
    expect(screen.getByTestId("engine-trust").textContent).toContain("프로젝트: /Users/u/Downloads/game");
  });

  for (const [label, answer] of [
    [TRUST_ALLOW, "allow"],
    [TRUST_DENY, "deny"],
  ] as const) {
    it(`${label} 를 누르면 ${answer} 로 닫힌다`, async () => {
      const modals = new ModalStore();
      const result = askEngineTrust(modals, question);
      renderTop(modals);
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(await result).toBe(answer);
      expect(modals.stack).toHaveLength(0);
    });
  }

  it("형제 폴더는 프로젝트가 가리킨 것이 아니라 옆에 있는 것이라고 말한다", () => {
    const sibling = { source: "sibling" as const, path: "/Users/u/Downloads/Initial2D/build/Initial2D", needsTrust: true };
    expect(trustMessage({ ...question, candidates: [sibling], hasBundled: false })).toBe("프로젝트 옆 폴더의 엔진을 실행할까?");
    expect(trustMessage({ ...question, candidates: [question.candidates[1], sibling] })).toBe("이 프로젝트가 가리키거나 옆 폴더에 있는 엔진들을 실행할까?");
    expect(trustMessage({ ...question, candidates: [question.candidates[1]] })).toBe("이 프로젝트가 가리키는 엔진을 실행할까?");
  });

  it("Escape 나 가림막으로 닫으면 답이 없다 (기억하지 않는다)", async () => {
    const modals = new ModalStore();
    const result = askEngineTrust(modals, question);
    modals.close(modals.top!.id);
    expect(await result).toBeNull();
  });

  it("처음 초점은 실행하지 않는 쪽이다 (Enter 가 실행을 허용하지 않게)", () => {
    const modals = new ModalStore();
    void askEngineTrust(modals, question);
    renderTop(modals);
    expect(screen.getByRole("button", { name: TRUST_DENY }).hasAttribute("data-autofocus")).toBe(true);
    expect(screen.getByRole("button", { name: TRUST_ALLOW }).hasAttribute("data-autofocus")).toBe(false);
  });

  it("앱에 든 엔진이 없으면(개발 빌드) 거절 단추는 실행하지 않기다", async () => {
    const modals = new ModalStore();
    const result = askEngineTrust(modals, { ...question, candidates: [question.candidates[1]], hasBundled: false });
    renderTop(modals);
    expect(screen.getByTestId("engine-trust").textContent).toContain("엔진을 실행할까?");
    expect(screen.queryByRole("button", { name: TRUST_DENY })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: TRUST_DENY_NO_BUNDLED }));
    expect(await result).toBe("deny");
  });
});
