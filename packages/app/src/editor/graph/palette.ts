// 노드 추가 목록: 그래프에 더할 수 있는 노드를 분류별로. 상태 필드, 지역 변수, 매개변수, 라이브러리, 엔진 API 는 설정마다 한 항목이다.

import {
  API_NODES,
  assignable,
  nodeSpec,
  OBJECT_FIELDS,
  PLAIN_KINDS,
  WRITABLE_OBJECT_FIELDS,
  type GraphAnalysis,
  type GraphEnv,
  type GraphFile,
  type GraphNode,
  type GType,
  type NodeCategory,
  type PortType,
} from "@initial-editor/core";

export interface PaletteEntry {
  key: string;
  label: string;
  detail?: string;
  category: string;
  node: Omit<GraphNode, "id">;
}

export const CATEGORY_LABELS: Record<NodeCategory, string> = {
  event: "이벤트",
  flow: "흐름",
  variable: "변수",
  object: "오브젝트",
  scene: "씬",
  math: "수학",
  logic: "논리",
  text: "텍스트",
  engine: "엔진 API",
  library: "라이브러리",
};

export function paletteEntries(graph: GraphFile, analysis: GraphAnalysis): PaletteEntry[] {
  const env = analysis.env;
  const out: PaletteEntry[] = [];
  const push = (node: Omit<GraphNode, "id">, category?: string) => {
    const spec = nodeSpec({ id: "_", ...node }, env);
    if (typeof spec === "string") return;
    out.push({ key: JSON.stringify(node), label: spec.label, detail: spec.detail, category: category ?? CATEGORY_LABELS[spec.category], node });
  };
  const present = new Set(graph.nodes.map((n) => n.kind));
  for (const kind of PLAIN_KINDS) {
    if (kind.startsWith("event.") && present.has(kind)) continue;
    if (kind.startsWith("event.") || kind.startsWith("flow.")) push({ kind });
  }
  for (const f of env.state?.values() ?? []) {
    push({ kind: "state.get", field: f.key }, "상태");
    push({ kind: "state.set", field: f.key }, "상태");
  }
  for (const f of env.locals.values()) {
    push({ kind: "local.get", field: f.key }, "지역 변수");
    push({ kind: "local.set", field: f.key }, "지역 변수");
  }
  for (const f of env.params.values()) push({ kind: "param.get", field: f.key }, "매개변수");
  push({ kind: "obj.self" });
  for (const f of OBJECT_FIELDS) push({ kind: "obj.get", field: f });
  for (const f of WRITABLE_OBJECT_FIELDS) push({ kind: "obj.set", field: f });
  push({ kind: "prop.get", field: "key", type: "number" });
  push({ kind: "prop.set", field: "key", type: "number" });
  for (const kind of PLAIN_KINDS) if (!kind.startsWith("event.") && !kind.startsWith("flow.") && kind !== "obj.self") push({ kind });
  for (const a of API_NODES) push({ kind: "api.call", fn: a.id });
  for (const lib of env.libraries.values()) {
    for (const c of lib.constants) push({ kind: "lib.const", const: `${lib.name}.${c.key}` }, lib.label);
    for (const f of lib.functions) if (f.returns !== "state") push({ kind: "lib.call", fn: `${lib.name}.${f.key}` }, lib.label);
  }
  return out;
}

/** 검색어로 거른다 (이름, 설정, 분류, 종류에 들어 있으면) */
export function filterPalette(entries: readonly PaletteEntry[], query: string): PaletteEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...entries];
  return entries.filter((e) => [e.label, e.detail ?? "", e.category, e.node.kind, e.node.fn ?? "", e.node.const ?? ""].some((s) => s.toLowerCase().includes(q)));
}

/** 빈 곳에 놓은 선의 끝: 실행 출구나 입구, 값의 출력(그 형식)이나 입력(포트가 받는 형식) */
export type WireEnd = { kind: "exec-out" } | { kind: "exec-in" } | { kind: "data-out"; type: GType | null } | { kind: "data-in"; type: PortType | null };

/** 선을 놓아 연 목록에 올릴 노드인가: 새 노드에 그 선을 이을 포트가 있다 */
export function fitsWire(entry: PaletteEntry, end: WireEnd, env: GraphEnv): boolean {
  const spec = nodeSpec({ id: "_", ...entry.node }, env);
  if (typeof spec === "string") return false;
  switch (end.kind) {
    case "exec-out":
      return spec.exec && !spec.event;
    case "exec-in":
      return spec.exec;
    case "data-out":
      return spec.inputs.some((p) => !end.type || assignable(p.type, end.type!));
    case "data-in": {
      if (spec.exec || spec.outputs.length === 0) return false;
      if (!end.type) return true;
      // 입력에 따라 형식이 정해지는 노드(덧셈 등)는 정수 입력일 때와 아닐 때를 모두 본다
      const outs = spec.resolve
        ? [spec.resolve(Object.fromEntries(spec.inputs.map((p) => [p.key, null]))), spec.resolve(Object.fromEntries(spec.inputs.map((p) => [p.key, { t: "integer" } as GType])))]
        : [spec.outputs[0].type];
      return outs.some((t) => assignable(end.type!, t));
    }
  }
}
