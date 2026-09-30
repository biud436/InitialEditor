// 그래프 파일 포맷 v1 (scripts/components/<경로>.graph.json). 계약은 docs/plans/visual-scripting.md 2절.
//   노드는 id 로 잇는다. 실행 순서는 next 와 갈래(then, else, body, cases), 값은 in(노드 id 또는 "id.포트")과 args(상수)
//   캔버스 좌표는 노드가 아니라 layout 에 모은다. 노드를 옮기기만 하면 layout 의 줄만 바뀐다
//   모르는 키는 루트와 노드와 변수 선언에서 보존한다

export const GRAPH_VERSION = 1;

export const VAR_TYPES = ["number", "integer", "boolean", "string", "enum", "object"] as const;
export type VarType = (typeof VAR_TYPES)[number];

/** 상태 필드와 지역 변수의 선언 */
export interface VarDecl {
  key: string;
  type: VarType;
  label?: string;
  /** enum 의 값 목록 */
  values?: string[];
  default?: unknown;
  /** Ruby 쪽 이름. 없으면 snake_case (birdVy → bird_vy) */
  ruby?: string;
  extra?: Record<string, unknown>;
}

export interface GraphState {
  /** 상태 표를 얻는 곳. "scene" 이면 scene.state, "라이브러리.함수" 면 그 함수가 돌려주는 표 */
  from: string;
  fields: VarDecl[];
  extra?: Record<string, unknown>;
}

export interface GraphNode {
  id: string;
  kind: string;
  /** 변수와 필드 노드의 이름 (state, local, param, obj, prop) */
  field?: string;
  /** prop 노드의 값 형식 */
  type?: VarType;
  /** lib.call, api.call 의 함수 ("flappy.sfx", "Input.IsKeyDown") */
  fn?: string;
  /** lib.const 의 상수 ("flappy.GRAVITY") */
  const?: string;
  /** 입력 포트에 이은 값: 노드 id (출력 포트가 out 이면) 또는 "id.포트" */
  in?: Record<string, string>;
  /** 이어지지 않은 입력 포트의 상수 */
  args?: Record<string, unknown>;
  next?: string;
  then?: string;
  else?: string;
  body?: string;
  /** switch 의 갈래: 값 → 첫 노드. 맞는 값이 없으면 else */
  cases?: Record<string, string>;
  extra?: Record<string, unknown>;
}

/** 캔버스의 메모 상자. 코드에는 들어가지 않는다 */
export interface GraphComment {
  id: string;
  text: string;
  /** [x, y, 너비, 높이] */
  box: [number, number, number, number];
  extra?: Record<string, unknown>;
}

export interface GraphFile {
  version: number;
  /** 노드 라이브러리 파일 (*.nodes.json) */
  uses: string[];
  /** 매개변수 선언. 있으면 선언 파일 scripts/<논리 이름>.json 을 같이 만든다 (엔진 r1 5.4절의 fields) */
  params: Record<string, unknown>[] | null;
  state: GraphState | null;
  locals: VarDecl[];
  nodes: GraphNode[];
  layout: Record<string, [number, number]>;
  comments?: GraphComment[];
  extra?: Record<string, unknown>;
}

export class GraphFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphFormatError";
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function extraOf(raw: Record<string, unknown>, known: readonly string[]): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) if (!known.includes(k)) out[k] = v;
  return Object.keys(out).length ? out : undefined;
}

const VAR_KEYS = ["key", "type", "label", "values", "default", "ruby"] as const;
const NODE_KEYS = ["id", "kind", "field", "type", "fn", "const", "in", "args", "next", "then", "else", "body", "cases"] as const;
const ROOT_KEYS = ["version", "uses", "params", "state", "locals", "nodes", "layout", "comments"] as const;

function stringMap(raw: unknown, where: string): Record<string, string> | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) throw new GraphFormatError(`${where}는 객체여야 합니다`);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== "string") throw new GraphFormatError(`${where}.${k}는 문자열이어야 합니다`);
    out[k] = v;
  }
  return out;
}

function optString(raw: Record<string, unknown>, key: string, where: string): string | undefined {
  const v = raw[key];
  if (v === undefined) return undefined;
  if (typeof v !== "string") throw new GraphFormatError(`${where}.${key}는 문자열이어야 합니다`);
  return v;
}

/** 변수 선언 하나 (상태 필드, 지역 변수, 라이브러리가 선언한 상태 필드). 모양이 틀리면 GraphFormatError */
export function parseVar(raw: unknown, where: string): VarDecl {
  if (!isRecord(raw)) throw new GraphFormatError(`${where}는 객체여야 합니다`);
  if (typeof raw.key !== "string") throw new GraphFormatError(`${where}.key는 문자열이어야 합니다`);
  if (typeof raw.type !== "string" || !(VAR_TYPES as readonly string[]).includes(raw.type)) {
    throw new GraphFormatError(`${where}.type은 ${VAR_TYPES.join(", ")} 중 하나여야 합니다`);
  }
  const decl: VarDecl = { key: raw.key, type: raw.type as VarType };
  const label = optString(raw, "label", where);
  if (label !== undefined) decl.label = label;
  if (raw.values !== undefined) {
    if (!Array.isArray(raw.values) || raw.values.some((v) => typeof v !== "string")) throw new GraphFormatError(`${where}.values는 문자열 배열이어야 합니다`);
    decl.values = [...(raw.values as string[])];
  }
  if (raw.default !== undefined) decl.default = raw.default;
  const ruby = optString(raw, "ruby", where);
  if (ruby !== undefined) decl.ruby = ruby;
  const extra = extraOf(raw, VAR_KEYS);
  if (extra) decl.extra = extra;
  return decl;
}

