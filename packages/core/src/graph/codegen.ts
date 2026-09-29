// 그래프에서 Lua 와 Ruby 컴포넌트를 만든다 (검사를 오류 없이 통과한 분석만 받는다).
//   값 노드는 쓰이는 자리마다 식으로 펼친다. 상태 표는 훅마다 한 번 st 로 받고, 지역 변수는 훅 안의 지역 변수다
//   줄마다 그 줄을 만든 노드를 적어 두어(lines) 실행 중 오류의 줄에서 노드를 찾는다

import { apiNode, KEY_CODES, MOUSE_BUTTONS } from "./api";
import type { GraphNode, VarDecl } from "./format";
import { HOOKS, varType, type GType, type HookName } from "./kinds";
import { splitLibraryRef, type NodeLibrary } from "./library";
import { generatedPaths, IDENTIFIER, LUA_KEYWORDS, rubyClassPath } from "./names";
import type { GraphAnalysis } from "./validate";

export const GENERATED_MARKER = "그래프에서 만든 파일: ";
const GENERATED_LINE = /^(?:--|#) 그래프에서 만든 파일: (\S+)/;

/** 생성 파일의 첫 줄이면 그래프 경로, 아니면 null (손으로 쓴 파일) */
export function generatedFrom(text: string): string | null {
  const m = GENERATED_LINE.exec(text.slice(0, 500));
  return m ? m[1] : null;
}

export interface GeneratedFile {
  path: string;
  text: string;
  /** 줄(0부터)마다 그 줄을 만든 노드 id */
  lines: (string | null)[];
}

export interface GeneratedComponent {
  lua: GeneratedFile;
  ruby: GeneratedFile;
  /** 그래프가 매개변수를 선언했을 때의 선언 파일 */
  declaration: GeneratedFile | null;
}

export class GraphCodegenError extends Error {}

interface Expr {
  code: string;
  prec: number;
  /** 이항 연산자로 끝난 식이면 그 연산자 */
  op?: string;
}

const P = { OR: 1, AND: 2, CMP: 3, CONCAT: 4, ADD: 5, MUL: 6, UNARY: 7, ATOM: 9 };

const HOOK_ARGS: Record<HookName, { lua: string; ruby: string }> = {
  init: { lua: "obj, scene, params", ruby: "obj, scene" },
  update: { lua: "obj, scene, elapsed, params", ruby: "obj, scene, elapsed" },
  render: { lua: "obj, scene, params", ruby: "obj, scene" },
  destroy: { lua: "obj, scene, params", ruby: "obj, scene" },
};

function escapeString(s: string, ruby = false): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (ch === "\\") out += "\\\\";
    else if (ch === '"') out += '\\"';
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (ruby && ch === "#") out += "\\#";
    else if (c < 0x20 || c === 0x7f) out += ruby ? `\\x${c.toString(16).padStart(2, "0")}` : `\\${c}`;
    else out += ch;
  }
  return out;
}

function numberCode(v: number, float = false): Expr {
  const code = float && Number.isInteger(v) ? `${v}.0` : String(v);
  return { code, prec: v < 0 || Object.is(v, -0) ? P.UNARY : P.ATOM };
}

interface HookPlan {
  usesState: boolean;
  /** 훅 맨 위에서 기본값으로 만드는 지역 변수 */
  hoisted: string[];
  /** 그 자리에서 선언하는 local.set 노드 */
  inlineDecl: Set<string>;
}

abstract class Emitter {
  readonly out: string[] = [];
  readonly map: (string | null)[] = [];
  abstract readonly indentUnit: string;

  constructor(protected readonly a: GraphAnalysis) {}

  protected line(indent: number, text: string, node: string | null) {
    this.out.push(text === "" ? "" : this.indentUnit.repeat(indent) + text);
    this.map.push(node);
  }

  protected node(id: string): GraphNode {
    return this.a.nodes.get(id)!;
  }

  protected wrap(e: Expr, min: number): string {
    return e.prec < min ? `(${e.code})` : e.code;
  }

  /** 그래프의 계산 순서를 지킨다: 오른쪽의 같은 순위 식은 괄호로 싼다. assoc 은 순서와 결과가 무관한 연산자(.., and, or)다 */
  protected binary(op: string, prec: number, a: Expr, b: Expr, assoc = false): Expr {
    const left = this.wrap(a, prec);
    const right = b.prec > prec || (assoc && b.prec === prec && b.op === op) ? b.code : `(${b.code})`;
    return { code: `${left} ${op} ${right}`, prec, op };
  }

