// 노드를 캔버스에 놓고, 기다리는 포트가 있으면 새 노드의 맞는 포트와 잇는다 (되돌리기 한 단계).
// 노드 추가 목록(빈 곳에 놓은 선)과 옆 창에서 끌어 놓은 변수가 같이 쓴다.
// 옆 창의 상태 필드, 지역 변수, 매개변수 줄은 끌면 읽기 노드가 되고, Alt 를 누른 채 놓으면 쓰기 노드가 된다.

import { addNode, assignable, connectData, connectExec, nodeGeometry, nodeSpec, type ExitName, type GraphDocument, type GraphNode, type GType, type PinKind, type PortType } from "@initial-editor/core";

export type NewNode = Omit<GraphNode, "id">;

export interface PendingPin {
  node: string;
  kind: PinKind;
  key: string;
}

/** 노드를 world 에 더하고 pending 포트와 잇는다. 더한 노드의 id */
export function placeNode(doc: GraphDocument, node: NewNode, world: { x: number; y: number }, pending: PendingPin | null, label: string): string {
  let added = "";
  doc.change(`노드 추가: ${label}`, (g) => {
    added = addNode(g, node, [world.x, world.y]);
    if (!pending) return;
    const created = g.nodes.find((n) => n.id === added)!;
    const spec = nodeSpec(created, doc.analysis.env);
    if (typeof spec === "string") return;
    const pins = nodeGeometry(created, spec).pins;
    if (pending.kind === "exec-out" && spec.exec && !spec.event) connectExec(g, { node: pending.node, exit: pending.key as ExitName }, added);
    else if (pending.kind === "exec-in" && spec.exec) connectExec(g, { node: added, exit: "next" }, pending.node);
    else if (pending.kind === "data-out") {
      const t = doc.analysis.outType(pending.node, pending.key);
      const port = spec.inputs.find((p) => !t || assignable(p.type, t));
      if (port) connectData(g, { node: pending.node, port: pending.key }, { node: added, port: port.key });
    } else if (pending.kind === "data-in" && pins.some((p) => p.kind === "data-out")) {
      const out = spec.outputs[0];
      const want = inputType(doc, pending);
      if (out && (!want || assignable(want as PortType, out.type))) connectData(g, { node: added, port: out.key }, { node: pending.node, port: pending.key });
    }
  });
  if (added) doc.select([added]);
  return added;
}

/** 입력 포트가 받는 형식 (모르면 null) */
export function inputType(doc: GraphDocument, pin: PendingPin): GType | PortType | null {
  const target = doc.graph.nodes.find((n) => n.id === pin.node);
  const spec = target ? nodeSpec(target, doc.analysis.env) : null;
  return spec && typeof spec !== "string" ? (spec.inputs.find((p) => p.key === pin.key)?.type ?? null) : null;
}

/** 새 노드의 이름과 크기, 값 출력의 형식과 출력 포트의 자리 (만들기 전에) */
export function previewNode(doc: GraphDocument, node: NewNode): { label: string; width: number; height: number; exec: boolean; out: GType | null; outPin: { x: number; y: number } | null } | null {
  const spec = nodeSpec({ id: "_", ...node }, doc.analysis.env);
  if (typeof spec === "string") return null;
  const geom = nodeGeometry({ id: "_", ...node }, spec);
  const pin = geom.pins.find((p) => p.kind === "data-out") ?? null;
  return { label: spec.label, width: geom.width, height: geom.height, exec: spec.exec, out: spec.outputs[0]?.type ?? null, outPin: pin ? { x: pin.x, y: pin.y } : null };
}

// ---- 옆 창에서 끌어 오는 변수 ----

export const GRAPH_NODE_MIME = "application/x-initial-graph-node";

/** 끄는 중인 변수의 읽기 노드. dragover 에서는 dataTransfer 를 읽을 수 없어 여기 둔다 */
let dragged: NewNode | null = null;

export function startNodeDrag(e: { dataTransfer: DataTransfer }, node: NewNode): void {
  dragged = node;
  e.dataTransfer.setData(GRAPH_NODE_MIME, JSON.stringify(node));
  e.dataTransfer.setData("text/plain", node.field ?? node.kind);
  e.dataTransfer.effectAllowed = "copy";
}

export function endNodeDrag(): void {
  dragged = null;
}

export function draggedNode(): NewNode | null {
  return dragged;
}

const WRITE_OF: Record<string, string> = { "state.get": "state.set", "local.get": "local.set" };

/** Alt 를 누른 채 놓으면 쓰기 노드 (쓰기가 있는 것만) */
export function droppedNode(node: NewNode, alt: boolean): NewNode {
  return alt && WRITE_OF[node.kind] ? { ...node, kind: WRITE_OF[node.kind] } : node;
}