function parseNode(raw: unknown, where: string): GraphNode {
  if (!isRecord(raw)) throw new GraphFormatError(`${where}는 객체여야 합니다`);
  if (typeof raw.id !== "string" || raw.id === "") throw new GraphFormatError(`${where}.id는 비어 있지 않은 문자열이어야 합니다`);
  if (typeof raw.kind !== "string" || raw.kind === "") throw new GraphFormatError(`${where}.kind는 비어 있지 않은 문자열이어야 합니다`);
  const node: GraphNode = { id: raw.id, kind: raw.kind };
  for (const key of ["field", "fn", "const", "next", "then", "else", "body"] as const) {
    const v = optString(raw, key, where);
    if (v !== undefined) node[key] = v;
  }
  if (raw.type !== undefined) {
    if (typeof raw.type !== "string" || !(VAR_TYPES as readonly string[]).includes(raw.type)) throw new GraphFormatError(`${where}.type은 ${VAR_TYPES.join(", ")} 중 하나여야 합니다`);
    node.type = raw.type as VarType;
  }
  const links = stringMap(raw.in, `${where}.in`);
  if (links) node.in = links;
  if (raw.args !== undefined) {
    if (!isRecord(raw.args)) throw new GraphFormatError(`${where}.args는 객체여야 합니다`);
    node.args = { ...raw.args };
  }
  const cases = stringMap(raw.cases, `${where}.cases`);
  if (cases) node.cases = cases;
  const extra = extraOf(raw, NODE_KEYS);
  if (extra) node.extra = extra;
  return node;
}

/** 그래프 파일 텍스트를 읽는다. 모양이 틀리면 GraphFormatError. 뜻의 검사는 validateGraph 가 한다 */
export function parseGraph(text: string): GraphFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new GraphFormatError(`JSON 구문 오류: ${(e as Error).message}`);
  }
  if (!isRecord(raw)) throw new GraphFormatError("최상위 값은 객체여야 합니다");
  if (raw.version !== GRAPH_VERSION) throw new GraphFormatError(`지원하지 않는 그래프 버전: ${String(raw.version)} (지원: ${GRAPH_VERSION})`);
  const uses = raw.uses === undefined ? [] : raw.uses;
  if (!Array.isArray(uses) || uses.some((u) => typeof u !== "string")) throw new GraphFormatError("uses는 문자열 배열이어야 합니다");
  let params: Record<string, unknown>[] | null = null;
  if (raw.params !== undefined) {
    if (!Array.isArray(raw.params) || raw.params.some((p) => !isRecord(p))) throw new GraphFormatError("params는 객체 배열이어야 합니다");
    params = raw.params.map((p) => ({ ...(p as Record<string, unknown>) }));
  }
  let state: GraphState | null = null;
  if (raw.state !== undefined) {
    if (!isRecord(raw.state)) throw new GraphFormatError("state는 객체여야 합니다");
    const from = raw.state.from === undefined ? "scene" : raw.state.from;
    if (typeof from !== "string") throw new GraphFormatError("state.from은 문자열이어야 합니다");
    const fields = raw.state.fields === undefined ? [] : raw.state.fields;
    if (!Array.isArray(fields)) throw new GraphFormatError("state.fields는 배열이어야 합니다");
    state = { from, fields: fields.map((f, i) => parseVar(f, `state.fields[${i}]`)) };
    const extra = extraOf(raw.state, ["from", "fields"]);
    if (extra) state.extra = extra;
  }
  const locals = raw.locals === undefined ? [] : raw.locals;
  if (!Array.isArray(locals)) throw new GraphFormatError("locals는 배열이어야 합니다");
  if (!Array.isArray(raw.nodes)) throw new GraphFormatError("nodes는 배열이어야 합니다");
  const layout: Record<string, [number, number]> = {};
  if (raw.layout !== undefined) {
    if (!isRecord(raw.layout)) throw new GraphFormatError("layout은 객체여야 합니다");
    for (const [id, pos] of Object.entries(raw.layout)) {
      if (!Array.isArray(pos) || pos.length !== 2 || pos.some((n) => typeof n !== "number" || !Number.isFinite(n))) {
        throw new GraphFormatError(`layout.${id}는 숫자 두 개의 배열이어야 합니다`);
      }
      layout[id] = [pos[0] as number, pos[1] as number];
    }
  }
  const graph: GraphFile = {
    version: GRAPH_VERSION,
    uses: [...(uses as string[])],
    params,
    state,
    locals: locals.map((l, i) => parseVar(l, `locals[${i}]`)),
    nodes: raw.nodes.map((n, i) => parseNode(n, `nodes[${i}]`)),
    layout,
  };
  if (raw.comments !== undefined) {
    if (!Array.isArray(raw.comments)) throw new GraphFormatError("comments는 배열이어야 합니다");
    graph.comments = raw.comments.map((c, i) => {
      const where = `comments[${i}]`;
      if (!isRecord(c)) throw new GraphFormatError(`${where}는 객체여야 합니다`);
      if (typeof c.id !== "string" || c.id === "") throw new GraphFormatError(`${where}.id는 비어 있지 않은 문자열이어야 합니다`);
      if (typeof c.text !== "string") throw new GraphFormatError(`${where}.text는 문자열이어야 합니다`);
      if (!Array.isArray(c.box) || c.box.length !== 4 || c.box.some((n) => typeof n !== "number" || !Number.isFinite(n))) throw new GraphFormatError(`${where}.box는 숫자 네 개의 배열이어야 합니다`);
      const comment: GraphComment = { id: c.id, text: c.text, box: [c.box[0], c.box[1], c.box[2], c.box[3]] as [number, number, number, number] };
      const extra = extraOf(c, ["id", "text", "box"]);
      if (extra) comment.extra = extra;
      return comment;
    });
  }
  const extra = extraOf(raw, ROOT_KEYS);
  if (extra) graph.extra = extra;
  return graph;
}

