// 컴포넌트 매개변수 (씬 포맷 v1 의 params, 계약은 엔진 docs/plans/r1-scene-loader.md).
//   선언 파일: scripts/<논리 이름>.json ({ "version": 1, "fields": [...] }). Lua 와 Ruby 가 같은 파일을 쓴다
//   오브젝트의 params[논리 이름] 이 선언의 기본값을 덮는다. 선언 파일이 없는 컴포넌트의 값은 검사 없이 넘어간다
//   필드 형식은 맵 오브젝트 스키마와 같고, 씬 오브젝트 id 를 가리키는 object 가 더 있다
//   엔진처럼 JSON 의 null 은 없는 것으로, 빈 배열 [] 은 빈 객체로(빈 객체 {} 는 빈 배열로) 본다

import type { ValidationProblem } from "./extensions";
import type { SceneData } from "./scene";

export const COMPONENT_DECLARATION_VERSION = 1;
export const COMPONENT_FIELD_TYPES = ["string", "text", "number", "integer", "boolean", "enum", "object"] as const;
export type ComponentFieldType = (typeof COMPONENT_FIELD_TYPES)[number];

export interface ComponentField {
  key: string;
  type: ComponentFieldType;
  label?: string;
  default?: unknown;
  /** enum 의 값 목록 */
  values?: string[];
  /** number, integer 의 범위 */
  min?: number;
  max?: number;
}

export interface ComponentDeclaration {
  version: number;
  fields: ComponentField[];
}

/** 선언 파일을 찾은 결과. 선언 파일이 없으면 none, 읽었으나 규칙에 어긋나면 broken */
export type ComponentDeclarationState = { kind: "declared"; path: string; declaration: ComponentDeclaration } | { kind: "none"; path: string } | { kind: "broken"; path: string; message: string };

export class ComponentDeclarationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComponentDeclarationError";
  }
}

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** 컴포넌트 논리 이름의 선언 파일 경로: components/flappy/bird → scripts/components/flappy/bird.json */
export function componentDeclarationPath(logicalName: string): string {
  return `scripts/${logicalName}.json`;
}

/** 선언 파일 경로를 논리 이름으로. scripts/ 아래 .json 이 아니면 null (scripts/lua, scripts/ruby 아래도 아니다) */
export function componentNameFromDeclarationPath(path: string): string | null {
  if (!path.startsWith("scripts/") || !path.endsWith(".json")) return null;
  const name = path.slice("scripts/".length, -".json".length);
  if (name === "" || name.startsWith("lua/") || name.startsWith("ruby/")) return null;
  return name;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 엔진의 JSON 읽기와 같게: null 인 키를 뺀 객체. 빈 배열은 빈 객체다. 객체가 아니면 null */
export function engineObject(v: unknown): Record<string, unknown> | null {
  if (Array.isArray(v)) return v.length === 0 ? {} : null;
  if (!isRecord(v)) return null;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) if (x !== null) out[k] = x;
  return out;
}

/** 엔진의 JSON 읽기와 같게: 배열. 빈 객체는 빈 배열이다. 배열이 아니면 null */
function engineArray(v: unknown): unknown[] | null {
  if (Array.isArray(v)) return v;
  return isRecord(v) && Object.keys(v).length === 0 ? [] : null;
}

/** 선언 파일 텍스트를 읽는다. 규칙에 어긋나면 ComponentDeclarationError */
export function parseComponentDeclaration(text: string): ComponentDeclaration {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new ComponentDeclarationError(`JSON 구문 오류: ${(e as Error).message}`);
  }
  const root = engineObject(raw);
  if (!root) throw new ComponentDeclarationError("최상위 값은 객체여야 합니다");
  if (root.version !== COMPONENT_DECLARATION_VERSION) throw new ComponentDeclarationError(`지원하지 않는 선언 버전: ${String(root.version)} (지원: ${COMPONENT_DECLARATION_VERSION})`);
  const list = root.fields === undefined ? [] : engineArray(root.fields);
  if (!list) throw new ComponentDeclarationError("fields는 배열이어야 합니다");
  const seen = new Set<string>();
  const fields = list.map((f, i) => {
    const field = parseField(f, i);
    if (seen.has(field.key)) throw new ComponentDeclarationError(`fields[${i}]: key 중복: ${field.key}`);
    seen.add(field.key);
    return field;
  });
  return { version: COMPONENT_DECLARATION_VERSION, fields };
}

