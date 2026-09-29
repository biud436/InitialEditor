// 노드 종류: 종류마다 입력 포트, 출력, 실행 출구, 값의 형식. 검사기(validate.ts)와 생성기(codegen.ts)와 캔버스가 같이 본다.
//   실행 노드는 이벤트에서 next 와 갈래로 이어지는 문장이고, 값 노드는 쓰이는 자리에서 식으로 펼쳐진다

import type { ComponentField } from "../componentParams";
import type { GraphNode, VarDecl, VarType } from "./format";
import type { LibraryArg, NodeLibrary } from "./library";
import { splitLibraryRef } from "./library";
import { apiNode, type ApiParamType } from "./api";

/** 값의 형식. enum 의 repr 은 Ruby 에서 값을 쓰는 방법이다 (상태와 지역 변수는 Symbol, 매개변수는 문자열) */
export type GType =
  | { t: "number" }
  | { t: "integer" }
  | { t: "boolean" }
  | { t: "string" }
  | { t: "object" }
  | { t: "any" }
  | { t: "key" }
  | { t: "button" }
  | { t: "enum"; values: readonly string[]; repr: "symbol" | "string" };

/** 포트의 형식. numeric 은 number 나 integer, comparable 은 두 포트가 같은 형식, switchable 은 enum, string, integer */
export type PortType = GType | { t: "numeric" } | { t: "comparable" } | { t: "switchable" };

export type HookName = "init" | "update" | "render" | "destroy";
export const HOOKS: readonly HookName[] = ["init", "update", "render", "destroy"];

export type NodeCategory = "event" | "flow" | "variable" | "object" | "scene" | "math" | "logic" | "text" | "engine" | "library";

export interface PortDef {
  key: string;
  label: string;
  type: PortType;
  /** 이어지지도 상수도 없을 때: object 는 컴포넌트의 오브젝트, 나머지는 default 값 */
  optional?: boolean;
  default?: unknown;
}

export interface OutDef {
  key: string;
  label: string;
  type: GType;
}

export interface NodeSpec {
  /** 종류의 이름 ("상태 쓰기") */
  label: string;
  /** 설정 ("birdVy"). 캔버스의 제목 줄이 label 과 같이 보인다 */
  detail?: string;
  category: NodeCategory;
  exec: boolean;
  event?: HookName;
  /** next 말고 이 노드가 갖는 실행 출구 */
  exits: ("then" | "else" | "body" | "cases")[];
  inputs: PortDef[];
  /** 실행 노드의 출력(이벤트의 elapsed, 반복의 index)이거나 값 노드의 out */
  outputs: OutDef[];
  /** 값 노드의 out 형식이 입력에 따라 정해지면 */
  resolve?: (inputs: Record<string, GType | null>) => GType;
}

export interface GraphEnv {
  state: ReadonlyMap<string, VarDecl> | null;
  locals: ReadonlyMap<string, VarDecl>;
  params: ReadonlyMap<string, ComponentField>;
  libraries: ReadonlyMap<string, NodeLibrary>;
}

export const T = {
  number: { t: "number" } as GType,
  integer: { t: "integer" } as GType,
  boolean: { t: "boolean" } as GType,
  string: { t: "string" } as GType,
  object: { t: "object" } as GType,
  any: { t: "any" } as GType,
  key: { t: "key" } as GType,
  button: { t: "button" } as GType,
};

export function varType(decl: { type: VarType; values?: readonly string[] }, repr: "symbol" | "string"): GType {
  if (decl.type === "enum") return { t: "enum", values: decl.values ?? [], repr };
  return T[decl.type];
}

function paramType(field: ComponentField): GType {
  switch (field.type) {
    case "text":
    case "string":
    case "object":
      return T.string;
    case "enum":
      return { t: "enum", values: field.values ?? [], repr: "string" };
    default:
      return T[field.type];
  }
}

function libType(type: string, values: readonly string[] | undefined): GType {
  if (type === "enum") return { t: "enum", values: values ?? [], repr: "symbol" };
  if (type === "state") return T.any;
  return (T as Record<string, GType>)[type] ?? T.any;
}

function apiType(t: ApiParamType): GType {
  return T[t];
}

export function typeName(t: PortType | null): string {
  if (!t) return "알 수 없음";
  if (t.t === "enum") return `enum(${t.values.join(", ")})`;
  return t.t;
}

/** from 형식의 값을 to 형식의 자리에 쓸 수 있는가 */
export function assignable(to: PortType, from: GType): boolean {
  if (to.t === "any" || from.t === "any") return true;
  switch (to.t) {
    case "numeric":
      return from.t === "number" || from.t === "integer";
    case "number":
      return from.t === "number" || from.t === "integer";
    case "comparable":
      return true;
    case "switchable":
      return from.t === "enum" || from.t === "string" || from.t === "integer";
    case "enum":
      return from.t === "enum" && from.repr === to.repr && from.values.every((v) => to.values.includes(v));
    default:
      return to.t === from.t;
  }
}

