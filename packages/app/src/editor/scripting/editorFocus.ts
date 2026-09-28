// Monaco 편집기의 초점 상태를 문서의 초점과 맞춘다. WebKit 은 초점을 가진 입력 영역이 문서에서 떨어져도 blur 를
// 보내지 않아, Monaco 가 가려진 탭의 편집기를 초점 편집기로 보고 타이핑과 단축키 액션을 그리로 보낸다.

import type { monaco } from "./monaco";

export type FocusTrackedEditor = Pick<monaco.editor.ICodeEditor, "hasTextFocus" | "hasWidgetFocus" | "getContainerDomNode">;

/** 편집기가 초점을 가졌다고 보는데 문서의 초점 요소가 편집기 밖에 있는가 */
export function holdsStaleFocus(editor: FocusTrackedEditor): boolean {
  if (!editor.hasTextFocus() && !editor.hasWidgetFocus()) return false;
  const container = editor.getContainerDomNode();
  const active = container.ownerDocument.activeElement;
  return !(active && container.contains(active));
}

/** 문서의 초점이 바뀔 때마다 편집기의 남은 초점 상태를 푼다. 돌려주는 것을 dispose 하면 뗀다 */
export function releaseStaleFocus(editor: FocusTrackedEditor): { dispose(): void } {
  const container = editor.getContainerDomNode();
  const view = container.ownerDocument.defaultView;
  const onFocusIn = () => {
    if (!holdsStaleFocus(editor)) return;
    // Monaco 는 입력 영역의 blur 로 글자 초점을 풀고, 그 blur 를 캡처하는 컨테이너가 위젯 초점을 푼다
    container.querySelector("textarea.inputarea")?.dispatchEvent(new FocusEvent("blur"));
  };
  view?.addEventListener("focusin", onFocusIn, true);
  return { dispose: () => view?.removeEventListener("focusin", onFocusIn, true) };
}
