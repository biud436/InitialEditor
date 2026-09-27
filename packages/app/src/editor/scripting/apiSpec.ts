// 엔진 API 설명(resources/api/initial2d-api.json)의 파서. 자동완성과 시그니처 도움말과 호버가 이 모델을 읽는다.
// 파일 모양은 엔진의 docs/plans/r2-api-stubs.md 3절과 tools/gen_api_stubs.py 의 키 목록을 따르고, 키는 이름 그대로 모두 옮긴다.
// 빠진 배열은 빈 배열로 채우고 모양이 아예 아니면 던진다. 언어별 인자와 반환은 paramsFor, returnsFor, paramType 이 고른다.

export type ScriptLanguage = "lua" | "ruby";

/** JSON 값 (인자 기본값) */
export type ApiValue = string | number | boolean | null | ApiValue[] | { [key: string]: ApiValue };

export interface ApiParam {
  name: string;
  type?: string;
  /** Lua 에서의 타입 (type 과 다를 때) */
  luaType?: string;
  /** Ruby 에서의 타입 (type 과 다를 때). 예: 키 인자의 integer|symbol */
  rubyType?: string;
  optional?: boolean;
  /** 생략했을 때의 값 */
  default?: ApiValue;
  /** 가변 인자 (Lua 의 ...) */
  variadic?: boolean;
  doc?: string;
}

/** 반환 타입 식. Lua 에서 값을 여럿 돌려주면 목록 */
export type ApiReturns = string | string[];

export type RubyKind = "method" | "getter" | "setter" | "predicate" | "module_function";

export interface ApiFunction {
  /** Lua 이름. null 이면 Ruby 전용 */
  lua: string | null;
  /** Ruby 이름 (getter 는 `width`, setter 는 `width=`, 술어는 `press?`). null 이면 Lua 전용 */
  ruby: string | null;
  /** 두 언어 공통 인자 */
  params: ApiParam[];
  /** Lua 의 인자가 params 와 다를 때 Lua 의 인자 목록 */
  luaParams?: ApiParam[];
  /** Ruby 의 인자가 params 와 다를 때 Ruby 의 인자 목록 */
  rubyParams?: ApiParam[];
  /** 다른 인자 꼴 (Sprite.SetRect 의 표 하나짜리 꼴) */
  overloads?: ApiParam[][];
  returns?: ApiReturns;
  luaReturns?: ApiReturns;
  rubyReturns?: ApiReturns;
  doc?: string;
  rubyKind?: RubyKind;
  /** 별명 (RGSS 식 trigger? 같은 것). 목록에는 보이되 문서에서는 덜 강조한다 */
  alias?: boolean;
  /** 별명이 가리키는 원래 이름 */
  aliasOf?: string;
  /** Ruby 쪽 정의 위치가 엔진의 Ruby 프렐류드 */
  prelude?: boolean;
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
  /** "handle" 이면 Lua 메서드가 숫자 핸들을 첫 인자로 받는다 (명세의 메서드 인자에는 핸들이 없다) */
  luaStyle?: string;
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
  /** 상수 이름별 값 */
  values?: Record<string, ApiValue>;
}

export interface SceneHook {
  /** 언어 중립 이름 (init, update, render, destroy). 컴포넌트 함수 이름도 이것 */
  name: string;
  /** 엔진이 부르는 Lua 전역 함수 이름 (Initialize). null 이면 Lua 에는 없다 */
  lua: string | null;
  /** 엔진이 부르는 Ruby 최상위 메서드 이름 (init). null 이면 Ruby 에는 없다 */
  ruby: string | null;
  params: ApiParam[];
  doc?: string;
  /** Lua 스크립트가 반드시 정의해야 한다 (엔진이 정의 여부를 보지 않고 부른다) */
  luaRequired?: boolean;
}

export interface ApiSpec {
  version: number;
  engine?: string;
  generatedFrom?: string;
  /** 타입 식에 쓰는 이름 목록 */
  types?: string[];
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
    { name: "init", lua: "Initialize", ruby: "init", params: [], luaRequired: true },
    { name: "update", lua: "Update", ruby: "update", params: [{ name: "elapsed", type: "number" }], luaRequired: true },
    { name: "render", lua: "Render", ruby: "render", params: [], luaRequired: true },
    { name: "destroy", lua: "Destroy", ruby: "destroy", params: [], luaRequired: true },
  ],
};

/** 그 언어의 인자 목록 (luaParams, rubyParams 가 있으면 그것) */
export function paramsFor(fn: ApiFunction, lang: ScriptLanguage): ApiParam[] {
  return (lang === "lua" ? fn.luaParams : fn.rubyParams) ?? fn.params;
}

/** 그 언어의 반환 타입 (luaReturns, rubyReturns 가 있으면 그것) */
export function returnsFor(fn: ApiFunction, lang: ScriptLanguage): ApiReturns | undefined {
  return (lang === "lua" ? fn.luaReturns : fn.rubyReturns) ?? fn.returns;
}

/** 그 언어의 인자 타입 (luaType, rubyType 가 있으면 그것) */
export function paramType(param: ApiParam, lang: ScriptLanguage): string | undefined {
  return (lang === "lua" ? param.luaType : param.rubyType) ?? param.type;
}

/** 엔진이 그 언어에서 부르는 씬 함수 이름. null 이면 그 언어에는 없다 */
export function hookName(hook: SceneHook, lang: ScriptLanguage): string | null {
  return lang === "lua" ? hook.lua : hook.ruby;
}

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

function isApiValue(value: unknown): value is ApiValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isApiValue);
  return isObject(value) && Object.values(value).every(isApiValue);
}

