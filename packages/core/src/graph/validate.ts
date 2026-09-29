// 그래프 검사: 모양(parseGraph) 다음의 뜻. 노드 종류와 설정, 실행 흐름(이벤트에서 한 갈래로만 이어지고 돌지 않는다),
// 값의 연결과 형식, 이벤트 출력과 반복 순번을 쓰는 범위. 오류가 없는 분석만 생성기(codegen.ts)가 받는다.

import { ComponentDeclarationError, parseComponentDeclaration, type ComponentField } from "../componentParams";
import type { GraphFile, GraphNode, VarDecl } from "./format";
import type { NodeLibrary } from "./library";
import { splitLibraryRef } from "./library";
import { IDENTIFIER, isLocalName, RUBY_KEYWORDS, snakeCase } from "./names";
import { KEY_CODES } from "./api";
import { assignable, HOOKS, literalProblem, literalType, nodeSpec, T, typeName, varType, type GraphEnv, type GType, type HookName, type NodeSpec, type PortDef, type PortType } from "./kinds";

export interface GraphProblem {
  severity: "error" | "warning";
  message: string;
  /** 문제가 있는 노드 */
  node?: string;
  port?: string;
}

export interface GraphContext {
  /** uses 의 경로 → 읽은 라이브러리, 또는 읽지 못한 까닭 */
  libraries: ReadonlyMap<string, NodeLibrary | string>;
}

export interface StatementInfo {
  hook: HookName;
  /** 이 문장을 감싼 반복 노드 (바깥부터) */
  repeats: string[];
  /** 이벤트 바로 아래가 0 */
  depth: number;
}

/** 입력 포트 하나의 값: 이은 출력, 상수, 비어 있음(선택 포트) */
export type InputValue = { kind: "link"; node: string; port: string } | { kind: "literal"; value: unknown } | { kind: "default" };

export interface GraphAnalysis {
  graph: GraphFile;
  env: GraphEnv;
  problems: GraphProblem[];
  errors: number;
  nodes: ReadonlyMap<string, GraphNode>;
  specs: ReadonlyMap<string, NodeSpec>;
  events: ReadonlyMap<HookName, string>;
  statements: ReadonlyMap<string, StatementInfo>;
  /** 노드마다 포트의 값과 그 자리의 형식 (상수를 어느 형식으로 쓸지 생성기가 본다) */
  inputs: ReadonlyMap<string, Record<string, { value: InputValue; type: GType }>>;
  /** 값 노드의 out 과 실행 노드의 출력 형식 */
  outType(node: string, port?: string): GType | null;
  /** Ruby 쪽 이름 (상태 필드는 Symbol 이름, 지역 변수는 변수 이름) */
  rubyStateName(key: string): string;
  rubyLocalName(key: string): string;
}

function exitTargets(n: GraphNode): [string, string][] {
  const out: [string, string][] = [];
  if (n.next !== undefined) out.push(["next", n.next]);
  if (n.then !== undefined) out.push(["then", n.then]);
  if (n.else !== undefined) out.push(["else", n.else]);
  if (n.body !== undefined) out.push(["body", n.body]);
  for (const [v, id] of Object.entries(n.cases ?? {})) out.push([`cases.${v}`, id]);
  return out;
}

/** "id" 나 "id.port" */
export function parseLink(link: string): { node: string; port: string } {
  const dot = link.indexOf(".");
  return dot < 0 ? { node: link, port: "out" } : { node: link.slice(0, dot), port: link.slice(dot + 1) };
}

