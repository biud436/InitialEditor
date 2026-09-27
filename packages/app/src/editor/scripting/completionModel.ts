// 자동완성의 순수한 부분. ApiSpec 을 언어별 색인(전역, 멤버, 호출 가능한 것)으로 바꾸고, 커서 앞 텍스트를 보고
// 어떤 후보를 낼지 정한다. Monaco 는 모르므로 Node 로 테스트한다. Monaco 공급자로 감싸는 것은 completion.ts.
//
// Lua: 모듈의 lua 가 null 이면 함수는 전역(DrawText()), 아니면 Input.IsKeyDown 처럼 테이블 멤버. 클래스는
//      Sprite.Create 와 Sprite.SetPosition(id, ...) 로 전부 테이블 멤버다.
// Ruby: Graphics.draw_text, Input.press?, Keys::SPACE, 그리고 sprite.position= 같은 인스턴스 메서드.
//       Input 의 술어에는 Keys 상수를 소문자 Symbol(:space)로 낸다.
// 인자, 타입, 반환은 언어별 값(luaParams, rubyType, rubyReturns 등)을 쓰고, 씬 계약 스니펫의 이름은 그 언어에서
// 엔진이 부르는 이름이다 (Lua Initialize, Ruby init).

import { hookName, paramsFor, paramType, returnsFor, type ApiFunction, type ApiParam, type ApiReturns, type ApiSpec, type ApiValue, type SceneHook, type ScriptLanguage } from "./apiSpec";

export type Lang = ScriptLanguage;

export type SuggestionKind = "module" | "class" | "function" | "method" | "constructor" | "property" | "constant" | "hook" | "symbol";

export interface SignatureParam {
  /** 시그니처 글에서 이 인자가 차지하는 범위 [시작, 끝) */
  range: [number, number];
  /** 타입, 기본값, 설명 */
  doc: string;
}

export interface Signature {
  /** 예: "Audio.play_music(path, id, loop = true) -> boolean" */
  label: string;
  params: SignatureParam[];
}

export interface Suggestion {
  label: string;
  /** 넣을 텍스트. snippet 이 true 면 Monaco 스니펫 문법($1, ${1:x}) */
  insert: string;
  snippet: boolean;
  kind: SuggestionKind;
  /** 한 줄 시그니처. 예: "Graphics.draw_text(x, y, text) -> nil" */
  detail: string;
  doc: string;
  /** 그 언어의 인자 (type 은 luaType, rubyType 을 반영한 값) */
  params: ApiParam[];
  /** 그 언어의 반환 타입. Lua 의 여러 값은 쉼표로 잇는다 */
  returns?: string;
  alias?: boolean;
  aliasOf?: string;
  /** 시그니처 도움말. 첫째가 본 꼴이고 나머지는 다른 인자 꼴(overloads) */
  signatures: Signature[];
}

export interface LangIndex {
  /** 최상위 이름 (모듈, 클래스, Lua 전역 함수) */
  globals: Suggestion[];
  /** "Graphics" -> 멤버. Ruby 의 상수 모듈("Keys")도 여기 (Keys:: 로 접근) */
  members: Map<string, Suggestion[]>;
  /** Ruby: 어떤 클래스의 인스턴스 메서드 (받는 쪽을 모르는 `obj.` 뒤에 낸다). Lua 는 비어 있다 */
  instanceMethods: Suggestion[];
  /** Ruby: Keys 상수의 Symbol 꼴 (:space). Lua 는 비어 있다 */
  symbols: Suggestion[];
  /** 씬 계약 함수의 스니펫. 이름은 그 언어에서 엔진이 부르는 이름 (Lua Initialize, Ruby init) */
  hooks: Suggestion[];
  /** 시그니처 도움말과 호버용. 키는 "Graphics.draw_text", "DrawText", "Input.press?", 인스턴스 메서드는 "#set_position" */
  callables: Map<string, Suggestion>;
  /** 호버용 이름 설명: 모듈과 클래스와 상수 모듈 */
  named: Map<string, Suggestion>;
}