  protected library(ref: string): [NodeLibrary, string] {
    const [name, key] = splitLibraryRef(ref)!;
    return [this.a.env.libraries.get(name)!, key];
  }

  /** 포트 하나의 값 */
  protected input(id: string, port: string): Expr {
    const r = this.a.inputs.get(id)![port];
    if (r.value.kind === "link") return this.output(r.value.node, r.value.port);
    if (r.value.kind === "literal") return this.literal(r.value.value, r.type);
    const def = this.a.specs.get(id)!.inputs.find((p) => p.key === port)!;
    if (def.type.t === "object") return { code: "obj", prec: P.ATOM };
    return this.literal(def.default, r.type);
  }

  protected isLiteral(id: string, port: string): boolean {
    return this.a.inputs.get(id)![port].value.kind !== "link";
  }

  protected inputType(id: string, port: string): GType {
    return this.a.inputs.get(id)![port].type;
  }

  /** 노드의 출력 */
  protected output(id: string, port: string): Expr {
    const spec = this.a.specs.get(id)!;
    if (spec.exec) {
      if (spec.event === "update" && port === "elapsed") return { code: "elapsed", prec: P.ATOM };
      if (this.node(id).kind === "flow.repeat") return { code: `_i_${id}`, prec: P.ATOM };
      throw new GraphCodegenError(`출력이 없는 노드: ${id}.${port}`);
    }
    return this.value(this.node(id));
  }

  protected literal(v: unknown, t: GType): Expr {
    switch (t.t) {
      case "number":
        return numberCode(v as number, true);
      case "integer":
        return numberCode(v as number);
      case "boolean":
        return { code: v ? "true" : "false", prec: P.ATOM };
      case "string":
        return this.stringLit(String(v));
      case "enum":
        return this.enumLit(String(v), t.repr);
      case "key":
        return this.keyLit(String(v));
      case "button":
        return this.buttonLit(String(v));
      default:
        if (typeof v === "number") return numberCode(v);
        if (typeof v === "boolean") return { code: v ? "true" : "false", prec: P.ATOM };
        return this.stringLit(String(v));
    }
  }

  // ---- 문장 ----

  protected plan(hook: HookName): HookPlan {
    const plan: HookPlan = { usesState: false, hoisted: [], inlineDecl: new Set() };
    const seen = new Set<string>();
    const touchData = (id: string, visited: Set<string>) => {
      if (visited.has(id)) return;
      visited.add(id);
      const n = this.node(id);
      if (n.kind === "state.get") plan.usesState = true;
      if (n.kind === "lib.call") this.touchLibCall(n, plan);
      if (n.kind === "local.get" && !seen.has(n.field!)) {
        seen.add(n.field!);
        plan.hoisted.push(n.field!);
      }
      this.eachLink(n, (src) => {
        if (!this.a.specs.get(src)!.exec) touchData(src, visited);
      });
    };
    const visitChain = (head: string | undefined, depth: number) => {
      for (let id = head; id !== undefined; id = this.node(id).next) {
        const n = this.node(id);
        const visited = new Set<string>();
        this.eachLink(n, (src) => {
          if (!this.a.specs.get(src)!.exec) touchData(src, visited);
        });
        if (n.kind === "state.set") plan.usesState = true;
        if (n.kind === "lib.call") this.touchLibCall(n, plan);
        if (n.kind === "local.set" && !seen.has(n.field!)) {
          seen.add(n.field!);
          if (depth === 0) plan.inlineDecl.add(id);
          else plan.hoisted.push(n.field!);
        }
        visitChain(n.then, depth + 1);
        visitChain(n.else, depth + 1);
        for (const c of Object.values(n.cases ?? {})) visitChain(c, depth + 1);
        visitChain(n.body, depth + 1);
      }
    };
    const ev = this.a.events.get(hook);
    if (ev) visitChain(this.node(ev).next, 0);
    if (hook === "init" && this.stateDefaults().length) plan.usesState = true;
    return plan;
  }

  private touchLibCall(n: GraphNode, plan: HookPlan) {
    const [lib, key] = this.library(n.fn!);
    if (lib.functions.find((f) => f.key === key)!.args.some((x) => x.type === "state")) plan.usesState = true;
  }

