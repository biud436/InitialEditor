// 콘솔의 오류 링크를 눌렀을 때: 그 파일을 열고, 문서가 revealLine 을 내놓으면 그 줄로 간다.
// revealLine 은 스크립트 문서(scripting/)의 것이고 미리보기 문서에는 없으므로 있는지 보고 부른다.

import type { ErrorLink } from "@initial-editor/core";
import type { Editor } from "../Editor";

interface Revealable {
  revealLine?: (line: number, column?: number) => void;
}

export async function openErrorLink(editor: Editor, link: ErrorLink): Promise<void> {
  await editor.openPath(link.path);
  const doc = editor.documents.findByPath(link.path) as Revealable | undefined;
  doc?.revealLine?.(link.line, link.column);
}
