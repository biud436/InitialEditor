// 그래프 편집: GraphFile 을 받아 새 GraphFile 을 돌려주는 순수 함수들. 그래프 문서의 명령이 이것으로 앞뒤 상태를 만든다.

import type { GraphComment, GraphFile, GraphNode, VarDecl } from "./format";
import { IDENTIFIER } from "./names";
import { parseLink } from "./validate";

export function cloneGraph(g: GraphFile): GraphFile {
  return JSON.parse(JSON.stringify(g)) as GraphFile;
}

/** base 로 시작하는 아직 없는 노드 id (base, base_2, base_3 ...) */
export function uniqueNodeId(g: GraphFile, base: string): string {
  const clean = base.replace(/[^A-Za-z0-9_]/g, "_").replace(/^([^A-Za-z_])/, "n_$1") || "node";
  const taken = new Set([...g.nodes.map((n) => n.id), ...(g.comments ?? []).map((c) => c.id)]);
  if (!taken.has(clean)) return clean;
  for (let i = 2; ; i++) if (!taken.has(`${clean}_${i}`)) return `${clean}_${i}`;
}

/** 노드를 더한다 (id 가 겹치면 새로 짓는다). 더한 노드의 id */
export function addNode(g: GraphFile, node: Omit<GraphNode, "id"> & { id?: string }, pos: [number, number]): string {
  const base = node.id && IDENTIFIER.test(node.id) ? node.id : node.kind.split(".").pop()!;
  const id = uniqueNodeId(g, base);
  g.nodes.push({ ...node, id } as GraphNode);
  g.layout[id] = [Math.round(pos[0]), Math.round(pos[1])];
  return id;
}

/** 실행 출구의 이름: next, then, else, body, case:<값> */
export type ExitName = "next" | "then" | "else" | "body" | `case:${string}`;

export function exitTarget(n: GraphNode, exit: ExitName): string | undefined {
  if (exit.startsWith("case:")) return n.cases?.[exit.slice(5)];
  return n[exit as "next" | "then" | "else" | "body"];
}

function setExit(n: GraphNode, exit: ExitName, target: string | undefined) {
  if (exit.startsWith("case:")) {
    const v = exit.slice(5);
    const cases = { ...(n.cases ?? {}) };
    // 갈래를 끊어도 값은 남긴다 (빈 target)
    cases[v] = target ?? "";
    n.cases = cases;
    return;
  }
  const key = exit as "next" | "then" | "else" | "body";
  if (target === undefined) delete n[key];
  else n[key] = target;
}

/** 노드가 가진 실행 출구와 가리키는 노드 */
export function exitsOf(n: GraphNode): [ExitName, string][] {
  const out: [ExitName, string][] = [];
  for (const k of ["next", "then", "else", "body"] as const) if (n[k] !== undefined) out.push([k, n[k]!]);
  for (const [v, t] of Object.entries(n.cases ?? {})) if (t !== "") out.push([`case:${v}`, t]);
  return out;
}

/** 노드들과 그 노드를 가리키던 연결을 지운다 */
export function removeNodes(g: GraphFile, ids: Iterable<string>): void {
  const gone = new Set(ids);
  g.nodes = g.nodes.filter((n) => !gone.has(n.id));
  for (const id of gone) delete g.layout[id];
  for (const n of g.nodes) {
    for (const [exit, target] of exitsOf(n)) if (gone.has(target)) setExit(n, exit, undefined);
    if (n.in) {
      for (const [port, link] of Object.entries(n.in)) if (gone.has(parseLink(link).node)) delete n.in[port];
    }
  }
}

export function moveNodes(g: GraphFile, moves: Iterable<{ id: string; x: number; y: number }>): void {
  for (const m of moves) if (g.nodes.some((n) => n.id === m.id)) g.layout[m.id] = [Math.round(m.x), Math.round(m.y)];
}

function node(g: GraphFile, id: string): GraphNode {
  const n = g.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`노드 없음: ${id}`);
  return n;
}

/** 값 연결: from 노드의 출력(out 이면 노드 id 만)을 to 노드의 입력 포트로. 그 포트의 상수는 남긴다 (끊으면 다시 보인다) */
export function connectData(g: GraphFile, from: { node: string; port: string }, to: { node: string; port: string }): void {
  const target = node(g, to.node);
  target.in = { ...(target.in ?? {}), [to.port]: from.port === "out" ? from.node : `${from.node}.${from.port}` };
}

export function disconnectData(g: GraphFile, to: { node: string; port: string }): void {
  const target = node(g, to.node);
  if (!target.in || !(to.port in target.in)) return;
  const links = { ...target.in };
  delete links[to.port];
  target.in = links;
}

/** 실행 연결: from 의 출구를 to 로. to 로 들어오던 다른 출구는 끊는다 (한 노드로는 한 줄기만 들어온다) */
export function connectExec(g: GraphFile, from: { node: string; exit: ExitName }, to: string): void {
  for (const n of g.nodes) for (const [exit, target] of exitsOf(n)) if (target === to && !(n.id === from.node && exit === from.exit)) setExit(n, exit, undefined);
  setExit(node(g, from.node), from.exit, to);
}

