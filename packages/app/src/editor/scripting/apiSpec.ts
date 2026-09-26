// 엔진 API 설명(resources/api/initial2d-api.json)의 파서. 자동완성과 시그니처 도움말과 호버가 이 모델을 읽는다.
// 파일 모양은 엔진 저장소의 R2 단계가 정한다 (docs/plans/e1-scripting.md 마일스톤 4). 여기서는 빠진 칸을 너그럽게
// 채우고(배열은 빈 배열, 문자열은 빈 문자열) 모양이 아예 아니면 던진다. Monaco 를 모르므로 Node 로 테스트한다.

export interface ApiParam {
  name: string;
  type?: string;
  optional?: boolean;
  doc?: string;
}

export type RubyKind = "method" | "getter" | "setter" | "predicate" | "module_function";

export interface ApiFunction {
  /** Lua 이름. null 이면 Ruby 전용 */
  lua: string | null;
  /** Ruby 이름 (getter 는 `width`, setter 는 `width=`, 술어는 `press?`). null 이면 Lua 전용 */
  ruby: string | null;
  params: ApiParam[];
  returns?: string;
  doc?: string;
  rubyKind?: RubyKind;
  /** 별명 (RGSS 식 trigger? 같은 것). 목록에는 보이되 문서에서는 덜 강조한다 */
  alias?: boolean;
}

export interface ApiModule {
  name: string;
  /** Lua 쪽 모듈 테이블 이름. null 이면 Lua 함수들은 전역이다 (DrawText() 대 Graphics.draw_text) */
  lua: string | null;
  ruby: string | null;
  doc?: string;
  functions: ApiFunction[];
}

export interface ApiClass {
  name: string;
  lua: string | null;
  ruby: string | null;
  doc?: string;
  /** lua 는 "Sprite.Create" 처럼 온전한 이름, ruby 는 "Sprite.load" */
  constructors: ApiFunction[];
  /** Lua 는 Sprite.SetPosition(id, ...), Ruby 는 sprite.position= */
  methods: ApiFunction[];
}

export interface ApiConstants {
  module: string;
  /** Lua 쪽 테이블 이름. 없거나 null 이면 Lua 에는 없다 (Lua 는 가상 키 정수를 쓴다) */
  lua?: string | null;
  ruby: string | null;
  doc?: string;
  names: string[];
}

export interface SceneHook {
  name: string;
  params: ApiParam[];
  doc?: string;
}

export interface ApiSpec {
  version: number;
  modules: ApiModule[];
  classes: ApiClass[];
  constants: ApiConstants[];
  sceneContract: SceneHook[];
}

/** 파일이 없을 때 쓰는 빈 명세. 씬 계약만은 엔진 규칙이라 여기 박아 둔다 */
export const EMPTY_SPEC: ApiSpec = {
  version: 1,
  modules: [],
  classes: [],
  constants: [],
  sceneContract: [
    { name: "init", params: [] },
    { name: "update", params: [{ name: "elapsed", type: "number" }] },
    { name: "render", params: [] },
    { name: "destroy", params: [] },
  ],
};

type Raw = Record<string, unknown>;

