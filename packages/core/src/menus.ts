// 메뉴 레지스트리. 메뉴 항목은 커맨드 id 를 가리키기만 한다 (라벨과 단축키는 커맨드가 준다).
// 상단 갈래(파일, 편집, ...)의 순서와 갈래 안의 순서는 order 로 정한다. 확장은 "도구/타일맵/..." 처럼
// 하위 메뉴 경로를 적는다.

import { action, makeObservable, observable } from "mobx";
import { Emitter } from "./events";

export interface MenuItemSpec {
  /** "파일/저장" 또는 "도구/타일맵/맵 가져오기". 마지막 조각은 표시용이며, 라벨은 커맨드가 우선한다 */
  path: string;
  commandId?: string;
  /** 앞에 구분선을 긋는다 */
  separatorBefore?: boolean;
  /** 같은 부모 안의 정렬 (기본 100). 상단 갈래도 이 값으로 정렬 */
  order?: number;
}

export interface MenuNode {
  label: string;
  order: number;
  commandId?: string;
  separatorBefore: boolean;
  children: MenuNode[];
}

const DEFAULT_ORDER = 100;

export class MenuRegistry {
  readonly items: MenuItemSpec[] = [];
  readonly events = new Emitter<{ change: void }>();

  constructor() {
    makeObservable(this, { items: observable.shallow, register: action, setBranchOrder: action });
  }

  private branchOrder = new Map<string, number>();

  /** 상단 갈래의 순서를 정한다 (파일 10, 편집 20, ...) */
  setBranchOrder(label: string, order: number): void {
    this.branchOrder.set(label, order);
    this.events.emit("change", undefined);
  }

  register(spec: MenuItemSpec): () => void {
    this.items.push(spec);
    this.events.emit("change", undefined);
    return () => {
      const i = this.items.indexOf(spec);
      if (i >= 0) {
        this.items.splice(i, 1);
        this.events.emit("change", undefined);
      }
    };
  }

  /** 등록된 항목을 트리로 만든다. 갈래와 항목은 order, 그다음 등록 순서 */
  tree(): MenuNode[] {
    const root: MenuNode = { label: "", order: 0, separatorBefore: false, children: [] };
    this.items.forEach((spec, index) => {
      const parts = spec.path.split("/").map((p) => p.trim()).filter(Boolean);
      if (parts.length === 0) return;
      let node = root;
      for (let depth = 0; depth < parts.length; depth++) {
        const label = parts[depth];
        const leaf = depth === parts.length - 1;
        let child = node.children.find((c) => c.label === label);
        if (!child) {
          const order = depth === 0 ? this.branchOrder.get(label) ?? spec.order ?? DEFAULT_ORDER : leaf ? spec.order ?? DEFAULT_ORDER : DEFAULT_ORDER;
          child = { label, order: order + index / 1e6, separatorBefore: false, children: [] };
          node.children.push(child);
        }
        if (leaf) {
          child.commandId = spec.commandId;
          child.separatorBefore = !!spec.separatorBefore;
          if (spec.order !== undefined) child.order = spec.order + index / 1e6;
        }
        node = child;
      }
    });
    const sort = (n: MenuNode) => {
      n.children.sort((a, b) => a.order - b.order);
      n.children.forEach(sort);
    };
    sort(root);
    return root.children;
  }
}
