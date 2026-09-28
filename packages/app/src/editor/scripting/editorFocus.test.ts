// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { holdsStaleFocus, releaseStaleFocus } from "./editorFocus";

/** Monaco 처럼 입력 영역의 focus 와 blur 로 글자 초점을, 컨테이너의 캡처 blur 로 위젯 초점을 기록하는 편집기 */
function fakeEditor() {
  const container = document.createElement("div");
  const textarea = document.createElement("textarea");
  textarea.className = "inputarea";
  const findInput = document.createElement("textarea");
  findInput.className = "input";
  container.append(textarea, findInput);
  document.body.append(container);
  const state = { text: false, widget: false, blurs: 0 };
  textarea.addEventListener("focus", () => {
    state.text = true;
    state.widget = true;
  });
  textarea.addEventListener("blur", () => {
    state.text = false;
    state.blurs++;
  });
  findInput.addEventListener("focus", () => {
    state.widget = true;
  });
  container.addEventListener("blur", () => void (state.widget = false), true);
  const editor = { hasTextFocus: () => state.text, hasWidgetFocus: () => state.widget, getContainerDomNode: () => container };
  return { container, textarea, findInput, state, editor };
}

function otherInput() {
  const input = document.createElement("input");
  document.body.append(input);
  return input;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("holdsStaleFocus", () => {
  it("초점을 가졌다고 보는데 문서의 초점 요소가 밖에 있으면 참", () => {
    const a = fakeEditor();
    a.textarea.focus();
    expect(holdsStaleFocus(a.editor)).toBe(false);
    a.container.remove();
    expect(a.state.text).toBe(true);
    expect(holdsStaleFocus(a.editor)).toBe(true);
  });

  it("초점을 가졌다고 보지 않으면 거짓", () => {
    const a = fakeEditor();
    otherInput().focus();
    expect(holdsStaleFocus(a.editor)).toBe(false);
  });
});

describe("releaseStaleFocus", () => {
  it("초점을 가진 채 떨어진 편집기는 다른 곳에 초점이 오면 입력 영역에 blur 를 받는다", () => {
    const a = fakeEditor();
    const release = releaseStaleFocus(a.editor);
    a.textarea.focus();
    a.container.remove();
    expect(a.state.text).toBe(true);
    otherInput().focus();
    expect(a.state.text).toBe(false);
    expect(a.state.widget).toBe(false);
    release.dispose();
  });

  it("다른 편집기의 입력 영역에 초점이 와도 떨어진 편집기만 푼다", () => {
    const a = fakeEditor();
    const b = fakeEditor();
    const releases = [releaseStaleFocus(a.editor), releaseStaleFocus(b.editor)];
    a.textarea.focus();
    a.container.remove();
    b.textarea.focus();
    expect(a.state.text).toBe(false);
    expect(b.state.text).toBe(true);
    expect(b.state.blurs).toBe(0);
    for (const r of releases) r.dispose();
  });

  it("초점이 편집기 안(찾기 입력)으로 옮겨 가면 blur 를 보내지 않는다", () => {
    const a = fakeEditor();
    const release = releaseStaleFocus(a.editor);
    a.textarea.focus();
    a.findInput.focus();
    expect(a.state.blurs).toBe(1);
    expect(a.state.widget).toBe(true);
    release.dispose();
  });

  it("dispose 하면 더는 풀지 않는다", () => {
    const a = fakeEditor();
    releaseStaleFocus(a.editor).dispose();
    a.textarea.focus();
    a.container.remove();
    otherInput().focus();
    expect(a.state.text).toBe(true);
  });
});