// ---- 쓰기 ----

/** 한 줄 JSON (쉼표와 콜론 뒤에 공백) */
export function inlineJson(value: unknown): string {
  if (Array.isArray(value)) return value.length === 0 ? "[]" : `[${value.map(inlineJson).join(", ")}]`;
  if (isRecord(value)) {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    return entries.length === 0 ? "{}" : `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${inlineJson(v)}`).join(", ")} }`;
  }
  return JSON.stringify(value);
}

function varJson(v: VarDecl): Record<string, unknown> {
  return { key: v.key, type: v.type, label: v.label, values: v.values, default: v.default, ruby: v.ruby, ...v.extra };
}

export function nodeJson(n: GraphNode): Record<string, unknown> {
  return {
    id: n.id,
    kind: n.kind,
    field: n.field,
    type: n.type,
    fn: n.fn,
    const: n.const,
    in: n.in && Object.keys(n.in).length ? n.in : undefined,
    args: n.args && Object.keys(n.args).length ? n.args : undefined,
    next: n.next,
    then: n.then,
    else: n.else,
    body: n.body,
    cases: n.cases && Object.keys(n.cases).length ? n.cases : undefined,
    ...n.extra,
  };
}

function lines(items: string[], indent: string): string {
  return items.length === 0 ? "[]" : `[\n${items.map((s) => indent + "  " + s).join(",\n")}\n${indent}]`;
}

/** 그래프를 파일 텍스트로. 노드와 변수는 한 줄에 하나, layout 은 노드 순서로 한 줄에 하나다 */
export function serializeGraph(g: GraphFile): string {
  const out: string[] = [];
  out.push(`  "version": ${GRAPH_VERSION}`);
  if (g.uses.length) out.push(`  "uses": ${inlineJson(g.uses)}`);
  if (g.params) out.push(`  "params": ${lines(g.params.map(inlineJson), "  ")}`);
  if (g.state) {
    const st: string[] = [`    "from": ${JSON.stringify(g.state.from)}`, `    "fields": ${lines(g.state.fields.map((f) => inlineJson(varJson(f))), "    ")}`];
    for (const [k, v] of Object.entries(g.state.extra ?? {})) st.push(`    ${JSON.stringify(k)}: ${inlineJson(v)}`);
    out.push(`  "state": {\n${st.join(",\n")}\n  }`);
  }
  if (g.locals.length) out.push(`  "locals": ${lines(g.locals.map((l) => inlineJson(varJson(l))), "  ")}`);
  out.push(`  "nodes": ${lines(g.nodes.map((n) => inlineJson(nodeJson(n))), "  ")}`);
  const ids = [...g.nodes.map((n) => n.id).filter((id) => g.layout[id]), ...Object.keys(g.layout).filter((id) => !g.nodes.some((n) => n.id === id))];
  if (ids.length) out.push(`  "layout": {\n${ids.map((id) => `    ${JSON.stringify(id)}: ${inlineJson(g.layout[id])}`).join(",\n")}\n  }`);
  if (g.comments?.length) out.push(`  "comments": ${lines(g.comments.map((c) => inlineJson({ id: c.id, text: c.text, box: c.box, ...c.extra })), "  ")}`);
  for (const [k, v] of Object.entries(g.extra ?? {})) out.push(`  ${JSON.stringify(k)}: ${inlineJson(v)}`);
  return `{\n${out.join(",\n")}\n}\n`;
}

/** 빈 그래프 (update 이벤트 하나) */
export function emptyGraph(): GraphFile {
  return { version: GRAPH_VERSION, uses: [], params: null, state: null, locals: [], nodes: [{ id: "update", kind: "event.update" }], layout: { update: [0, 0] } };
}