  private eachLink(n: GraphNode, cb: (src: string) => void) {
    for (const link of Object.values(n.in ?? {})) {
      const dot = link.indexOf(".");
      cb(dot < 0 ? link : link.slice(0, dot));
    }
  }

  protected stateDefaults(): VarDecl[] {
    return [...(this.a.env.state?.values() ?? [])].filter((f) => f.default !== undefined);
  }

  protected localDefault(key: string): Expr {
    const decl = this.a.env.locals.get(key)!;
    const t = varType(decl, "symbol");
    if (decl.default !== undefined) return this.literal(decl.default, t);
    switch (decl.type) {
      case "number":
        return this.literal(0, t);
      case "integer":
        return this.literal(0, t);
      case "boolean":
        return this.literal(false, t);
      case "string":
        return this.literal("", t);
      case "enum":
        return this.literal(decl.values![0], t);
      default:
        return { code: this.nil, prec: P.ATOM };
    }
  }

  protected chain(head: string | undefined, indent: number, plan: HookPlan) {
    for (let id = head; id !== undefined; id = this.node(id).next) this.statement(this.node(id), indent, plan);
  }

  protected hooks(): HookName[] {
    return HOOKS.filter((h) => this.a.events.has(h) || (h === "init" && this.stateDefaults().length > 0));
  }

  abstract readonly nil: string;
  protected abstract value(n: GraphNode): Expr;
  protected abstract statement(n: GraphNode, indent: number, plan: HookPlan): void;
  protected abstract stringLit(s: string): Expr;
  protected abstract enumLit(v: string, repr: "symbol" | "string"): Expr;
  protected abstract keyLit(name: string): Expr;
  protected abstract buttonLit(name: string): Expr;
}

// ---- Lua ----

function luaField(base: string, key: string): string {
  return IDENTIFIER.test(key) && !LUA_KEYWORDS.has(key) ? `${base}.${key}` : `${base}[${JSON.stringify(key)}]`;
}

class LuaEmitter extends Emitter {
  readonly indentUnit = "\t";
  readonly nil = "nil";

  protected stringLit(s: string): Expr {
    return { code: `"${escapeString(s)}"`, prec: P.ATOM };
  }
  protected enumLit(v: string): Expr {
    return this.stringLit(v);
  }
  protected keyLit(name: string): Expr {
    return { code: String(KEY_CODES[name]), prec: P.ATOM };
  }
  protected buttonLit(name: string): Expr {
    return { code: String(MOUSE_BUTTONS[name]), prec: P.ATOM };
  }

  private call(fn: string, args: Expr[]): Expr {
    return { code: `${fn}(${args.map((a) => a.code).join(", ")})`, prec: P.ATOM };
  }

  private target(id: string): string {
    return this.wrap(this.input(id, "target"), P.ATOM);
  }

  private libArgs(n: GraphNode): Expr[] {
    const [lib, key] = this.library(n.fn!);
    return lib.functions.find((f) => f.key === key)!.args.map((a) => (a.type === "scene" ? { code: "scene", prec: P.ATOM } : a.type === "state" ? { code: "st", prec: P.ATOM } : this.input(n.id, a.key)));
  }

  private apiCall(n: GraphNode): Expr {
    const def = apiNode(n.fn!)!;
    return this.call(def.lua, def.params.map((p) => this.input(n.id, p.key)));
  }

  private tostr(id: string, port: string): Expr {
    const e = this.input(id, port);
    return this.inputType(id, port).t === "string" ? e : this.call("tostring", [e]);
  }

