import { describe, expect, it } from "vitest";
import { MenuRegistry } from "./menus";

describe("MenuRegistry", () => {
  it("경로를 트리로 만들고 order 로 정렬한다", () => {
    const m = new MenuRegistry();
    m.setBranchOrder("파일", 10);
    m.setBranchOrder("편집", 20);
    m.setBranchOrder("도구", 50);
    m.register({ path: "편집/되돌리기", commandId: "edit.undo", order: 10 });
    m.register({ path: "파일/저장", commandId: "file.save", order: 30 });
    m.register({ path: "파일/프로젝트 열기", commandId: "file.open", order: 20 });
    m.register({ path: "도구/타일맵/맵 가져오기", commandId: "tilemap.import" });
    m.register({ path: "파일/종료", commandId: "app.quit", separatorBefore: true, order: 90 });
    const tree = m.tree();
    expect(tree.map((n) => n.label)).toEqual(["파일", "편집", "도구"]);
    expect(tree[0].children.map((n) => n.label)).toEqual(["프로젝트 열기", "저장", "종료"]);
    expect(tree[0].children[2].separatorBefore).toBe(true);
    expect(tree[2].children[0].label).toBe("타일맵");
    expect(tree[2].children[0].children[0].commandId).toBe("tilemap.import");
  });

  it("같은 order 는 등록 순서를 지킨다", () => {
    const m = new MenuRegistry();
    m.register({ path: "창/A", commandId: "a" });
    m.register({ path: "창/B", commandId: "b" });
    m.register({ path: "창/C", commandId: "c" });
    expect(m.tree()[0].children.map((n) => n.label)).toEqual(["A", "B", "C"]);
  });

  it("해지하면 사라진다", () => {
    const m = new MenuRegistry();
    const off = m.register({ path: "파일/저장", commandId: "file.save" });
    off();
    expect(m.tree()).toEqual([]);
  });
});