export function disconnectExec(g: GraphFile, from: { node: string; exit: ExitName }): void {
  setExit(node(g, from.node), from.exit, undefined);
}

/** 입력 포트의 상수. undefined 면 지운다 */
export function setArg(g: GraphFile, id: string, port: string, value: unknown): void {
  const n = node(g, id);
  const args = { ...(n.args ?? {}) };
  if (value === undefined) delete args[port];
  else args[port] = value;
  n.args = args;
}

/** 노드의 설정 (field, type, fn, const). undefined 면 지운다 */
export function setNodeSetting(g: GraphFile, id: string, key: "field" | "type" | "fn" | "const", value: string | undefined): void {
  const n = node(g, id) as unknown as Record<string, unknown>;
  if (value === undefined) delete n[key];
  else n[key] = value;
}

/** 값 분기의 갈래 값을 바꾼다 (이어진 노드는 그대로). to 가 undefined 면 갈래를 지운다 */
export function renameCase(g: GraphFile, id: string, from: string, to: string | undefined): void {
  const n = node(g, id);
  const out: Record<string, string> = {};
  for (const [v, t] of Object.entries(n.cases ?? {})) {
    if (v !== from) out[v] = t;
    else if (to !== undefined) out[to] = t;
  }
  n.cases = out;
}

// ---- 변수 ----

export type VarList = "state" | "locals";

function list(g: GraphFile, which: VarList): VarDecl[] {
  if (which === "locals") return g.locals;
  if (!g.state) g.state = { from: "scene", fields: [] };
  return g.state.fields;
}

export function addVar(g: GraphFile, which: VarList, decl: VarDecl): void {
  list(g, which).push(decl);
}

/** 변수 선언을 바꾼다. key 가 바뀌면 그 변수를 쓰는 노드의 field 도 바꾼다 */
export function updateVar(g: GraphFile, which: VarList, key: string, next: VarDecl): void {
  const vars = list(g, which);
  const i = vars.findIndex((v) => v.key === key);
  if (i < 0) throw new Error(`변수 없음: ${key}`);
  vars[i] = next;
  if (next.key !== key) {
    const kinds = which === "state" ? ["state.get", "state.set"] : ["local.get", "local.set"];
    for (const n of g.nodes) if (kinds.includes(n.kind) && n.field === key) n.field = next.key;
  }
}

export function removeVar(g: GraphFile, which: VarList, key: string): void {
  if (which === "locals") g.locals = g.locals.filter((v) => v.key !== key);
  else if (g.state) g.state.fields = g.state.fields.filter((v) => v.key !== key);
}

export function setStateFrom(g: GraphFile, from: string | null): void {
  if (from === null) g.state = null;
  else if (g.state) g.state.from = from;
  else g.state = { from, fields: [] };
}

/** 매개변수 선언 목록 (null 이면 매개변수 없음, 선언 파일도 만들지 않는다) */
export function setParams(g: GraphFile, params: Record<string, unknown>[] | null): void {
  g.params = params;
}

export function setUses(g: GraphFile, uses: string[]): void {
  g.uses = [...uses];
}

// ---- 메모 ----

/** 메모 id 는 노드 id 와도 겹치지 않는다 (선택이 둘을 같이 담는다) */
export function addComment(g: GraphFile, text: string, box: [number, number, number, number]): string {
  const taken = new Set([...g.nodes.map((n) => n.id), ...(g.comments ?? []).map((c) => c.id)]);
  let id = "note";
  for (let i = 2; taken.has(id); i++) id = `note_${i}`;
  g.comments = [...(g.comments ?? []), { id, text, box: box.map(Math.round) as [number, number, number, number] }];
  return id;
}

export function updateComment(g: GraphFile, id: string, patch: { text?: string; box?: [number, number, number, number] }): void {
  g.comments = (g.comments ?? []).map((c) => (c.id === id ? { ...c, ...patch, box: (patch.box ?? c.box).map(Math.round) as [number, number, number, number] } : c));
}

export function removeComments(g: GraphFile, ids: Iterable<string>): void {
  const gone = new Set(ids);
  g.comments = (g.comments ?? []).filter((c) => !gone.has(c.id));
  if (!g.comments.length) delete g.comments;
}

/** 메모 상자 안에 통째로 든 노드 (크기는 부르는 쪽이 준다) */
export function nodesInComment(g: GraphFile, comment: GraphComment, size: (id: string) => { width: number; height: number }): string[] {
  const [x, y, w, h] = comment.box;
  return g.nodes
    .filter((n) => {
      const p = g.layout[n.id];
      if (!p) return false;
      const s = size(n.id);
      return p[0] >= x && p[1] >= y && p[0] + s.width <= x + w && p[1] + s.height <= y + h;
    })
    .map((n) => n.id);
}