  protected value(n: GraphNode): Expr {
    const id = n.id;
    const i = (port: string) => this.input(id, port);
    switch (n.kind) {
      case "state.get":
        return { code: luaField("st", n.field!), prec: P.ATOM };
      case "local.get":
        return { code: n.field!, prec: P.ATOM };
      case "param.get":
        return { code: luaField("params", n.field!), prec: P.ATOM };
      case "obj.self":
        return { code: "obj", prec: P.ATOM };
      case "obj.get":
        return { code: `${this.target(id)}.${n.field}`, prec: P.ATOM };
      case "prop.get":
        return { code: luaField(`${this.target(id)}.props`, n.field!), prec: P.ATOM };
      case "scene.find":
        return this.call("scene:find", [i("id")]);
      case "math.add":
        return this.binary("+", P.ADD, i("a"), i("b"));
      case "math.sub":
        return this.binary("-", P.ADD, i("a"), i("b"));
      case "math.mul":
        return this.binary("*", P.MUL, i("a"), i("b"));
      case "math.div":
        return this.binary("/", P.MUL, i("a"), i("b"));
      case "math.mod":
        return this.binary("%", P.MUL, i("a"), i("b"));
      case "math.neg": {
        const a = i("a");
        return { code: `-${a.prec < P.UNARY || a.code.startsWith("-") ? `(${a.code})` : a.code}`, prec: P.UNARY };
      }
      case "math.abs":
        return this.call("math.abs", [i("a")]);
      case "math.min":
        return this.call("math.min", [i("a"), i("b")]);
      case "math.max":
        return this.call("math.max", [i("a"), i("b")]);
      case "math.clamp":
        return this.call("math.max", [i("min"), this.call("math.min", [i("max"), i("value")])]);
      case "math.sin":
        return this.call("math.sin", [i("a")]);
      case "math.cos":
        return this.call("math.cos", [i("a")]);
      case "math.sqrt":
        return this.call("math.sqrt", [i("a")]);
      case "math.floor":
        return this.call("math.floor", [i("a")]);
      case "math.random":
        return this.call("math.random", []);
      case "math.randomInt":
        return this.call("math.random", [i("min"), i("max")]);
      case "cmp.eq":
        return this.binary("==", P.CMP, i("a"), i("b"));
      case "cmp.ne":
        return this.binary("~=", P.CMP, i("a"), i("b"));
      case "cmp.lt":
        return this.binary("<", P.CMP, i("a"), i("b"));
      case "cmp.le":
        return this.binary("<=", P.CMP, i("a"), i("b"));
      case "cmp.gt":
        return this.binary(">", P.CMP, i("a"), i("b"));
      case "cmp.ge":
        return this.binary(">=", P.CMP, i("a"), i("b"));
      case "logic.and":
        return this.binary("and", P.AND, i("a"), i("b"), true);
      case "logic.or":
        return this.binary("or", P.OR, i("a"), i("b"), true);
      case "logic.not":
        return { code: `not ${this.wrap(i("a"), P.UNARY)}`, prec: P.UNARY };
      case "text.concat": {
        // 문자열 잇기는 결합 순서와 상관없다
        return this.binary("..", P.CONCAT, this.tostr(id, "a"), this.tostr(id, "b"), true);
      }
      case "lib.const": {
        const [lib, key] = this.library(n.const!);
        return { code: luaField(lib.name, key), prec: P.ATOM };
      }
      case "lib.call": {
        const [lib, key] = this.library(n.fn!);
        return this.call(luaField(lib.name, key), this.libArgs(n));
      }
      case "api.call":
        return this.apiCall(n);
    }
    throw new GraphCodegenError(`값 노드가 아닙니다: ${n.kind}`);
  }

