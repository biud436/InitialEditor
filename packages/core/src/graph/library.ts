// 노드 라이브러리 (*.nodes.json): 게임의 도우미 모듈을 그래프 노드로 부르게 하는 선언.
//   Lua 는 require 한 표의 필드(flappy.GRAVITY, flappy.sfx(...)), Ruby 는 모듈의 상수와 메서드(FlappyCommon::GRAVITY, FlappyCommon.sfx(...))
//   인자 형식 scene 과 state 는 노드의 포트가 아니라 생성 코드가 채운다 (scene, 그래프의 상태 표)

import { VAR_TYPES, type VarType } from "./format";
import { IDENTIFIER, LUA_KEYWORDS, GENERATED_NAMES, snakeCase } from "./names";

export const LIBRARY_VERSION = 1;

/** 인자 형식. object 는 포트이고 이어지지 않으면 컴포넌트의 오브젝트(obj)다 */
export type LibraryArgType = VarType | "any" | "scene" | "state";
export type LibraryReturnType = VarType | "any" | "state";

export interface LibraryConstant {
  key: string;
  type: VarType | "any";
  label?: string;
  /** Ruby 이름. 대문자로 시작하면 상수(Mod::NAME), 아니면 메서드(Mod.name) */
  ruby: string;
  values?: string[];
}

export interface LibraryArg {
  key: string;
  type: LibraryArgType;
  label?: string;
  values?: string[];
  default?: unknown;
}

export interface LibraryFunction {
  key: string;
  label?: string;
  ruby: string;
  args: LibraryArg[];
  /** 없으면 실행 노드, 있으면 값 노드 */
  returns?: LibraryReturnType;
  values?: string[];
}

export interface NodeLibrary {
  path: string;
  /** 노드 이름의 앞부분이자 Lua 지역 변수 이름 (flappy.GRAVITY) */
  name: string;
  label: string;
  luaRequire: string;
  rubyRequire: string;
  rubyModule: string;
  constants: LibraryConstant[];
  functions: LibraryFunction[];
}

export class NodeLibraryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NodeLibraryError";
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const RUBY_CONSTANT = /^[A-Z][A-Za-z0-9_]*(::[A-Z][A-Za-z0-9_]*)*$/;
const RUBY_METHOD = /^[a-z_][A-Za-z0-9_]*[?!]?$/;
const RUBY_NAME = /^([A-Z][A-Za-z0-9_]*|[a-z_][A-Za-z0-9_]*[?!]?)$/;
const ARG_TYPES: readonly string[] = [...VAR_TYPES, "any", "scene", "state"];
const RETURN_TYPES: readonly string[] = [...VAR_TYPES, "any", "state"];

function str(raw: Record<string, unknown>, key: string, where: string, required = false): string | undefined {
  const v = raw[key];
  if (v === undefined) {
    if (required) throw new NodeLibraryError(`${where}.${key}가 필요합니다`);
    return undefined;
  }
  if (typeof v !== "string" || v === "") throw new NodeLibraryError(`${where}.${key}는 비어 있지 않은 문자열이어야 합니다`);
  return v;
}

function values(raw: Record<string, unknown>, type: string, where: string): string[] | undefined {
  if (type !== "enum") {
    if (raw.values !== undefined) throw new NodeLibraryError(`${where}.values는 enum 타입에만 사용할 수 있습니다`);
    return undefined;
  }
  if (!Array.isArray(raw.values) || raw.values.length === 0 || raw.values.some((v) => typeof v !== "string" || v === "")) {
    throw new NodeLibraryError(`${where}.values는 비어 있지 않은 문자열이 1개 이상 있는 배열이어야 합니다`);
  }
  return [...(raw.values as string[])];
}