export function validateGraph(graph: GraphFile, ctx: GraphContext): GraphAnalysis {
  const problems: GraphProblem[] = [];
  const error = (message: string, node?: string, port?: string) => problems.push({ severity: "error", message, node, port });
  const warn = (message: string, node?: string, port?: string) => problems.push({ severity: "warning", message, node, port });

  // ---- 라이브러리, 매개변수, 상태, 지역 변수 ----
  const libraries = new Map<string, NodeLibrary>();
  for (const path of graph.uses) {
    const lib = ctx.libraries.get(path);
    if (lib === undefined) error(`노드 라이브러리를 읽지 못했습니다: ${path}`);
    else if (typeof lib === "string") error(`노드 라이브러리 ${path}: ${lib}`);
    else if (libraries.has(lib.name)) error(`노드 라이브러리 이름이 겹칩니다: ${lib.name} (${path})`);
    else libraries.set(lib.name, lib);
  }

  const params = new Map<string, ComponentField>();
  if (graph.params) {
    try {
      for (const f of parseComponentDeclaration(JSON.stringify({ version: 1, fields: graph.params })).fields) params.set(f.key, f);
    } catch (e) {
      if (!(e instanceof ComponentDeclarationError)) throw e;
      error(`매개변수 선언: ${e.message}`);
    }
  }

  const rubyState = new Map<string, string>();
  const rubyLocal = new Map<string, string>();
  const checkVar = (v: VarDecl, where: string, repr: "symbol", seenRuby: Map<string, string>) => {
    if (v.type === "enum") {
      if (!v.values || v.values.length === 0 || v.values.some((x) => x === "") || new Set(v.values).size !== v.values.length) {
        error(`${where} ${v.key}: enum 값(values)은 비어 있지 않고 서로 다른 문자열이어야 합니다`);
      }
    } else if (v.values !== undefined) error(`${where} ${v.key}: values는 enum 타입에만 사용할 수 있습니다`);
    if (v.default !== undefined) {
      const p = v.type === "object" ? "오브젝트는 기본값을 가질 수 없습니다" : literalProblem(varType(v, repr), v.default);
      if (p) error(`${where} ${v.key}의 기본값: ${p}`);
    }
    const ruby = seenRuby.get(v.key)!;
    for (const [other, r] of seenRuby) if (other !== v.key && r === ruby) error(`${where} ${v.key}와 ${other}의 Ruby 이름이 같습니다: ${ruby}`);
  };

  let state: Map<string, VarDecl> | null = null;
  if (graph.state) {
    state = new Map();
    const from = graph.state.from;
    if (from !== "scene") {
      const ref = splitLibraryRef(from);
      const lib = ref ? libraries.get(ref[0]) : undefined;
      const fn = ref && lib ? lib.functions.find((f) => f.key === ref[1]) : undefined;
      if (!fn) error(`state.from은 "scene" 이나 상태 표를 반환하는 라이브러리 함수여야 합니다: ${from}`);
      else if (fn.returns !== "state" || fn.args.some((a) => a.type !== "scene")) error(`state.from 함수는 scene 만 받고 state 를 반환해야 합니다: ${from}`);
    }
    for (const f of graph.state.fields) {
      if (!IDENTIFIER.test(f.key)) {
        error(`상태 필드 이름은 식별자여야 합니다: ${f.key}`);
        continue;
      }
      if (state.has(f.key)) {
        error(`상태 필드 이름이 겹칩니다: ${f.key}`);
        continue;
      }
      const ruby = f.ruby ?? snakeCase(f.key);
      if (!/^[a-z_][a-z0-9_]*$/.test(ruby)) error(`상태 필드 ${f.key}: Ruby 이름은 소문자 식별자여야 합니다: ${ruby}`);
      state.set(f.key, f);
      rubyState.set(f.key, ruby);
    }
    for (const f of state.values()) checkVar(f, "상태 필드", "symbol", rubyState);
  }

  const locals = new Map<string, VarDecl>();
  for (const l of graph.locals) {
    if (!isLocalName(l.key) || l.key.startsWith("_")) {
      error(`지역 변수 이름은 소문자로 시작하는 식별자여야 하고 예약어나 생성 코드의 이름이 아니어야 합니다: ${l.key}`);
      continue;
    }
    if (locals.has(l.key)) {
      error(`지역 변수 이름이 겹칩니다: ${l.key}`);
      continue;
    }
    if (libraries.has(l.key)) error(`지역 변수 이름이 노드 라이브러리 이름과 같습니다: ${l.key}`);
    const ruby = snakeCase(l.key);
    if (RUBY_KEYWORDS.has(ruby)) error(`지역 변수 ${l.key}의 Ruby 이름이 예약어입니다: ${ruby}`);
    locals.set(l.key, l);
    rubyLocal.set(l.key, ruby);
  }
  for (const l of locals.values()) checkVar(l, "지역 변수", "symbol", rubyLocal);

  const env: GraphEnv = { state, locals, params, libraries };

  // ---- 노드와 사양 ----
  const nodes = new Map<string, GraphNode>();
  const specs = new Map<string, NodeSpec>();
  const events = new Map<HookName, string>();
  for (const n of graph.nodes) {
    if (!IDENTIFIER.test(n.id)) {
      error(`노드 id는 식별자여야 합니다: ${n.id}`, n.id);
      continue;
    }
    if (nodes.has(n.id)) {
      error(`노드 id가 겹칩니다: ${n.id}`, n.id);
      continue;
    }
    nodes.set(n.id, n);
    const spec = nodeSpec(n, env);
    if (typeof spec === "string") {
      error(spec, n.id);
      continue;
    }
    specs.set(n.id, spec);
    if (spec.event) {
      if (events.has(spec.event)) error(`${spec.label} 이벤트가 두 개입니다: ${events.get(spec.event)}, ${n.id}`, n.id);
      else events.set(spec.event, n.id);
    }
  }

  // ---- 실행 출구 ----
  const incoming = new Map<string, string>();
  for (const [id, n] of nodes) {
    const spec = specs.get(id);
    if (!spec) continue;
    for (const [exit, target] of exitTargets(n)) {
      const slot = exit.startsWith("cases.") ? "cases" : exit;
      if (!spec.exec) {
        error(`값 노드에는 실행 출구(${exit})가 없습니다`, id);
        continue;
      }
      if (slot !== "next" && !(spec.exits as string[]).includes(slot)) {
        error(`이 노드에는 ${exit} 출구가 없습니다`, id);
        continue;
      }
      const t = specs.get(target);
      if (!nodes.has(target)) error(`${exit} 출구가 없는 노드를 가리킵니다: ${target}`, id);
      else if (!t) continue;
      else if (!t.exec) error(`${exit} 출구는 실행 노드를 가리켜야 합니다: ${target}`, id);
      else if (t.event) error(`${exit} 출구가 이벤트 노드를 가리킵니다: ${target}`, id);
      else if (incoming.has(target)) error(`실행 흐름이 한 노드로 두 번 들어옵니다: ${incoming.get(target)}, ${id} → ${target}`, target);
      else incoming.set(target, id);
    }
  }

  // ---- 이벤트에서 이어지는 문장 ----
  const statements = new Map<string, StatementInfo>();
  const walk = (head: string | undefined, hook: HookName, repeats: string[], depth: number) => {
    for (let id = head; id !== undefined; ) {
      const n = nodes.get(id);
      const spec = specs.get(id);
      if (!n || !spec || !spec.exec || spec.event) return;
      if (statements.has(id)) {
        error(`실행 흐름이 순환합니다: ${id}`, id);
        return;
      }
      statements.set(id, { hook, repeats, depth });
      walk(n.then, hook, repeats, depth + 1);
      walk(n.else, hook, repeats, depth + 1);
      for (const c of Object.values(n.cases ?? {})) walk(c, hook, repeats, depth + 1);
      if (n.kind === "flow.repeat") walk(n.body, hook, [...repeats, id], depth + 1);
      id = n.next;
    }
  };
  for (const hook of HOOKS) {
    const ev = events.get(hook);
    if (ev) walk(nodes.get(ev)!.next, hook, [], 0);
  }
  for (const [id, spec] of specs) {
    if (spec.exec && !spec.event && !statements.has(id)) warn("이벤트에서 이어지지 않아 코드로 만들지 않습니다", id);
  }

  // ---- 값의 연결과 형식 ----
  const inputs = new Map<string, Record<string, { value: InputValue; type: GType }>>();
  const outTypes = new Map<string, GType | null>();
  const resolving = new Set<string>();

  const outputType = (id: string, port: string): GType | null => {
    const spec = specs.get(id);
    if (!spec) return null;
    if (spec.exec) return spec.outputs.find((o) => o.key === port)?.type ?? null;
    if (port !== "out") return null;
    if (outTypes.has(id)) return outTypes.get(id)!;
    if (resolving.has(id)) return null;
    resolving.add(id);
    const resolved = resolveInputs(id);
    resolving.delete(id);
    const t = spec.resolve ? spec.resolve(Object.fromEntries(Object.entries(resolved).map(([k, v]) => [k, v?.type ?? null]))) : spec.outputs[0].type;
    outTypes.set(id, t);
    return t;
  };

  /** 포트의 값과 형식. 형식 검사와 문제 보고는 checkInputs 가 한다 */
  const linkedType = (link: string): GType | null => {
    const { node, port } = parseLink(link);
    return nodes.has(node) ? outputType(node, port) : null;
  };

  const concrete = (port: PortDef, value: InputValue, other: GType | null): GType => {
    const t = port.type;
    if (value.kind === "link") return linkedType(`${value.node}.${value.port}`) ?? T.any;
    const v = value.kind === "literal" ? value.value : port.default;
    if (t.t === "numeric" || t.t === "any") return v === undefined ? (t.t === "numeric" ? T.number : T.any) : literalType(v);
    if (t.t === "comparable" || t.t === "switchable") return other ?? (v === undefined ? T.any : literalType(v));
    return t as GType;
  };

  const resolveInputs = (id: string): Record<string, { value: InputValue; type: GType } | null> => {
    const n = nodes.get(id)!;
    const spec = specs.get(id)!;
    const out: Record<string, { value: InputValue; type: GType } | null> = {};
    const values: Record<string, InputValue | null> = {};
    for (const p of spec.inputs) {
      const link = n.in?.[p.key];
      if (link !== undefined) values[p.key] = { kind: "link", ...parseLink(link) };
      else if (n.args && p.key in n.args) values[p.key] = { kind: "literal", value: n.args[p.key] };
      else if (p.optional) values[p.key] = { kind: "default" };
      else values[p.key] = null;
    }
    // comparable 은 이어진 쪽의 형식을 상수 쪽에도 준다
    const linked = spec.inputs.map((p) => values[p.key]).find((v) => v?.kind === "link");
    const other = linked && linked.kind === "link" ? linkedType(`${linked.node}.${linked.port}`) : null;
    for (const p of spec.inputs) {
      const v = values[p.key];
      out[p.key] = v ? { value: v, type: concrete(p, v, other) } : null;
    }
    return out;
  };

  const checkInputs = (id: string) => {
    const n = nodes.get(id)!;
    const spec = specs.get(id)!;
    const ports = new Set(spec.inputs.map((p) => p.key));
    for (const k of Object.keys(n.in ?? {})) if (!ports.has(k)) error(`알 수 없는 입력 포트입니다: ${k}`, id, k);
    for (const k of Object.keys(n.args ?? {})) {
      if (!ports.has(k)) error(`알 수 없는 입력 포트의 상수입니다: ${k}`, id, k);
      else if (n.in?.[k] !== undefined) warn(`입력 ${k}에 연결과 상수가 함께 있습니다 (연결을 씁니다)`, id, k);
    }
    const resolved = resolveInputs(id);
    const record: Record<string, { value: InputValue; type: GType }> = {};
    const linkTypes: GType[] = [];
    for (const p of spec.inputs) {
      const r = resolved[p.key];
      if (!r) {
        error(`입력이 비어 있습니다: ${p.label}`, id, p.key);
        continue;
      }
      record[p.key] = r;
      if (r.value.kind === "link") {
        const { node, port } = r.value;
        const src = nodes.get(node);
        const srcSpec = specs.get(node);
        if (!src) {
          error(`입력 ${p.label}이 없는 노드를 가리킵니다: ${node}`, id, p.key);
          continue;
        }
        if (!srcSpec) continue;
        if (!srcSpec.outputs.some((o) => o.key === port)) {
          error(`입력 ${p.label}이 가리키는 출력이 없습니다: ${node}.${port}`, id, p.key);
          continue;
        }
        const t = outputType(node, port);
        if (t === null) continue;
        if (!assignable(p.type, t)) error(`입력 ${p.label}에 ${typeName(t)} 값을 이을 수 없습니다 (필요: ${typeName(p.type)})`, id, p.key);
        linkTypes.push(t);
      } else if (r.value.kind === "literal") {
        const want: PortType = p.type.t === "comparable" || p.type.t === "switchable" ? r.type : p.type;
        const problem = literalProblem(want, r.value.value) ?? keyProblem(want, r.value.value);
        if (problem) error(`입력 ${p.label}의 상수: ${problem}`, id, p.key);
      }
    }
    if (spec.inputs.some((p) => p.type.t === "comparable") && linkTypes.length === 2 && !assignable(linkTypes[0], linkTypes[1]) && !assignable(linkTypes[1], linkTypes[0])) {
      error(`비교하는 두 값의 형식이 다릅니다: ${typeName(linkTypes[0])}, ${typeName(linkTypes[1])}`, id);
    }
    inputs.set(id, record);
  };

  const keyProblem = (t: PortType, v: unknown): string | null => (t.t === "key" && typeof v === "string" && !(v in KEY_CODES) ? `알 수 없는 키 이름입니다: ${v}` : null);

  // 값 노드의 순환: 이은 값 노드를 따라가며 경로에 다시 나오면 순환이다
  const dataCycle = new Set<string>();
  const onPath = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string) => {
    if (done.has(id)) return;
    if (onPath.has(id)) {
      dataCycle.add(id);
      return;
    }
    onPath.add(id);
    for (const link of Object.values(nodes.get(id)?.in ?? {})) {
      const { node } = parseLink(link);
      if (specs.get(node) && !specs.get(node)!.exec) visit(node);
    }
    onPath.delete(id);
    done.add(id);
  };
  for (const [id, spec] of specs) if (!spec.exec) visit(id);
  for (const id of dataCycle) error("값의 연결이 순환합니다", id);

  if (dataCycle.size === 0) for (const id of specs.keys()) checkInputs(id);

  // switch 갈래의 값
  for (const [id, n] of nodes) {
    if (n.kind !== "flow.switch" || !specs.has(id)) continue;
    const t = inputs.get(id)?.value?.type;
    for (const v of Object.keys(n.cases ?? {})) {
      if (t?.t === "enum" && !t.values.includes(v)) error(`값 분기의 갈래 ${v}는 ${t.values.join(", ")} 중 하나여야 합니다`, id);
      if (t?.t === "integer" && !/^-?\d+$/.test(v)) error(`값 분기의 갈래 ${v}는 정수여야 합니다`, id);
    }
  }

  // ---- 범위: 이벤트 출력은 그 이벤트의 문장에서만, 반복 순번은 그 반복 안에서만 ----
  const scopedRefs = (id: string, seen = new Set<string>()): { node: string; port: string }[] => {
    if (seen.has(id)) return [];
    seen.add(id);
    const out: { node: string; port: string }[] = [];
    for (const link of Object.values(nodes.get(id)?.in ?? {})) {
      const ref = parseLink(link);
      const spec = specs.get(ref.node);
      if (!spec) continue;
      if (spec.exec) out.push(ref);
      else out.push(...scopedRefs(ref.node, seen));
    }
    return out;
  };
  if (dataCycle.size === 0) {
    for (const [id, info] of statements) {
      for (const ref of scopedRefs(id)) {
        const spec = specs.get(ref.node)!;
        if (spec.event && events.get(info.hook) !== ref.node) error(`${spec.label}의 출력 ${ref.port}는 그 이벤트의 흐름 안에서만 쓸 수 있습니다`, id);
        if (ref.node !== id && nodes.get(ref.node)!.kind === "flow.repeat" && !info.repeats.includes(ref.node)) error(`반복 ${ref.node}의 순번은 그 반복의 본문 안에서만 쓸 수 있습니다`, id);
        if (ref.node === id) error("반복의 순번을 그 반복의 횟수에 쓸 수 없습니다", id);
      }
    }
  }

  return {
    graph,
    env,
    problems,
    errors: problems.filter((p) => p.severity === "error").length,
    nodes,
    specs,
    events,
    statements,
    inputs,
    outType: (node, port = "out") => outputType(node, port),
    rubyStateName: (key) => rubyState.get(key) ?? snakeCase(key),
    rubyLocalName: (key) => rubyLocal.get(key) ?? snakeCase(key),
  };
}
