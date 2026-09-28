import { describe, expect, it } from "vitest";
import { MenuRegistry, visibleMenu } from "./menus";

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

  it("visibleMenu 는 보이지 않는 커맨드의 항목과 그래서 빈 하위 메뉴를 빼고, 맨 앞이 된 구분선을 지운다", () => {
    const m = new MenuRegistry();
    m.register({ path: "맵/새 맵", commandId: "map.new", order: 1 });
    m.register({ path: "맵/이벤트 도구", commandId: "rpg.tool", order: 60 });
    m.register({ path: "맵/이 이벤트 앞에서 실행", commandId: "rpg.play", order: 910, separatorBefore: true });
    m.register({ path: "창/이벤트", commandId: "rpg.panel" });
    m.register({ path: "도구/RPG/정리", commandId: "rpg.tidy" });
    m.register({ path: "도구/구분 뒤", commandId: "tools.after", separatorBefore: true });
    const hidden = new Set(["rpg.tool", "rpg.play", "rpg.panel", "rpg.tidy"]);
    const tree = visibleMenu(m.tree(), (id) => !hidden.has(id));
    expect(tree.map((n) => n.label)).toEqual(["맵", "도구"]);
    expect(tree[0].children.map((n) => n.label)).toEqual(["새 맵"]);
    expect(tree[1].children.map((n) => [n.label, n.separatorBefore])).toEqual([["구분 뒤", false]]);
    // 다 보이면 트리 그대로다
    expect(visibleMenu(m.tree(), () => true)).toEqual(m.tree());
  });
});
