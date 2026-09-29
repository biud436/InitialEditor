// 비주얼 스크립팅 지원의 설치 (docs/plans/visual-scripting.md 7절): 그래프 문서 열기, 커맨드와 메뉴.

import type { Editor } from "../Editor";
import { GraphSupport } from "./GraphSupport";

export { GraphSupport } from "./GraphSupport";

const NEED_PROJECT = "열린 프로젝트 없음";
const NAME_RULE = /^[a-z][a-z0-9_]*(\/[a-z][a-z0-9_]*)*$/;

export function validateGraphName(name: string): string | null {
  const n = name.trim();
  if (!n) return "이름을 입력하세요";
  if (!NAME_RULE.test(n)) return "소문자로 시작하는 소문자, 숫자, _ 로 쓰고 폴더는 / 로 나눕니다 (예: player 또는 enemies/bat)";
  return null;
}

export function installGraphSupport(editor: Editor): () => void {
  const support = new GraphSupport(editor);
  editor.graphSupport = support;
  support.install();
  const c = editor.commands;
  const disposers = [
    c.register({
      id: "graph.new",
      label: "새 그래프 컴포넌트",
      category: "file",
      shortcut: "Ctrl+Alt+G",
      enabled: () => editor.project.isOpen,
      run: async () => {
        const name = await editor.modals.prompt({
          title: "새 그래프 컴포넌트",
          label: "이름 (scripts/components/ 아래, 확장자 없이)",
          placeholder: "player 또는 enemies/bat",
          okLabel: "만들기",
          validate: validateGraphName,
        });
        if (name !== null) await support.createGraph(name.trim());
      },
    }),
    c.register({
      id: "graph.layout",
      label: "노드 자동 정렬",
      category: "edit",
      enabled: () => support.activeGraph !== null,
      run: () => {
        const doc = support.activeGraph;
        if (doc) support.layout(doc);
      },
    }),
    editor.menus.register({ path: "파일/새 그래프 컴포넌트", commandId: "graph.new", order: 36 }),
  ];
  editor.setHint("graph.new", () => (editor.project.isOpen ? undefined : NEED_PROJECT));
  editor.setHint("graph.layout", () => (support.activeGraph ? undefined : "활성 그래프 탭 없음"));
  return () => {
    for (const d of disposers) d();
    support.dispose();
  };
}