  protected statement(n: GraphNode, indent: number, plan: HookPlan) {
    const id = n.id;
    const i = (port: string) => this.input(id, port);
    switch (n.kind) {
      case "state.set":
        return this.line(indent, `${luaField("st", n.field!)} = ${i("value").code}`, id);
      case "local.set":
        return this.line(indent, `${plan.inlineDecl.has(id) ? "local " : ""}${n.field} = ${i("value").code}`, id);
      case "obj.set":
        return this.line(indent, `${this.target(id)}.${n.field} = ${i("value").code}`, id);
      case "prop.set":
        return this.line(indent, `${luaField(`${this.target(id)}.props`, n.field!)} = ${i("value").code}`, id);
      case "scene.switch":
        return this.line(indent, this.call("scene:switch", [i("name")]).code, id);
      case "scene.remove":
        return this.line(indent, this.call("scene:remove", [i("id")]).code, id);
      case "text.print":
        return this.line(indent, this.call("print", [i("value")]).code, id);
      case "lib.call": {
        const [lib, key] = this.library(n.fn!);
        return this.line(indent, this.call(luaField(lib.name, key), this.libArgs(n)).code, id);
      }
      case "api.call":
        return this.line(indent, this.apiCall(n).code, id);
      case "flow.branch": {
        const cond = i("cond");
        if (n.then === undefined && n.else !== undefined) {
          this.line(indent, `if not ${this.wrap(cond, P.UNARY)} then`, id);
          this.chain(n.else, indent + 1, plan);
        } else {
          this.line(indent, `if ${cond.code} then`, id);
          this.chain(n.then, indent + 1, plan);
          if (n.else !== undefined) {
            this.line(indent, "else", id);
            this.chain(n.else, indent + 1, plan);
          }
        }
        return this.line(indent, "end", id);
      }
      case "flow.switch": {
        let value = i("value");
        if (value.code.includes("(")) {
          this.line(indent, `local _sw_${id} = ${value.code}`, id);
          value = { code: `_sw_${id}`, prec: P.ATOM };
        }
        const t = this.inputType(id, "value");
        const cases = Object.entries(n.cases ?? {});
        if (cases.length === 0) {
          if (n.else !== undefined) {
            this.line(indent, "do", id);
            this.chain(n.else, indent + 1, plan);
            this.line(indent, "end", id);
          }
          return;
        }
        cases.forEach(([v, head], k) => {
          const lit = t.t === "integer" ? numberCode(Number(v)) : t.t === "enum" ? this.enumLit(v) : this.stringLit(v);
          this.line(indent, `${k === 0 ? "if" : "elseif"} ${this.wrap(value, P.CMP + 1)} == ${lit.code} then`, id);
          this.chain(head, indent + 1, plan);
        });
        if (n.else !== undefined) {
          this.line(indent, "else", id);
          this.chain(n.else, indent + 1, plan);
        }
        return this.line(indent, "end", id);
      }
      case "flow.repeat": {
        const count = i("count");
        this.line(indent, `for _i_${id} = 0, ${this.binary("-", P.ADD, count, { code: "1", prec: P.ATOM }).code} do`, id);
        this.chain(n.body, indent + 1, plan);
        return this.line(indent, "end", id);
      }
    }
    throw new GraphCodegenError(`실행 노드가 아닙니다: ${n.kind}`);
  }

  private stateSource(): string {
    const from = this.a.graph.state!.from;
    if (from === "scene") return "scene.state";
    const [lib, key] = this.library(from);
    return `${luaField(lib.name, key)}(scene)`;
  }

  file(graphPath: string): { text: string; lines: (string | null)[] } {
    this.line(0, `-- ${GENERATED_MARKER}${graphPath} (이 파일이 아니라 그래프를 편집합니다)`, null);
    for (const lib of this.a.env.libraries.values()) this.line(0, `local ${lib.name} = require(${JSON.stringify(lib.luaRequire)})`, null);
    this.line(0, "", null);
    this.line(0, "local M = {}", null);
    for (const hook of this.hooks()) {
      const plan = this.plan(hook);
      const ev = this.a.events.get(hook) ?? null;
      this.line(0, "", null);
      this.line(0, `function M.${hook}(${HOOK_ARGS[hook].lua})`, ev);
      if (plan.usesState) this.line(1, `local st = ${this.stateSource()}`, null);
      if (hook === "init") {
        for (const f of this.stateDefaults()) {
          this.line(1, `if ${luaField("st", f.key)} == nil then ${luaField("st", f.key)} = ${this.literal(f.default, varType(f, "symbol")).code} end`, null);
        }
      }
      for (const key of plan.hoisted) this.line(1, `local ${key} = ${this.localDefault(key).code}`, null);
      if (ev) this.chain(this.node(ev).next, 1, plan);
      this.line(0, "end", ev);
    }
    this.line(0, "", null);
    this.line(0, "return M", null);
    return { text: this.out.join("\n") + "\n", lines: this.map };
  }
}

// ---- Ruby ----

class RubyEmitter extends Emitter {
  readonly indentUnit = "  ";
  readonly nil = "nil";

  protected stringLit(s: string): Expr {
    return { code: `"${escapeString(s, true)}"`, prec: P.ATOM };
  }
  protected enumLit(v: string, repr: "symbol" | "string"): Expr {
    return repr === "symbol" ? this.symbol(v) : this.stringLit(v);
  }
  private symbol(v: string): Expr {
    return { code: /^[A-Za-z_][A-Za-z0-9_]*[?!]?$/.test(v) ? `:${v}` : `:"${escapeString(v, true)}"`, prec: P.ATOM };
  }
  protected keyLit(name: string): Expr {
    return this.symbol(name.toLowerCase());
  }
  protected buttonLit(name: string): Expr {
    return this.symbol(name);
  }