/** 상수 v 가 형식 t 의 값인가. 아니면 무엇이어야 하는지 */
export function literalProblem(t: PortType, v: unknown): string | null {
  switch (t.t) {
    case "number":
    case "numeric":
      return typeof v === "number" && Number.isFinite(v) ? null : "숫자여야 합니다";
    case "integer":
      return typeof v === "number" && Number.isInteger(v) ? null : "정수여야 합니다";
    case "boolean":
      return typeof v === "boolean" ? null : "true 나 false 여야 합니다";
    case "string":
      return typeof v === "string" ? null : "문자열이어야 합니다";
    case "enum":
      return typeof v === "string" && t.values.includes(v) ? null : `${t.values.join(", ")} 중 하나여야 합니다`;
    case "key":
      return typeof v === "string" && /^[A-Z0-9_]+$/.test(v) ? null : "키 이름(SPACE, LEFT, Z 등)이어야 합니다";
    case "button":
      return v === "left" || v === "right" || v === "middle" ? null : "left, right, middle 중 하나여야 합니다";
    case "object":
      return "오브젝트는 상수로 줄 수 없습니다 (노드로 연결합니다)";
    case "any":
    case "comparable":
    case "switchable":
      return (typeof v === "number" && Number.isFinite(v)) || typeof v === "string" || typeof v === "boolean" ? null : "숫자, 문자열, true, false 중 하나여야 합니다";
  }
}

/** 상수의 형식 (any 자리에 쓴 상수) */
export function literalType(v: unknown): GType {
  if (typeof v === "boolean") return T.boolean;
  if (typeof v === "string") return T.string;
  if (typeof v === "number") return Number.isInteger(v) ? T.integer : T.number;
  return T.any;
}

function numericResult(inputs: Record<string, GType | null>): GType {
  const ts = Object.values(inputs);
  return ts.length > 0 && ts.every((t) => t?.t === "integer") ? T.integer : T.number;
}

const OBJ_FIELDS: Record<string, { type: GType; label: string; writable: boolean }> = {
  x: { type: T.number, label: "x", writable: true },
  y: { type: T.number, label: "y", writable: true },
  visible: { type: T.boolean, label: "보임", writable: true },
  animate: { type: T.boolean, label: "애니메이션", writable: true },
  id: { type: T.string, label: "id", writable: false },
  type: { type: T.string, label: "타입", writable: false },
};
export const OBJECT_FIELDS = Object.keys(OBJ_FIELDS);
export const WRITABLE_OBJECT_FIELDS = OBJECT_FIELDS.filter((k) => OBJ_FIELDS[k].writable);

const target: PortDef = { key: "target", label: "대상", type: T.object, optional: true };

function data(label: string, category: NodeCategory, inputs: PortDef[], out: GType | ((i: Record<string, GType | null>) => GType), detail?: string): NodeSpec {
  const fixed = typeof out === "function" ? T.any : out;
  return { label, detail, category, exec: false, exits: [], inputs, outputs: [{ key: "out", label: "값", type: fixed }], resolve: typeof out === "function" ? out : undefined };
}

function stmt(label: string, category: NodeCategory, inputs: PortDef[], detail?: string): NodeSpec {
  return { label, detail, category, exec: true, exits: [], inputs, outputs: [] };
}

const num = (key: string, label: string): PortDef => ({ key, label, type: { t: "numeric" } });

const BINARY_MATH: Record<string, string> = { "math.add": "덧셈", "math.sub": "뺄셈", "math.mul": "곱셈", "math.mod": "나머지", "math.min": "최솟값", "math.max": "최댓값" };
const UNARY_MATH: Record<string, string> = { "math.neg": "부호 반전", "math.abs": "절댓값" };
const FLOAT_MATH: Record<string, string> = { "math.sin": "사인", "math.cos": "코사인", "math.sqrt": "제곱근" };
const COMPARE: Record<string, string> = { "cmp.eq": "같음", "cmp.ne": "다름", "cmp.lt": "작음", "cmp.le": "작거나 같음", "cmp.gt": "큼", "cmp.ge": "크거나 같음" };

function libArgPort(a: LibraryArg): PortDef | null {
  if (a.type === "scene" || a.type === "state") return null;
  const type: PortType = a.type === "any" ? T.any : libType(a.type, a.values);
  const port: PortDef = { key: a.key, label: a.label ?? a.key, type };
  if (a.type === "object") port.optional = true;
  if (a.default !== undefined) {
    port.optional = true;
    port.default = a.default;
  }
  return port;
}