/** 기본값과 상수 값을 코드 글자로. null 은 nil, 문자열은 따옴표 */
export function literal(value: ApiValue): string {
  if (value === null) return "nil";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

/** 시그니처 속 인자 표기. Lua 선택 인자는 name?, Ruby 선택 인자는 name = 기본값, 가변 인자는 Lua ... 와 Ruby *name */
function paramLabel(p: ApiParam, lang: Lang): string {
  if (p.variadic) return lang === "lua" ? "..." : `*${p.name.replace(/^\.+/, "") || "args"}`;
  if (!p.optional) return p.name;
  return lang === "ruby" ? `${p.name} = ${literal(p.default ?? null)}` : `${p.name}?`;
}

/** 인자 설명 한 줄: 타입, 기본값, 설명 */
export function paramDoc(p: ApiParam): string {
  const parts: string[] = [];
  if (p.type) parts.push(`타입: ${p.type}`);
  if (p.default !== undefined) parts.push(`기본값: ${literal(p.default)}`);
  if (p.doc) parts.push(p.doc);
  return parts.join(". ");
}

function returnsText(returns: ApiReturns | undefined): string | undefined {
  if (returns === undefined) return undefined;
  return Array.isArray(returns) ? returns.join(", ") : returns;
}

/** 인자 목록을 그 언어의 것으로: type 에 luaType 이나 rubyType 을 넣고 두 키는 뺀다 */
function resolveParams(params: ApiParam[], lang: Lang): ApiParam[] {
  return params.map((p) => {
    const out: ApiParam = { name: p.name };
    const type = paramType(p, lang);
    if (type) out.type = type;
    if (p.optional) out.optional = true;
    if (p.default !== undefined) out.default = p.default;
    if (p.variadic) out.variadic = true;
    if (p.doc) out.doc = p.doc;
    return out;
  });
}

/** 시그니처 글과 인자별 범위 */
function buildSignature(name: string, params: ApiParam[], returns: string | undefined, lang: Lang): Signature {
  let label = `${name}(`;
  const out: SignatureParam[] = [];
  params.forEach((p, i) => {
    if (i > 0) label += ", ";
    const text = paramLabel(p, lang);
    out.push({ range: [label.length, label.length + text.length], doc: paramDoc(p) });
    label += text;
  });
  label += ")";
  if (returns) label += ` -> ${returns}`;
  return { label, params: out };
}

/** 호출 스니펫: 필수 인자는 placeholder, 필수가 없고 선택이나 가변 인자만 있으면 $1, 없으면 빈 괄호 */
function callInsert(name: string, params: ApiParam[], emptyParens: boolean): { insert: string; snippet: boolean } {
  const required = params.filter((p) => !p.optional && !p.variadic);
  if (required.length > 0) {
    const parts = required.map((p, i) => `\${${i + 1}:${p.name}}`);
    return { insert: `${name}(${parts.join(", ")})`, snippet: true };
  }
  if (params.length > 0) return { insert: `${name}($1)`, snippet: true };
  return { insert: emptyParens ? `${name}()` : name, snippet: false };
}

function suggestion(partial: Omit<Suggestion, "snippet" | "insert" | "signatures"> & Partial<Pick<Suggestion, "snippet" | "insert" | "signatures">>): Suggestion {
  return { insert: partial.label, snippet: false, signatures: [], ...partial };
}

/** Lua 클래스 메서드는 핸들을 첫 인자로 받는다. 명세가 이미 적었으면(id, handle, h) 그대로 둔다 */
function luaMethodParams(params: ApiParam[], handleName: string): ApiParam[] {
  const first = params[0]?.name.toLowerCase();
  if (first === "id" || first === "handle" || first === "h" || first === "self") return params;
  return [{ name: handleName, type: "number" }, ...params];
}

type ParamTransform = (params: ApiParam[]) => ApiParam[];

function luaFunction(fullName: string, label: string, fn: ApiFunction, kind: SuggestionKind, transform: ParamTransform = (p) => p): Suggestion {
  const params = transform(resolveParams(paramsFor(fn, "lua"), "lua"));
  const returns = returnsText(returnsFor(fn, "lua"));
  const main = buildSignature(fullName, params, returns, "lua");
  const overloads = (fn.overloads ?? []).map((o) => buildSignature(fullName, transform(resolveParams(o, "lua")), returns, "lua"));
  const call = callInsert(label, params, true);
  return { label, kind, detail: main.label, doc: fn.doc ?? "", params, returns, alias: fn.alias, aliasOf: fn.aliasOf, signatures: [main, ...overloads], ...call };
}

function rubyFunction(fullName: string, label: string, fn: ApiFunction, fallbackKind: SuggestionKind): Suggestion {
  const rubyKind = fn.rubyKind ?? "method";
  const params = resolveParams(paramsFor(fn, "ruby"), "ruby");
  const returns = returnsText(returnsFor(fn, "ruby"));
  const doc = fn.doc ?? "";
  switch (rubyKind) {
    case "getter": {
      const detail = `${fullName}${returns ? ` -> ${returns}` : ""}`;
      return suggestion({ label, kind: "property", detail, doc, params: [], returns, alias: fn.alias, aliasOf: fn.aliasOf, signatures: [{ label: detail, params: [] }] });
    }
    case "setter": {
      const base = label.endsWith("=") ? label.slice(0, -1) : label;
      const valueName = params[0]?.name ?? "value";
      const detail = `${fullName.endsWith("=") ? fullName.slice(0, -1) : fullName} = ${valueName}`;
      const value: SignatureParam[] = params[0] ? [{ range: [detail.length - valueName.length, detail.length], doc: paramDoc(params[0]) }] : [];
      return suggestion({
        label: `${base} =`,
        insert: `${base} = \${1:${valueName}}`,
        snippet: true,
        kind: "property",
        detail,
        doc,
        params,
        alias: fn.alias,
        aliasOf: fn.aliasOf,
        signatures: [{ label: detail, params: value }],
      });
    }
    default: {
      const main = buildSignature(fullName, params, returns, "ruby");
      const overloads = (fn.overloads ?? []).map((o) => buildSignature(fullName, resolveParams(o, "ruby"), returns, "ruby"));
      const call = callInsert(label, params, false);
      const kind = rubyKind === "predicate" ? "method" : fallbackKind;
      return { label, kind, detail: main.label, doc, params, returns, alias: fn.alias, aliasOf: fn.aliasOf, signatures: [main, ...overloads], ...call };
    }
  }
}

const HOOK_DOC = "엔진이 씬을 열고 닫을 때와 프레임마다 호출하는 함수";

/** 씬 계약 스니펫. 그 언어에 없는 함수(이름이 null)는 null */
function hookSuggestion(hook: SceneHook, lang: Lang): Suggestion | null {
  const name = hookName(hook, lang);
  if (!name) return null;
  const params = resolveParams(hook.params, lang);
  const names = params.map((p) => p.name).join(", ");
  const insert = lang === "lua" ? `function ${name}(${names})\n\t$0\nend` : `def ${name}${names ? `(${names})` : ""}\n\t$0\nend`;
  const required = lang === "lua" && hook.luaRequired === true;
  const rule = required ? "필수 함수 (엔진이 정의 여부를 확인하지 않고 호출)" : "선택 함수 (정의된 것만 호출)";
  return {
    label: name,
    insert,
    snippet: true,
    kind: "hook",
    detail: `씬 계약: ${name}(${names})`,
    doc: `${hook.doc ?? HOOK_DOC}\n\n${rule}`,
    params,
    signatures: [],
  };
}

function hooksFor(spec: ApiSpec, lang: Lang): Suggestion[] {
  return spec.sceneContract.map((h) => hookSuggestion(h, lang)).filter((s): s is Suggestion => s !== null);
}

function put(map: Map<string, Suggestion[]>, key: string, value: Suggestion): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** 상수 값이 있으면 " = 32" */
function valueSuffix(values: Record<string, ApiValue> | undefined, name: string): string {
  const value = values?.[name];
  return value === undefined ? "" : ` = ${literal(value)}`;
}

function buildLuaIndex(spec: ApiSpec): LangIndex {
  const index: LangIndex = { globals: [], members: new Map(), instanceMethods: [], symbols: [], hooks: [], callables: new Map(), named: new Map() };
  for (const mod of spec.modules) {
    const luaFns = mod.functions.filter((f) => f.lua !== null);
    if (mod.lua === null) {
      for (const fn of luaFns) {
        const s = luaFunction(fn.lua!, fn.lua!, fn, "function");
        index.globals.push(s);
        index.callables.set(fn.lua!, s);
      }
      continue;
    }
    if (luaFns.length === 0) continue;
    const modSuggestion = suggestion({ label: mod.lua, kind: "module", detail: `모듈 ${mod.lua}`, doc: mod.doc ?? "", params: [] });
    index.globals.push(modSuggestion);
    index.named.set(mod.lua, modSuggestion);
    for (const fn of luaFns) {
      const full = `${mod.lua}.${fn.lua}`;
      const s = luaFunction(full, fn.lua!, fn, "function");
      put(index.members, mod.lua, s);
      index.callables.set(full, s);
    }
  }
  for (const cls of spec.classes) {
    if (cls.lua === null) continue;
    const clsSuggestion = suggestion({ label: cls.lua, kind: "class", detail: `클래스 ${cls.lua}`, doc: cls.doc ?? "", params: [] });
    index.globals.push(clsSuggestion);
    index.named.set(cls.lua, clsSuggestion);
    for (const ctor of cls.constructors) {
      if (ctor.lua === null) continue;
      const full = ctor.lua.includes(".") ? ctor.lua : `${cls.lua}.${ctor.lua}`;
      const label = full.slice(full.lastIndexOf(".") + 1);
      const s = luaFunction(full, label, ctor, "constructor");
      put(index.members, cls.lua, s);
      index.callables.set(full, s);
    }
    // luaStyle 이 handle 인 클래스의 메서드는 숫자 핸들을 첫 인자로 받는다
    const handleName = cls.lua === "Tilemap" ? "handle" : "id";
    const withHandle: ParamTransform | undefined = cls.luaStyle === "handle" ? (params) => luaMethodParams(params, handleName) : undefined;
    for (const m of cls.methods) {
      if (m.lua === null) continue;
      const full = `${cls.lua}.${m.lua}`;
      const s = luaFunction(full, m.lua, m, "method", withHandle);
      put(index.members, cls.lua, s);
      index.callables.set(full, s);
    }
  }
  for (const c of spec.constants) {
    if (!c.lua) continue;
    const s = suggestion({ label: c.lua, kind: "module", detail: `상수 ${c.lua}`, doc: c.doc ?? "", params: [] });
    index.globals.push(s);
    index.named.set(c.lua, s);
    for (const name of c.names) put(index.members, c.lua, suggestion({ label: name, kind: "constant", detail: `${c.lua}.${name}${valueSuffix(c.values, name)}`, doc: "", params: [] }));
  }
  index.hooks = hooksFor(spec, "lua");
  return index;
}

function buildRubyIndex(spec: ApiSpec): LangIndex {
  const index: LangIndex = { globals: [], members: new Map(), instanceMethods: [], symbols: [], hooks: [], callables: new Map(), named: new Map() };
  for (const mod of spec.modules) {
    if (mod.ruby === null) continue;
    const rubyFns = mod.functions.filter((f) => f.ruby !== null);
    if (rubyFns.length === 0) continue;
    const modSuggestion = suggestion({ label: mod.ruby, kind: "module", detail: `모듈 ${mod.ruby}`, doc: mod.doc ?? "", params: [] });
    index.globals.push(modSuggestion);
    index.named.set(mod.ruby, modSuggestion);
    for (const fn of rubyFns) {
      const full = `${mod.ruby}.${fn.ruby}`;
      const s = rubyFunction(full, fn.ruby!, fn, "function");
      put(index.members, mod.ruby, s);
      index.callables.set(full, s);
    }
  }
  for (const cls of spec.classes) {
    if (cls.ruby === null) continue;
    const clsSuggestion = suggestion({ label: cls.ruby, kind: "class", detail: `클래스 ${cls.ruby}`, doc: cls.doc ?? "", params: [] });
    index.globals.push(clsSuggestion);
    index.named.set(cls.ruby, clsSuggestion);
    for (const ctor of cls.constructors) {
      if (ctor.ruby === null) continue;
      const full = ctor.ruby.includes(".") ? ctor.ruby : `${cls.ruby}.${ctor.ruby}`;
      const label = full.slice(full.lastIndexOf(".") + 1);
      const s = rubyFunction(full, label, { ...ctor, rubyKind: "method" }, "constructor");
      s.kind = "constructor";
      put(index.members, cls.ruby, s);
      index.callables.set(full, s);
    }
    for (const m of cls.methods) {
      if (m.ruby === null) continue;
      const s = rubyFunction(`${cls.ruby}#${m.ruby}`, m.ruby, m, "method");
      s.detail = `${s.detail}  (${cls.ruby})`;
      index.instanceMethods.push(s);
      const key = `#${m.ruby}`;
      if (!index.callables.has(key)) index.callables.set(key, s);
    }
  }
  for (const c of spec.constants) {
    if (c.ruby === null) continue;
    const s = suggestion({ label: c.ruby, kind: "module", detail: `상수 모듈 ${c.ruby}`, doc: c.doc ?? "", params: [] });
    index.globals.push(s);
    index.named.set(c.ruby, s);
    for (const name of c.names) {
      put(index.members, c.ruby, suggestion({ label: name, kind: "constant", detail: `${c.ruby}::${name}${valueSuffix(c.values, name)}`, doc: "", params: [] }));
      const sym = symbolFor(name);
      index.symbols.push(suggestion({ label: sym, kind: "symbol", detail: `${c.ruby}::${name} 의 Symbol`, doc: "", params: [] }));
    }
  }
  index.hooks = hooksFor(spec, "ruby");
  return index;
}

/** 상수 이름의 Symbol 꼴. SPACE -> :space, 숫자로 시작하면 :"0" */
export function symbolFor(constantName: string): string {
  const lower = constantName.toLowerCase();
  return /^[a-z_]\w*$/.test(lower) ? `:${lower}` : `:"${lower}"`;
}

export function buildIndex(spec: ApiSpec, lang: Lang): LangIndex {
  return lang === "lua" ? buildLuaIndex(spec) : buildRubyIndex(spec);
}

export interface PrefixContext {
  /** `Graphics.` 의 Graphics. 없으면 null */
  receiver: string | null;
  separator: "." | "::" | null;
  /** 지금 치고 있는 단어 (빈 문자열일 수 있다) */
  word: string;
  /** Ruby: 괄호나 쉼표 뒤의 `:` (Symbol 인자 자리) */
  symbolArg: boolean;
}

const RUBY_SYMBOL_ARG = /[(,]\s*:([A-Za-z_]\w*)?$/;
const MEMBER = /([A-Za-z_]\w*)\s*(\.|::)\s*([A-Za-z_]\w*[?!=]?)?$/;
const WORD = /([A-Za-z_]\w*)$/;

/** 커서 앞 텍스트(그 줄의 처음부터)를 보고 완성 문맥을 정한다 */
export function analyzePrefix(prefix: string, lang: Lang): PrefixContext {
  if (lang === "ruby") {
    const sym = RUBY_SYMBOL_ARG.exec(prefix);
    if (sym) return { receiver: null, separator: null, word: sym[1] ?? "", symbolArg: true };
  }
  const member = MEMBER.exec(prefix);
  if (member && (lang === "ruby" || member[2] === ".")) {
    return { receiver: member[1], separator: member[2] as "." | "::", word: member[3] ?? "", symbolArg: false };
  }
  const word = WORD.exec(prefix);
  return { receiver: null, separator: null, word: word?.[1] ?? "", symbolArg: false };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 문서에 이미 정의된 씬 함수인가 (Lua function Initialize(, Ruby def init). 이름은 대소문자까지 같아야 한다 */
export function hasHook(docText: string, name: string, lang: Lang): boolean {
  const n = escapeRegExp(name);
  const re = lang === "lua" ? new RegExp(`^\\s*(local\\s+)?function\\s+${n}\\s*\\(`, "m") : new RegExp(`^\\s*def\\s+${n}(?![\\w?!=])`, "m");
  return re.test(docText);
}

/** 문맥에 맞는 후보. 접두어 거르기는 Monaco 가 하므로 여기서는 종류만 고른다 */
export function candidates(index: LangIndex, ctx: PrefixContext, lang: Lang, docText: string): Suggestion[] {
  if (ctx.symbolArg) return index.symbols;
  if (ctx.receiver !== null) {
    const members = index.members.get(ctx.receiver);
    if (members) return members;
    return lang === "ruby" && ctx.separator === "." ? index.instanceMethods : [];
  }
  const hooks = index.hooks.filter((h) => !hasHook(docText, h.label, lang));
  return [...index.globals, ...hooks];
}

export interface CallContext {
  /** "Graphics.draw_text", "DrawText", "sprite.set_position" */
  callee: string;
  activeParameter: number;
}

/** 커서가 어느 호출의 몇 번째 인자 안에 있는가. 닫히지 않은 가장 안쪽 괄호를 찾는다 (문자열 안의 괄호는 무시한다) */
export function callContext(prefix: string): CallContext | null {
  let depth = 0;
  let commas = 0;
  let quote: string | null = null;
  // 문자열은 앞에서부터 읽어야 안다: 열린 따옴표 위치를 먼저 표시한다
  const inString = new Array<boolean>(prefix.length).fill(false);
  for (let i = 0; i < prefix.length; i++) {
    const ch = prefix[i];
    if (quote) {
      inString[i] = true;
      if (ch === "\\") {
        i++;
        if (i < prefix.length) inString[i] = true;
      } else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      inString[i] = true;
    }
  }
  for (let i = prefix.length - 1; i >= 0; i--) {
    if (inString[i]) continue;
    const ch = prefix[i];
    if (ch === ")" || ch === "]" || ch === "}") depth++;
    else if (ch === "(" || ch === "[" || ch === "{") {
      if (depth === 0) {
        if (ch !== "(") return null;
        const head = /([A-Za-z_][\w.:]*[?!]?)\s*$/.exec(prefix.slice(0, i));
        if (!head) return null;
        return { callee: head[1], activeParameter: commas };
      }
      depth--;
    } else if (ch === "," && depth === 0) commas++;
  }
  return null;
}

/** 호출 이름으로 시그니처를 찾는다. Ruby 의 `obj.method` 는 받는 쪽을 몰라 "#method" 로 다시 찾는다 */
export function lookupCallable(index: LangIndex, callee: string): Suggestion | undefined {
  const direct = index.callables.get(callee);
  if (direct) return direct;
  const dot = callee.lastIndexOf(".");
  if (dot >= 0) return index.callables.get(`#${callee.slice(dot + 1)}`);
  return undefined;
}

/** 호버: 단어와 그 앞의 받는 쪽으로 설명을 찾는다 */
export function lookupHover(index: LangIndex, receiver: string | null, word: string): Suggestion | undefined {
  if (receiver !== null) {
    const members = index.members.get(receiver);
    const member = members?.find((m) => m.label === word || m.label === `${word} =`);
    if (member) return member;
    return index.callables.get(`#${word}`);
  }
  return index.callables.get(word) ?? index.named.get(word);
}

/** 인자 번호에 맞는 시그니처: 그 번호의 인자가 있는 첫 꼴, 없으면 본 꼴 */
export function pickSignature(signatures: Signature[], activeParameter: number): number {
  const i = signatures.findIndex((sig) => activeParameter < sig.params.length);
  return i >= 0 ? i : 0;
}

/** 완성 항목 문서와 호버의 마크다운: 시그니처(다른 꼴 포함), 설명, 인자별 타입과 기본값, 별명 */
export function describe(s: Suggestion): string {
  const lines: string[] = [];
  if (s.detail) lines.push("```\n" + [s.detail, ...s.signatures.slice(1).map((sig) => sig.label)].join("\n") + "\n```");
  if (s.doc) lines.push(s.doc);
  const params = s.params.map((p) => ({ name: p.name, doc: paramDoc(p) })).filter((p) => p.doc);
  if (params.length) lines.push(params.map((p) => `- \`${p.name}\`: ${p.doc}`).join("\n"));
  if (s.alias) lines.push(s.aliasOf ? `_별명_: \`${s.aliasOf}\`` : "_별명_");
  return lines.join("\n\n");
}