function parseField(raw: unknown, index: number): ComponentField {
  const where = `fields[${index}]`;
  const f = engineObject(raw);
  if (!f) throw new ComponentDeclarationError(`${where}: 객체여야 합니다`);
  if (typeof f.key !== "string" || !KEY_PATTERN.test(f.key)) throw new ComponentDeclarationError(`${where}.key는 영문자나 _로 시작하고 영문자, 숫자, _로만 구성되어야 합니다`);
  if (typeof f.type !== "string" || !(COMPONENT_FIELD_TYPES as readonly string[]).includes(f.type)) {
    throw new ComponentDeclarationError(`${where}.type은 ${COMPONENT_FIELD_TYPES.join(", ")} 중 하나여야 합니다`);
  }
  const field: ComponentField = {
    key: f.key,
    type: f.type as ComponentFieldType,
  };
  if (f.label !== undefined) {
    if (typeof f.label !== "string") throw new ComponentDeclarationError(`${where}.label은 문자열이어야 합니다`);
    field.label = f.label;
  }
  if (f.values !== undefined || field.type === "enum") {
    if (field.type !== "enum") throw new ComponentDeclarationError(`${where}.values는 enum 타입에만 사용할 수 있습니다`);
    const values = engineArray(f.values);
    if (!values || values.length === 0 || values.some((v) => typeof v !== "string" || v === "")) {
      throw new ComponentDeclarationError(`${where}.values는 비어 있지 않은 문자열이 1개 이상 있는 배열이어야 합니다`);
    }
    field.values = [...(values as string[])];
  }
  for (const bound of ["min", "max"] as const) {
    if (f[bound] === undefined) continue;
    if (field.type !== "number" && field.type !== "integer") throw new ComponentDeclarationError(`${where}.${bound}: number와 integer 타입에만 사용할 수 있습니다`);
    if (typeof f[bound] !== "number" || !Number.isFinite(f[bound])) throw new ComponentDeclarationError(`${where}.${bound}: 숫자여야 합니다`);
    field[bound] = f[bound];
  }
  if (field.min !== undefined && field.max !== undefined && field.min > field.max) throw new ComponentDeclarationError(`${where}: min이 max보다 큽니다`);
  if (f.default !== undefined) {
    const problem = fieldValueProblem(field, f.default);
    if (problem) throw new ComponentDeclarationError(`${where}.default: ${problem}`);
    field.default = f.default;
  }
  return field;
}

/**
 * 값이 필드 형식에 맞지 않으면 그 이유, 맞으면 null. objectIds 를 주면 object 는 그 안의 id 여야 한다
 * (선언의 기본값은 씬을 모르므로 형식만 본다).
 */
export function fieldValueProblem(field: ComponentField, value: unknown, objectIds?: ReadonlySet<string>): string | null {
  switch (field.type) {
    case "string":
    case "text":
      return typeof value === "string" ? null : "문자열이어야 합니다";
    case "boolean":
      return typeof value === "boolean" ? null : "true나 false여야 합니다";
    case "number":
    case "integer": {
      if (typeof value !== "number" || !Number.isFinite(value)) return "숫자여야 합니다";
      if (field.type === "integer" && !Number.isInteger(value)) return "정수여야 합니다";
      if (field.min !== undefined && value < field.min) return `${field.min} 이상이어야 합니다`;
      if (field.max !== undefined && value > field.max) return `${field.max} 이하여야 합니다`;
      return null;
    }
    case "enum":
      return typeof value === "string" && (field.values ?? []).includes(value) ? null : `${(field.values ?? []).join(", ")} 중 하나여야 합니다`;
    case "object":
      if (typeof value !== "string" || value === "") return "오브젝트 id 문자열이어야 합니다";
      if (objectIds && !objectIds.has(value)) return `씬에 없는 오브젝트: ${value}`;
      return null;
  }
}

/** 선언의 기본값에 오브젝트의 값을 덮은 매개변수 (엔진 로더가 컴포넌트에 넘기는 값) */
export function mergedParams(declaration: ComponentDeclaration | null, overrides: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of declaration?.fields ?? []) if (f.default !== undefined) out[f.key] = f.default;
  return { ...out, ...(overrides ?? {}) };
}

/** 값에서 필드 형식을 짐작한다 (선언 파일을 처음 만들 때) */
export function guessFieldType(value: unknown): ComponentFieldType {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return "string";
}

/** 선언 파일의 첫 내용. 오브젝트에 이미 있는 값은 그 형식의 필드로 적는다 (기본값은 넣지 않는다) */
export function declarationTemplate(existing: Record<string, unknown> = {}): string {
  const fields = Object.entries(existing)
    .filter(([key]) => KEY_PATTERN.test(key))
    .map(([key, value]) => ({ key, type: guessFieldType(value), label: key }));
  return JSON.stringify({ version: COMPONENT_DECLARATION_VERSION, fields }, null, 2) + "\n";
}

/**
 * 선언으로 씬의 params 를 검사한다. lookup 은 컴포넌트의 선언 상태를 주고, 아직 모르면 undefined (그 컴포넌트는 건너뛴다).
 * 선언 파일이 깨진 컴포넌트는 씬마다 한 번 알린다 (엔진은 그 씬을 거부한다).
 */
export function validateComponentParams(data: SceneData, lookup: (logicalName: string) => ComponentDeclarationState | undefined): ValidationProblem[] {
  const problems: ValidationProblem[] = [];
  const ids = new Set(data.objects.map((o) => o.id));
  const reported = new Set<string>();
  data.objects.forEach((o, i) => {
    for (const name of o.scripts) {
      const state = lookup(name);
      if (state?.kind !== "broken" || reported.has(name)) continue;
      reported.add(name);
      problems.push({
        severity: "error",
        message: `컴포넌트 선언 오류 (${state.path}): ${state.message}`,
        location: `objects[${i}].scripts`,
      });
    }
    for (const [name, values] of Object.entries(o.params)) {
      const state = lookup(name);
      if (state?.kind !== "declared" || !o.scripts.includes(name)) continue;
      const fields = new Map(state.declaration.fields.map((f) => [f.key, f]));
      for (const [key, value] of Object.entries(values)) {
        const where = `objects[${i}].params.${name}.${key}`;
        const field = fields.get(key);
        if (!field) {
          problems.push({
            severity: "error",
            message: `${o.id}: ${name}에 선언되지 않은 매개변수: ${key}`,
            location: where,
          });
          continue;
        }
        const problem = fieldValueProblem(field, value, ids);
        if (problem)
          problems.push({
            severity: "error",
            message: `${o.id}: ${name}.${key}: ${problem}`,
            location: where,
          });
      }
    }
  });
  return problems;
}