  private call(fn: string, args: Expr[]): Expr {
    return { code: args.length ? `${fn}(${args.map((a) => a.code).join(", ")})` : fn, prec: P.ATOM };
  }

  private recv(e: Expr): string {
    return this.wrap(e, P.ATOM);
  }

  private target(id: string): string {
    return this.recv(this.input(id, "target"));
  }

  private state(key: string): string {
    return `st[:${this.a.rubyStateName(key)}]`;
  }

  private libName(lib: NodeLibrary, ruby: string, isConst = false): string {
    return isConst && /^[A-Z]/.test(ruby) ? `${lib.rubyModule}::${ruby}` : `${lib.rubyModule}.${ruby}`;
  }

  private libCall(n: GraphNode): Expr {
    const [lib, key] = this.library(n.fn!);
    const f = lib.functions.find((x) => x.key === key)!;
    const args = f.args.map((a) => (a.type === "scene" ? { code: "scene", prec: P.ATOM } : a.type === "state" ? { code: "st", prec: P.ATOM } : this.input(n.id, a.key)));
    return this.call(this.libName(lib, f.ruby), args);
  }

  private apiCall(n: GraphNode): Expr {
    const def = apiNode(n.fn!)!;
    const args = def.params.map((p) => this.input(n.id, p.key));
    if (def.rubyKind === "getter") return { code: def.ruby, prec: P.ATOM };
    return this.call(def.ruby, args);
  }

  /** Ruby 의 / 는 두 정수면 정수 나눗셈이다. 그래프의 나누기는 늘 실수를 낸다 */
  private divide(id: string): Expr {
    // 상수는 실수로 쓰고, 둘 다 정수 값이면 왼쪽을 실수로 바꾼다
    const operand = (port: string): Expr => {
      const r = this.a.inputs.get(id)![port];
      return r.value.kind === "literal" && typeof r.value.value === "number" ? numberCode(r.value.value, true) : this.input(id, port);
    };
    const a = operand("a");
    const b = operand("b");
    const integerLink = (port: string) => !this.isLiteral(id, port) && this.inputType(id, port).t === "integer";
    const left = integerLink("a") && integerLink("b") ? { code: `${this.recv(a)}.to_f`, prec: P.ATOM } : a;
    return this.binary("/", P.MUL, left, b);
  }

  /** 텍스트 합치기를 문자열 하나의 보간으로. 이어진 텍스트 합치기는 같은 문자열 안에 편다 */
  private interpolate(id: string): Expr {
    const body = (nodeId: string): string =>
      ["a", "b"]
        .map((port) => {
          const r = this.a.inputs.get(nodeId)![port];
          if (r.value.kind === "literal" && typeof r.value.value === "string") return escapeString(r.value.value, true);
          if (r.value.kind === "link" && r.value.port === "out" && this.node(r.value.node).kind === "text.concat") return body(r.value.node);
          return `#{${this.input(nodeId, port).code}}`;
        })
        .join("");
    return { code: `"${body(id)}"`, prec: P.ATOM };
  }