function isObject(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function nullableStr(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function optStr(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function parseParam(raw: unknown): ApiParam | null {
  if (typeof raw === "string") return { name: raw };
  if (!isObject(raw)) return null;
  const name = str(raw.name);
  if (!name) return null;
  const param: ApiParam = { name };
  const type = optStr(raw.type);
  if (type) param.type = type;
  if (raw.optional === true) param.optional = true;
  const doc = optStr(raw.doc);
  if (doc) param.doc = doc;
  return param;
}

function parseParams(raw: unknown): ApiParam[] {
  return arr(raw)
    .map(parseParam)
    .filter((p): p is ApiParam => p !== null);
}

const RUBY_KINDS = new Set<RubyKind>(["method", "getter", "setter", "predicate", "module_function"]);

function parseFunction(raw: unknown): ApiFunction | null {
  if (!isObject(raw)) return null;
  const lua = nullableStr(raw.lua);
  const ruby = nullableStr(raw.ruby);
  if (lua === null && ruby === null) return null;
  const fn: ApiFunction = { lua, ruby, params: parseParams(raw.params) };
  const returns = optStr(raw.returns);
  if (returns) fn.returns = returns;
  const doc = optStr(raw.doc);
  if (doc) fn.doc = doc;
  const kind = raw.rubyKind;
  if (typeof kind === "string" && RUBY_KINDS.has(kind as RubyKind)) fn.rubyKind = kind as RubyKind;
  else if (ruby !== null) fn.rubyKind = inferRubyKind(ruby, fn.params);
  if (raw.alias === true) fn.alias = true;
  return fn;
}

/** rubyKind 가 없을 때 이름 모양으로 짐작한다: `x=` 는 setter, `x?` 는 술어, 인자 없는 것은 getter */
export function inferRubyKind(ruby: string, params: ApiParam[]): RubyKind {
  if (ruby.endsWith("=")) return "setter";
  if (ruby.endsWith("?")) return "predicate";
  if (params.length === 0) return "getter";
  return "method";
}

function parseFunctions(raw: unknown): ApiFunction[] {
  return arr(raw)
    .map(parseFunction)
    .filter((f): f is ApiFunction => f !== null);
}

function parseModule(raw: unknown): ApiModule | null {
  if (!isObject(raw)) return null;
  const name = str(raw.name);
  if (!name) return null;
  const mod: ApiModule = {
    name,
    lua: "lua" in raw ? nullableStr(raw.lua) : name,
    ruby: "ruby" in raw ? nullableStr(raw.ruby) : name,
    functions: parseFunctions(raw.functions),
  };
  const doc = optStr(raw.doc);
  if (doc) mod.doc = doc;
  return mod;
}

function parseClass(raw: unknown): ApiClass | null {
  if (!isObject(raw)) return null;
  const name = str(raw.name);
  if (!name) return null;
  const cls: ApiClass = {
    name,
    lua: "lua" in raw ? nullableStr(raw.lua) : name,
    ruby: "ruby" in raw ? nullableStr(raw.ruby) : name,
    constructors: parseFunctions(raw.constructors),
    methods: parseFunctions(raw.methods),
  };
  const doc = optStr(raw.doc);
  if (doc) cls.doc = doc;
  return cls;
}

function parseConstants(raw: unknown): ApiConstants | null {
  if (!isObject(raw)) return null;
  const module = str(raw.module) || str(raw.name);
  if (!module) return null;
  const constants: ApiConstants = {
    module,
    lua: "lua" in raw ? nullableStr(raw.lua) : null,
    ruby: "ruby" in raw ? nullableStr(raw.ruby) : module,
    names: arr(raw.names).filter((n): n is string => typeof n === "string" && n !== ""),
  };
  const doc = optStr(raw.doc);
  if (doc) constants.doc = doc;
  return constants;
}

function parseHook(raw: unknown): SceneHook | null {
  if (typeof raw === "string") return { name: raw, params: [] };
  if (!isObject(raw)) return null;
  const name = str(raw.name);
  if (!name) return null;
  const hook: SceneHook = { name, params: parseParams(raw.params) };
  const doc = optStr(raw.doc);
  if (doc) hook.doc = doc;
  return hook;
}

/**
 * JSON 텍스트나 이미 파싱된 객체를 ApiSpec 으로. 모양이 객체가 아니거나 version 이 숫자가 아니면 던진다.
 * 나머지 칸은 빠져도 된다. sceneContract 가 비어 있으면 EMPTY_SPEC 의 것(엔진 규칙 네 함수)을 쓴다.
 */
export function parseApiSpec(input: string | unknown): ApiSpec {
  const raw: unknown = typeof input === "string" ? JSON.parse(input) : input;
  if (!isObject(raw)) throw new Error("API 명세는 객체여야 한다");
  const version = raw.version === undefined ? 1 : raw.version;
  if (typeof version !== "number" || !Number.isFinite(version)) throw new Error("API 명세의 version 이 숫자가 아니다");
  const sceneContract = arr(raw.sceneContract)
    .map(parseHook)
    .filter((h): h is SceneHook => h !== null);
  return {
    version,
    modules: arr(raw.modules)
      .map(parseModule)
      .filter((m): m is ApiModule => m !== null),
    classes: arr(raw.classes)
      .map(parseClass)
      .filter((c): c is ApiClass => c !== null),
    constants: arr(raw.constants)
      .map(parseConstants)
      .filter((c): c is ApiConstants => c !== null),
    sceneContract: sceneContract.length ? sceneContract : EMPTY_SPEC.sceneContract,
  };
}

/** 명세의 크기 (콘솔 로그용): 함수와 메서드와 상수 이름의 수 */
export function countSpec(spec: ApiSpec): { functions: number; classes: number; constants: number } {
  let functions = 0;
  for (const m of spec.modules) functions += m.functions.length;
  for (const c of spec.classes) functions += c.constructors.length + c.methods.length;
  let constants = 0;
  for (const c of spec.constants) constants += c.names.length;
  return { functions, classes: spec.classes.length, constants };
}