/** 노드의 사양. 종류나 설정이 틀리면 그 까닭(문자열) */
export function nodeSpec(node: GraphNode, env: GraphEnv): NodeSpec | string {
  const k = node.kind;
  switch (k) {
    case "event.init":
      return { label: "시작 (init)", category: "event", exec: true, event: "init", exits: [], inputs: [], outputs: [] };
    case "event.update":
      return { label: "매 틱 (update)", category: "event", exec: true, event: "update", exits: [], inputs: [], outputs: [{ key: "elapsed", label: "경과 시간 (ms)", type: T.number }] };
    case "event.render":
      return { label: "그리기 (render)", category: "event", exec: true, event: "render", exits: [], inputs: [], outputs: [] };
    case "event.destroy":
      return { label: "제거 (destroy)", category: "event", exec: true, event: "destroy", exits: [], inputs: [], outputs: [] };
    case "flow.branch":
      return { label: "조건 분기", category: "flow", exec: true, exits: ["then", "else"], inputs: [{ key: "cond", label: "조건", type: T.boolean }], outputs: [] };
    case "flow.switch":
      return { label: "값 분기", category: "flow", exec: true, exits: ["cases", "else"], inputs: [{ key: "value", label: "값", type: { t: "switchable" } }], outputs: [] };
    case "flow.repeat":
      return {
        label: "반복",
        category: "flow",
        exec: true,
        exits: ["body"],
        inputs: [{ key: "count", label: "횟수", type: T.integer }],
        outputs: [{ key: "index", label: "순번 (0부터)", type: T.integer }],
      };
    case "state.get":
    case "state.set": {
      if (!env.state) return "그래프에 상태(state)가 없습니다";
      const f = node.field === undefined ? undefined : env.state.get(node.field);
      if (!f) return `상태 필드가 없습니다: ${node.field ?? "(field 없음)"}`;
      const t = varType(f, "symbol");
      return k === "state.get" ? data("상태 읽기", "variable", [], t, f.key) : stmt("상태 쓰기", "variable", [{ key: "value", label: "값", type: t }], f.key);
    }
    case "local.get":
    case "local.set": {
      const f = node.field === undefined ? undefined : env.locals.get(node.field);
      if (!f) return `지역 변수가 없습니다: ${node.field ?? "(field 없음)"}`;
      const t = varType(f, "symbol");
      return k === "local.get" ? data("변수 읽기", "variable", [], t, f.key) : stmt("변수 쓰기", "variable", [{ key: "value", label: "값", type: t }], f.key);
    }
    case "param.get": {
      const f = node.field === undefined ? undefined : env.params.get(node.field);
      if (!f) return `매개변수가 없습니다: ${node.field ?? "(field 없음)"}`;
      return data("매개변수", "variable", [], paramType(f), f.key);
    }
    case "obj.self":
      return data("이 오브젝트", "object", [], T.object);
    case "obj.get":
    case "obj.set": {
      const f = node.field === undefined ? undefined : OBJ_FIELDS[node.field];
      if (!f) return `오브젝트 속성이 아닙니다: ${node.field ?? "(field 없음)"} (${OBJECT_FIELDS.join(", ")})`;
      if (k === "obj.get") return data("오브젝트 속성 읽기", "object", [target], f.type, node.field);
      if (!f.writable) return `쓸 수 없는 오브젝트 속성입니다: ${node.field}`;
      return stmt("오브젝트 속성 쓰기", "object", [target, { key: "value", label: "값", type: f.type }], node.field);
    }
    case "prop.get":
    case "prop.set": {
      if (typeof node.field !== "string" || node.field === "") return "props 키(field)가 필요합니다";
      if (!node.type || node.type === "enum" || node.type === "object") return "props 값의 형식(type)은 number, integer, boolean, string 중 하나여야 합니다";
      const t = T[node.type];
      return k === "prop.get"
        ? data("props 읽기", "object", [target], t, node.field)
        : stmt("props 쓰기", "object", [target, { key: "value", label: "값", type: t }], node.field);
    }
    case "scene.find":
      return data("오브젝트 찾기", "scene", [{ key: "id", label: "id", type: T.string }], T.object);
    case "scene.switch":
      return stmt("씬 전환", "scene", [{ key: "name", label: "씬 이름", type: T.string }]);
    case "scene.remove":
      return stmt("오브젝트 제거", "scene", [{ key: "id", label: "id", type: T.string }]);
    case "math.div":
      return data("나눗셈", "math", [num("a", "a"), num("b", "b")], T.number);
    case "math.clamp":
      return data("범위 제한", "math", [num("value", "값"), num("min", "최소"), num("max", "최대")], numericResult);
    case "math.floor":
      return data("내림", "math", [num("a", "a")], T.integer);
    case "math.random":
      return data("난수 (0 이상 1 미만)", "math", [], T.number);
    case "math.randomInt":
      return data("정수 난수", "math", [{ key: "min", label: "최소", type: T.integer }, { key: "max", label: "최대", type: T.integer }], T.integer);
    case "logic.and":
      return data("그리고", "logic", [{ key: "a", label: "a", type: T.boolean }, { key: "b", label: "b", type: T.boolean }], T.boolean);
    case "logic.or":
      return data("또는", "logic", [{ key: "a", label: "a", type: T.boolean }, { key: "b", label: "b", type: T.boolean }], T.boolean);
    case "logic.not":
      return data("부정", "logic", [{ key: "a", label: "a", type: T.boolean }], T.boolean);
    case "text.concat":
      return data("텍스트 합치기", "text", [{ key: "a", label: "a", type: T.any }, { key: "b", label: "b", type: T.any }], T.string);
    case "text.print":
      return stmt("콘솔 출력", "text", [{ key: "value", label: "값", type: T.any }]);
    case "lib.const": {
      const ref = node.const === undefined ? null : splitLibraryRef(node.const);
      const lib = ref ? env.libraries.get(ref[0]) : undefined;
      const c = ref && lib ? lib.constants.find((x) => x.key === ref[1]) : undefined;
      if (!c) return `라이브러리 상수가 없습니다: ${node.const ?? "(const 없음)"}`;
      return data(c.label ?? c.key, "library", [], c.type === "any" ? T.any : libType(c.type, c.values), `${lib!.name}.${c.key}`);
    }
    case "lib.call": {
      const ref = node.fn === undefined ? null : splitLibraryRef(node.fn);
      const lib = ref ? env.libraries.get(ref[0]) : undefined;
      const f = ref && lib ? lib.functions.find((x) => x.key === ref[1]) : undefined;
      if (!f) return `라이브러리 함수가 없습니다: ${node.fn ?? "(fn 없음)"}`;
      if (f.returns === "state") return `상태 표를 반환하는 함수는 state.from 에만 씁니다: ${node.fn}`;
      if (f.args.some((a) => a.type === "state") && !env.state) return `상태를 받는 함수인데 그래프에 상태(state)가 없습니다: ${node.fn}`;
      const inputs = f.args.map(libArgPort).filter((p): p is PortDef => p !== null);
      const label = f.label ?? f.key;
      return f.returns ? data(label, "library", inputs, libType(f.returns, f.values), `${lib!.name}.${f.key}`) : stmt(label, "library", inputs, `${lib!.name}.${f.key}`);
    }
    case "api.call": {
      const a = node.fn === undefined ? undefined : apiNode(node.fn);
      if (!a) return `엔진 API 노드가 없습니다: ${node.fn ?? "(fn 없음)"}`;
      const inputs = a.params.map((p) => ({ key: p.key, label: p.label, type: apiType(p.type), optional: p.default !== undefined, default: p.default }));
      return a.returns ? data(a.label, "engine", inputs, T[a.returns], a.id) : stmt(a.label, "engine", inputs, a.id);
    }
  }
  if (k in BINARY_MATH) return data(BINARY_MATH[k], "math", [num("a", "a"), num("b", "b")], numericResult);
  if (k in UNARY_MATH) return data(UNARY_MATH[k], "math", [num("a", "a")], numericResult);
  if (k in FLOAT_MATH) return data(FLOAT_MATH[k], "math", [num("a", "a")], T.number);
  if (k in COMPARE) {
    const ordered = k !== "cmp.eq" && k !== "cmp.ne";
    const t: PortType = ordered ? { t: "numeric" } : { t: "comparable" };
    return data(COMPARE[k], "logic", [{ key: "a", label: "a", type: t }, { key: "b", label: "b", type: t }], T.boolean);
  }
  return `알 수 없는 노드 종류입니다: ${k}`;
}

/** 설정 없이 캔버스의 노드 목록에 올리는 종류 (상태, 변수, 라이브러리, API 노드는 설정마다 따로 만든다) */
export const PLAIN_KINDS: readonly string[] = [
  "event.init", "event.update", "event.render", "event.destroy",
  "flow.branch", "flow.switch", "flow.repeat",
  "obj.self", "scene.find", "scene.switch", "scene.remove",
  "math.add", "math.sub", "math.mul", "math.div", "math.mod", "math.neg", "math.abs", "math.min", "math.max", "math.clamp",
  "math.sin", "math.cos", "math.sqrt", "math.floor", "math.random", "math.randomInt",
  "cmp.eq", "cmp.ne", "cmp.lt", "cmp.le", "cmp.gt", "cmp.ge", "logic.and", "logic.or", "logic.not",
  "text.concat", "text.print",
];