  protected value(n: GraphNode): Expr {
    const id = n.id;
    const i = (port: string) => this.input(id, port);
    switch (n.kind) {
      case "state.get":
        return { code: this.state(n.field!), prec: P.ATOM };
      case "local.get":
        return { code: this.a.rubyLocalName(n.field!), prec: P.ATOM };
      case "param.get":
        return { code: `@params[${this.stringLit(n.field!).code}]`, prec: P.ATOM };
      case "obj.self":
        return { code: "obj", prec: P.ATOM };
      case "obj.get":
        return { code: `${this.target(id)}.${n.field}`, prec: P.ATOM };
      case "prop.get":
        return { code: `${this.target(id)}.props[${this.stringLit(n.field!).code}]`, prec: P.ATOM };
      case "scene.find":
        return this.call("scene.find", [i("id")]);
      case "math.add":
        return this.binary("+", P.ADD, i("a"), i("b"));
      case "math.sub":
        return this.binary("-", P.ADD, i("a"), i("b"));
      case "math.mul":
        return this.binary("*", P.MUL, i("a"), i("b"));
      case "math.div":
        return this.divide(id);
      case "math.mod":
        return this.binary("%", P.MUL, i("a"), i("b"));
      case "math.neg": {
        const a = i("a");
        return { code: `-${a.prec < P.UNARY || a.code.startsWith("-") ? `(${a.code})` : a.code}`, prec: P.UNARY };
      }
      case "math.abs":
        return { code: `${this.recv(i("a"))}.abs`, prec: P.ATOM };
      case "math.min":
        return { code: `[${i("a").code}, ${i("b").code}].min`, prec: P.ATOM };
      case "math.max":
        return { code: `[${i("a").code}, ${i("b").code}].max`, prec: P.ATOM };
      case "math.clamp":
        return { code: `[${i("min").code}, [${i("max").code}, ${i("value").code}].min].max`, prec: P.ATOM };
      case "math.sin":
        return this.call("Math.sin", [i("a")]);
      case "math.cos":
        return this.call("Math.cos", [i("a")]);
      case "math.sqrt":
        return this.call("Math.sqrt", [i("a")]);
      case "math.floor":
        return { code: `${this.recv(i("a"))}.floor`, prec: P.ATOM };
      case "math.random":
        return { code: "rand", prec: P.ATOM };
      case "math.randomInt": {
        const lo = i("min");
        const hi = i("max");
        const span = this.binary("+", P.ADD, this.binary("-", P.ADD, hi, lo), { code: "1", prec: P.ATOM });
        return this.binary("+", P.ADD, lo, { code: `rand(${span.code})`, prec: P.ATOM });
      }
      case "cmp.eq":
        return this.binary("==", P.CMP, i("a"), i("b"));
      case "cmp.ne":
        return this.binary("!=", P.CMP, i("a"), i("b"));
      case "cmp.lt":
        return this.binary("<", P.CMP, i("a"), i("b"));
      case "cmp.le":
        return this.binary("<=", P.CMP, i("a"), i("b"));
      case "cmp.gt":
        return this.binary(">", P.CMP, i("a"), i("b"));
      case "cmp.ge":
        return this.binary(">=", P.CMP, i("a"), i("b"));
      case "logic.and":
        return this.binary("&&", P.AND, i("a"), i("b"), true);
      case "logic.or":
        return this.binary("||", P.OR, i("a"), i("b"), true);
      case "logic.not":
        return { code: `!${this.wrap(i("a"), P.ATOM)}`, prec: P.UNARY };
      case "text.concat":
        return this.interpolate(id);
      case "lib.const": {
        const [lib, key] = this.library(n.const!);
        return { code: this.libName(lib, lib.constants.find((c) => c.key === key)!.ruby, true), prec: P.ATOM };
      }
      case "lib.call":
        return this.libCall(n);
      case "api.call":
        return this.apiCall(n);
    }
    throw new GraphCodegenError(`값 노드가 아닙니다: ${n.kind}`);
  }

  protected statement(n: GraphNode, indent: number, plan: HookPlan) {
    const id = n.id;
    const i = (port: string) => this.input(id, port);
    switch (n.kind) {
      case "state.set":
        return this.line(indent, `${this.state(n.field!)} = ${i("value").code}`, id);
      case "local.set":
        return this.line(indent, `${this.a.rubyLocalName(n.field!)} = ${i("value").code}`, id);
      case "obj.set":
        return this.line(indent, `${this.target(id)}.${n.field} = ${i("value").code}`, id);
      case "prop.set":
        return this.line(indent, `${this.target(id)}.props[${this.stringLit(n.field!).code}] = ${i("value").code}`, id);
      case "scene.switch":
        return this.line(indent, this.call("scene.switch", [i("name")]).code, id);
      case "scene.remove":
        return this.line(indent, this.call("scene.remove", [i("id")]).code, id);
      case "text.print":
        return this.line(indent, `puts(${i("value").code})`, id);
      case "lib.call":
        return this.line(indent, this.libCall(n).code, id);
      case "api.call": {
        const def = apiNode(n.fn!)!;
        if (def.rubyKind === "setter") return this.line(indent, `${def.ruby.slice(0, -1)} = ${i(def.params[0].key).code}`, id);
        return this.line(indent, this.apiCall(n).code, id);
      }
      case "flow.branch": {
        const cond = i("cond");
        if (n.then === undefined && n.else !== undefined) {
          this.line(indent, `unless ${cond.code}`, id);
          this.chain(n.else, indent + 1, plan);
        } else {
          this.line(indent, `if ${cond.code}`, id);
          this.chain(n.then, indent + 1, plan);
          if (n.else !== undefined) {
            this.line(indent, "else", id);
            this.chain(n.else, indent + 1, plan);
          }
        }
        return this.line(indent, "end", id);
      }
      case "flow.switch": {
        const t = this.inputType(id, "value");
        const cases = Object.entries(n.cases ?? {});
        this.line(indent, `case ${i("value").code}`, id);
        for (const [v, head] of cases) {
          const lit = t.t === "integer" ? numberCode(Number(v)) : t.t === "enum" ? this.enumLit(v, t.repr) : this.stringLit(v);
          this.line(indent, `when ${lit.code}`, id);
          this.chain(head, indent + 1, plan);
        }
        if (n.else !== undefined) {
          this.line(indent, "else", id);
          this.chain(n.else, indent + 1, plan);
        }
        return this.line(indent, "end", id);
      }
      case "flow.repeat":
        this.line(indent, `${this.recv(i("count"))}.times do |_i_${id}|`, id);
        this.chain(n.body, indent + 1, plan);
        return this.line(indent, "end", id);
    }
    throw new GraphCodegenError(`실행 노드가 아닙니다: ${n.kind}`);
  }