function parseParam(raw: unknown): ApiParam | null {
  if (typeof raw === "string") return { name: raw };
  if (!isObject(raw)) return null;
  const name = str(raw.name);
  if (!name) return null;
  const param: ApiParam = { name };
  const type = optStr(raw.type);
  if (type) param.type = type;
  const luaType = optStr(raw.luaType);
  if (luaType) param.luaType = luaType;
  const rubyType = optStr(raw.rubyType);
  if (rubyType) param.rubyType = rubyType;
  if (raw.optional === true) param.optional = true;
  if ("default" in raw && isApiValue(raw.default)) param.default = raw.default;
  if (raw.variadic === true) param.variadic = true;
  const doc = optStr(raw.doc);
  if (doc) param.doc = doc;
  return param;
}

function parseParams(raw: unknown): ApiParam[] {
  return arr(raw)
    .map(parseParam)
    .filter((p): p is ApiParam => p !== null);
}

/** 키가 배열일 때만 인자 목록 (없으면 undefined 라서 params 를 쓴다) */
function optParams(raw: unknown): ApiParam[] | undefined {
  return Array.isArray(raw) ? parseParams(raw) : undefined;
}

function parseReturns(raw: unknown): ApiReturns | undefined {
  if (Array.isArray(raw)) {
    const list = raw.filter((t): t is string => typeof t === "string" && t !== "");
    return list.length ? list : undefined;
  }
  return optStr(raw);
}

const RUBY_KINDS = new Set<RubyKind>(["method", "getter", "setter", "predicate", "module_function"]);

function parseFunction(raw: unknown): ApiFunction | null {
  if (!isObject(raw)) return null;
  const lua = nullableStr(raw.lua);
  const ruby = nullableStr(raw.ruby);
  if (lua === null && ruby === null) return null;
  const fn: ApiFunction = { lua, ruby, params: parseParams(raw.params) };
  const luaParams = optParams(raw.luaParams);
  if (luaParams) fn.luaParams = luaParams;
  const rubyParams = optParams(raw.rubyParams);
  if (rubyParams) fn.rubyParams = rubyParams;
  if (Array.isArray(raw.overloads)) fn.overloads = raw.overloads.filter(Array.isArray).map(parseParams);
  const returns = parseReturns(raw.returns);
  if (returns) fn.returns = returns;
  const luaReturns = parseReturns(raw.luaReturns);
  if (luaReturns) fn.luaReturns = luaReturns;
  const rubyReturns = parseReturns(raw.rubyReturns);
  if (rubyReturns) fn.rubyReturns = rubyReturns;
  const doc = optStr(raw.doc);
  if (doc) fn.doc = doc;
  const kind = raw.rubyKind;
  if (typeof kind === "string" && RUBY_KINDS.has(kind as RubyKind)) fn.rubyKind = kind as RubyKind;
  else if (ruby !== null) fn.rubyKind = inferRubyKind(ruby, paramsFor(fn, "ruby"));
  if (raw.alias === true) fn.alias = true;
  const aliasOf = optStr(raw.aliasOf);
  if (aliasOf) fn.aliasOf = aliasOf;
  if (raw.prelude === true) fn.prelude = true;
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
  const luaStyle = optStr(raw.luaStyle);
  if (luaStyle) cls.luaStyle = luaStyle;
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
  if (isObject(raw.values)) {
    const values: Record<string, ApiValue> = {};
    for (const [key, value] of Object.entries(raw.values)) if (isApiValue(value)) values[key] = value;
    constants.values = values;
  }
  return constants;
}

function parseHook(raw: unknown): SceneHook | null {
  const obj: Raw = isObject(raw) ? raw : {};
  const name = typeof raw === "string" ? raw : str(obj.name);
  if (!name) return null;
  // lua, ruby 키가 없으면 엔진 규칙의 이름 (init 은 Lua 에서 Initialize), 엔진 규칙에 없는 이름이면 name
  const engine = EMPTY_SPEC.sceneContract.find((h) => h.name === name);
  const hook: SceneHook = {
    name,
    lua: "lua" in obj ? nullableStr(obj.lua) : (engine?.lua ?? name),
    ruby: "ruby" in obj ? nullableStr(obj.ruby) : (engine?.ruby ?? name),
    params: parseParams(obj.params),
  };
  const doc = optStr(obj.doc);
  if (doc) hook.doc = doc;
  if (obj.luaRequired === true) hook.luaRequired = true;
  return hook;
}

/**
 * JSON 텍스트나 이미 파싱된 객체를 ApiSpec 으로. 모양이 객체가 아니거나 version 이 숫자가 아니면 던진다.
 * 나머지 키는 빠져도 된다. sceneContract 가 비어 있으면 EMPTY_SPEC 의 것(엔진 규칙 네 함수)을 쓴다.
 */
export function parseApiSpec(input: string | unknown): ApiSpec {
  const raw: unknown = typeof input === "string" ? JSON.parse(input) : input;
  if (!isObject(raw)) throw new Error("API 명세는 객체여야 한다");
  const version = raw.version === undefined ? 1 : raw.version;
  if (typeof version !== "number" || !Number.isFinite(version)) throw new Error("API 명세의 version 이 숫자가 아니다");
  const sceneContract = arr(raw.sceneContract)
    .map(parseHook)
    .filter((h): h is SceneHook => h !== null);
  const spec: ApiSpec = {
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
  const engine = optStr(raw.engine);
  if (engine) spec.engine = engine;
  const generatedFrom = optStr(raw.generatedFrom);
  if (generatedFrom) spec.generatedFrom = generatedFrom;
  if (Array.isArray(raw.types)) spec.types = raw.types.filter((t): t is string => typeof t === "string" && t !== "");
  return spec;
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