/** 라이브러리 파일 텍스트를 읽는다. 규칙에 어긋나면 NodeLibraryError */
export function parseNodeLibrary(path: string, text: string): NodeLibrary {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new NodeLibraryError(`JSON 구문 오류: ${(e as Error).message}`);
  }
  if (!isRecord(raw)) throw new NodeLibraryError("최상위 값은 객체여야 합니다");
  if (raw.version !== LIBRARY_VERSION) throw new NodeLibraryError(`지원하지 않는 라이브러리 버전: ${String(raw.version)} (지원: ${LIBRARY_VERSION})`);
  const name = str(raw, "name", "라이브러리", true)!;
  if (!IDENTIFIER.test(name) || !/^[a-z]/.test(name) || LUA_KEYWORDS.has(name) || GENERATED_NAMES.has(name)) {
    throw new NodeLibraryError(`name은 소문자로 시작하는 식별자여야 하고 생성 코드의 이름(${[...GENERATED_NAMES].join(", ")})과 달라야 합니다: ${name}`);
  }
  const lua = raw.lua;
  const ruby = raw.ruby;
  if (!isRecord(lua)) throw new NodeLibraryError("lua는 객체여야 합니다 ({ \"require\": ... })");
  if (!isRecord(ruby)) throw new NodeLibraryError("ruby는 객체여야 합니다 ({ \"require\": ..., \"module\": ... })");
  const rubyModule = str(ruby, "module", "ruby", true)!;
  if (!RUBY_CONSTANT.test(rubyModule)) throw new NodeLibraryError(`ruby.module은 Ruby 상수 이름이어야 합니다: ${rubyModule}`);
  const lib: NodeLibrary = {
    path,
    name,
    label: str(raw, "label", "라이브러리") ?? name,
    luaRequire: str(lua, "require", "lua", true)!,
    rubyRequire: str(ruby, "require", "ruby", true)!,
    rubyModule,
    constants: [],
    functions: [],
  };
  const seen = new Set<string>();
  const constants = raw.constants === undefined ? [] : raw.constants;
  if (!Array.isArray(constants)) throw new NodeLibraryError("constants는 배열이어야 합니다");
  constants.forEach((c, i) => {
    const where = `constants[${i}]`;
    if (!isRecord(c)) throw new NodeLibraryError(`${where}는 객체여야 합니다`);
    const key = str(c, "key", where, true)!;
    if (!IDENTIFIER.test(key)) throw new NodeLibraryError(`${where}.key는 식별자여야 합니다: ${key}`);
    if (seen.has(key)) throw new NodeLibraryError(`${where}: key 중복: ${key}`);
    seen.add(key);
    const type = str(c, "type", where, true)!;
    if (![...VAR_TYPES, "any"].includes(type)) throw new NodeLibraryError(`${where}.type은 ${[...VAR_TYPES, "any"].join(", ")} 중 하나여야 합니다`);
    const rubyName = str(c, "ruby", where) ?? key;
    if (!RUBY_NAME.test(rubyName)) throw new NodeLibraryError(`${where}.ruby는 Ruby 상수나 메서드 이름이어야 합니다: ${rubyName}`);
    lib.constants.push({ key, type: type as VarType | "any", label: str(c, "label", where), ruby: rubyName, values: values(c, type, where) });
  });
  const functions = raw.functions === undefined ? [] : raw.functions;
  if (!Array.isArray(functions)) throw new NodeLibraryError("functions는 배열이어야 합니다");
  functions.forEach((f, i) => {
    const where = `functions[${i}]`;
    if (!isRecord(f)) throw new NodeLibraryError(`${where}는 객체여야 합니다`);
    const key = str(f, "key", where, true)!;
    if (!IDENTIFIER.test(key)) throw new NodeLibraryError(`${where}.key는 식별자여야 합니다: ${key}`);
    if (seen.has(key)) throw new NodeLibraryError(`${where}: key 중복: ${key}`);
    seen.add(key);
    const rubyName = str(f, "ruby", where) ?? snakeCase(key);
    if (!RUBY_METHOD.test(rubyName)) throw new NodeLibraryError(`${where}.ruby는 Ruby 메서드 이름이어야 합니다: ${rubyName}`);
    const args = f.args === undefined ? [] : f.args;
    if (!Array.isArray(args)) throw new NodeLibraryError(`${where}.args는 배열이어야 합니다`);
    const argKeys = new Set<string>();
    const fn: LibraryFunction = {
      key,
      label: str(f, "label", where),
      ruby: rubyName,
      args: args.map((a, j) => {
        const aw = `${where}.args[${j}]`;
        if (!isRecord(a)) throw new NodeLibraryError(`${aw}는 객체여야 합니다`);
        const akey = str(a, "key", aw, true)!;
        if (!IDENTIFIER.test(akey)) throw new NodeLibraryError(`${aw}.key는 식별자여야 합니다: ${akey}`);
        if (argKeys.has(akey)) throw new NodeLibraryError(`${aw}: key 중복: ${akey}`);
        argKeys.add(akey);
        const type = str(a, "type", aw, true)!;
        if (!ARG_TYPES.includes(type)) throw new NodeLibraryError(`${aw}.type은 ${ARG_TYPES.join(", ")} 중 하나여야 합니다`);
        const arg: LibraryArg = { key: akey, type: type as LibraryArgType, label: str(a, "label", aw), values: values(a, type, aw) };
        if (a.default !== undefined) arg.default = a.default;
        return arg;
      }),
    };
    if (f.returns !== undefined) {
      const returns = str(f, "returns", where)!;
      if (!RETURN_TYPES.includes(returns)) throw new NodeLibraryError(`${where}.returns는 ${RETURN_TYPES.join(", ")} 중 하나여야 합니다`);
      fn.returns = returns as LibraryReturnType;
      fn.values = values(f, returns, where);
    }
    lib.functions.push(fn);
  });
  return lib;
}

/** 라이브러리 참조 "flappy.GRAVITY" 를 라이브러리 이름과 key 로 */
export function splitLibraryRef(ref: string): [string, string] | null {
  const dot = ref.indexOf(".");
  if (dot <= 0 || dot === ref.length - 1) return null;
  return [ref.slice(0, dot), ref.slice(dot + 1)];
}