  private stateSource(): string {
    const from = this.a.graph.state!.from;
    if (from === "scene") return "scene.state";
    const [lib, key] = this.library(from);
    return `${this.libName(lib, lib.functions.find((f) => f.key === key)!.ruby)}(scene)`;
  }

  file(graphPath: string, logicalName: string): { text: string; lines: (string | null)[] } {
    this.line(0, `# ${GENERATED_MARKER}${graphPath} (이 파일이 아니라 그래프를 편집합니다)`, null);
    const requires = [...new Set([...this.a.env.libraries.values()].map((l) => l.rubyRequire))];
    for (const r of requires) this.line(0, `require ${JSON.stringify(r)}`, null);
    this.line(0, "", null);
    const path = rubyClassPath(logicalName);
    const modules = path.slice(0, -1);
    modules.forEach((m, k) => this.line(k, `module ${m}`, null));
    const depth = modules.length;
    this.line(depth, `class ${path[path.length - 1]}`, null);
    let first = true;
    const gap = () => {
      if (!first) this.line(0, "", null);
      first = false;
    };
    if (this.a.graph.params) {
      gap();
      this.line(depth + 1, "def initialize(params = {})", null);
      this.line(depth + 2, "@params = params", null);
      this.line(depth + 1, "end", null);
    }
    for (const hook of this.hooks()) {
      const plan = this.plan(hook);
      const ev = this.a.events.get(hook) ?? null;
      gap();
      this.line(depth + 1, `def ${hook}(${HOOK_ARGS[hook].ruby})`, ev);
      if (plan.usesState) this.line(depth + 2, `st = ${this.stateSource()}`, null);
      if (hook === "init") {
        for (const f of this.stateDefaults()) {
          this.line(depth + 2, `${this.state(f.key)} = ${this.literal(f.default, varType(f, "symbol")).code} if ${this.state(f.key)}.nil?`, null);
        }
      }
      for (const key of plan.hoisted) this.line(depth + 2, `${this.a.rubyLocalName(key)} = ${this.localDefault(key).code}`, null);
      if (ev) this.chain(this.node(ev).next, depth + 2, plan);
      this.line(depth + 1, "end", ev);
    }
    this.line(depth, "end", null);
    for (let k = depth - 1; k >= 0; k--) this.line(k, "end", null);
    return { text: this.out.join("\n") + "\n", lines: this.map };
  }
}

/** 오류 없는 분석에서 Lua, Ruby, 선언 파일을 만든다 */
export function generateComponent(a: GraphAnalysis, logicalName: string, graphPath: string): GeneratedComponent {
  if (a.errors > 0) throw new GraphCodegenError(`그래프에 오류가 ${a.errors}개 있어 코드를 만들 수 없습니다`);
  const paths = generatedPaths(logicalName);
  const lua = new LuaEmitter(a).file(graphPath);
  const ruby = new RubyEmitter(a).file(graphPath, logicalName);
  let declaration: GeneratedFile | null = null;
  if (a.graph.params) {
    const text = JSON.stringify({ version: 1, fields: a.graph.params }, null, 2) + "\n";
    declaration = { path: paths.declaration, text, lines: text.split("\n").map(() => null) };
  }
  return { lua: { path: paths.lua, ...lua }, ruby: { path: paths.ruby, ...ruby }, declaration };
}
