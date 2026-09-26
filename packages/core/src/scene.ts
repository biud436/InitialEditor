// 씬 포맷 v1 과 씬 모델 (docs/plans/e2-scene.md, 계약은 엔진 docs/plans/r1-scene-loader.md).
//
// 파일 규칙 (엔진 로더와 같은 목록이어야 한다)
//   1. version 은 1. 다른 값은 오류
//   2. 모르는 키는 보존한다 (엔진은 무시한다)
//   3. id 는 씬 안에서 유일한 비어 있지 않은 문자열
//   4. type 은 코어 타입(node, sprite, text)이거나 등록된 확장 타입
//   5. 경로는 프로젝트 루트 기준 `/` 상대 경로
//   6. objects 순서가 그리기 순서. x, y 기본 0, visible 기본 true, props 기본 {}, scripts 기본 []
//   7. scripts 는 언어 중립 논리 이름 ("components/bird" → scripts/lua/components/bird.lua)

/* eslint-disable @typescript-eslint/no-this-alias -- 명령 객체의 execute/undo/merge 가 모델을 닫아 들고 있어야 해서 별칭이 자연스럽다 */
import { action, makeObservable, observable } from "mobx";
import type { Command } from "./document";
import type { ValidationProblem } from "./extensions";

export const SCENE_VERSION = 1;
export const CORE_OBJECT_TYPES = ["node", "sprite", "text"] as const;
export type CoreObjectType = (typeof CORE_OBJECT_TYPES)[number];

export interface SceneObject {
  id: string;
  type: string;
  x: number;
  y: number;
  visible: boolean;
  props: Record<string, unknown>;
  scripts: string[];
  /** 파일에 있던 모르는 키 (보존) */
  extra: Record<string, unknown>;
}

export interface SceneData {
  version: number;
  name: string;
  objects: SceneObject[];
  /** 루트의 모르는 키 (보존) */
  extra: Record<string, unknown>;
}

export class SceneFormatError extends Error {
  constructor(message: string, public readonly location?: string) {
    super(message);
    this.name = "SceneFormatError";
  }
}

const OBJECT_KEYS = new Set(["id", "type", "x", "y", "visible", "props", "scripts"]);
const ROOT_KEYS = new Set(["version", "name", "objects"]);

/** 코어 타입의 기본 props. 확장 타입은 registerObjectType 의 defaults 가 준다 */
export const CORE_DEFAULT_PROPS: Record<CoreObjectType, Record<string, unknown>> = {
  node: {},
  sprite: { image: "", width: 0, height: 0, frames: 1, frameDelay: 100, scale: 1, angle: 0, opacity: 255, loop: true, startFrame: 0, endFrame: 0 },
  text: { text: "", font: "" },
};

export const CORE_TYPE_LABELS: Record<CoreObjectType, string> = { node: "빈 노드", sprite: "스프라이트", text: "글자" };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 파일 텍스트를 읽는다. 구조가 어긋나면 SceneFormatError (타입 검사는 validateScene 이 한다) */
export function parseScene(text: string): SceneData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new SceneFormatError(`JSON 이 아니다: ${(e as Error).message}`);
  }
  if (!isRecord(raw)) throw new SceneFormatError("씬 파일은 객체여야 한다");
  if (raw.version !== SCENE_VERSION) throw new SceneFormatError(`모르는 씬 버전이다: ${String(raw.version)} (지원: ${SCENE_VERSION})`, "version");
  const name = typeof raw.name === "string" ? raw.name : "";
  if (raw.objects !== undefined && !Array.isArray(raw.objects)) throw new SceneFormatError("objects 는 배열이어야 한다", "objects");
  const objects = ((raw.objects as unknown[]) ?? []).map((o, i) => parseObject(o, i));
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) if (!ROOT_KEYS.has(k)) extra[k] = v;
  return { version: SCENE_VERSION, name, objects, extra };
}

function parseObject(o: unknown, index: number): SceneObject {
  const where = `objects[${index}]`;
  if (!isRecord(o)) throw new SceneFormatError(`${where} 는 객체여야 한다`, where);
  if (typeof o.id !== "string" || o.id === "") throw new SceneFormatError(`${where}.id 는 비어 있지 않은 문자열이어야 한다`, `${where}.id`);
  if (typeof o.type !== "string" || o.type === "") throw new SceneFormatError(`${where}.type 이 없다`, `${where}.type`);
  const num = (key: "x" | "y") => {
    const v = o[key];
    if (v === undefined) return 0;
    if (typeof v !== "number" || !Number.isFinite(v)) throw new SceneFormatError(`${where}.${key} 는 숫자여야 한다`, `${where}.${key}`);
    return v;
  };
  if (o.props !== undefined && !isRecord(o.props)) throw new SceneFormatError(`${where}.props 는 객체여야 한다`, `${where}.props`);
  if (o.scripts !== undefined && (!Array.isArray(o.scripts) || o.scripts.some((s) => typeof s !== "string"))) {
    throw new SceneFormatError(`${where}.scripts 는 문자열 배열이어야 한다`, `${where}.scripts`);
  }
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (!OBJECT_KEYS.has(k)) extra[k] = v;
  return {
    id: o.id,
    type: o.type,
    x: num("x"),
    y: num("y"),
    visible: o.visible === undefined ? true : o.visible === true,
    props: { ...((o.props as Record<string, unknown>) ?? {}) },
    scripts: [...((o.scripts as string[]) ?? [])],
    extra,
  };
}

/** 의미 검사. 엔진 로더가 거부하는 것과 같은 목록이다 */
export function validateScene(data: SceneData, knownTypes: ReadonlySet<string> = new Set(CORE_OBJECT_TYPES)): ValidationProblem[] {
  const problems: ValidationProblem[] = [];
  if (data.version !== SCENE_VERSION) problems.push({ severity: "error", message: `모르는 씬 버전: ${data.version}`, location: "version" });
  const seen = new Set<string>();
  data.objects.forEach((o, i) => {
    const where = `objects[${i}]`;
    if (seen.has(o.id)) problems.push({ severity: "error", message: `id 가 겹친다: ${o.id}`, location: `${where}.id` });
    seen.add(o.id);
    if (!knownTypes.has(o.type)) problems.push({ severity: "error", message: `모르는 오브젝트 타입: ${o.type}`, location: `${where}.type` });
    if (o.type === "sprite" && (typeof o.props.image !== "string" || o.props.image === "")) {
      problems.push({ severity: "warning", message: `스프라이트 ${o.id} 에 이미지가 없다`, location: `${where}.props.image` });
    }
    o.scripts.forEach((s, j) => {
      if (s.startsWith("/") || s.includes("..") || /\.(lua|rb)$/.test(s) || s.includes("\\")) {
        problems.push({ severity: "error", message: `스크립트는 논리 이름이어야 한다 (예: components/bird): ${s}`, location: `${where}.scripts[${j}]` });
      }
    });
  });
  return problems;
}

/** 키 순서를 고정해 저장한다. 모르는 키는 각 자리의 뒤에 */
export function serializeScene(data: SceneData): string {
  const out: Record<string, unknown> = { version: SCENE_VERSION, name: data.name };
  out.objects = data.objects.map((o) => {
    const obj: Record<string, unknown> = { id: o.id, type: o.type, x: o.x, y: o.y };
    if (!o.visible) obj.visible = false;
    obj.props = o.props;
    obj.scripts = o.scripts;
    for (const [k, v] of Object.entries(o.extra)) if (!(k in obj)) obj[k] = v;
    return obj;
  });
  for (const [k, v] of Object.entries(data.extra)) if (!(k in out)) out[k] = v;
  return JSON.stringify(out, null, 2) + "\n";
}

export function emptyScene(name = "main"): SceneData {
  return { version: SCENE_VERSION, name, objects: [], extra: {} };
}

/** 씬의 논리 스크립트 이름을 언어별 파일 경로로 */
export function scriptPathFor(logicalName: string, language: "lua" | "mruby"): string {
  return language === "mruby" ? `scripts/ruby/${logicalName}.rb` : `scripts/lua/${logicalName}.lua`;
}

/** 겹치지 않는 새 id (base, base_2, base_3 ...) */
export function uniqueObjectId(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  const clean = base.replace(/[^\p{L}\p{N}_-]/gu, "_") || "object";
  if (!set.has(clean)) return clean;
  for (let i = 2; ; i++) {
    const candidate = `${clean}_${i}`;
    if (!set.has(candidate)) return candidate;
  }
}

/**
 * 편집 중인 씬. 오브젝트 배열은 관찰 가능하고, 바꾸는 길은 명령 객체뿐이다 (document.apply(cmd)).
 * 명령은 아래 팩토리로 만든다.
 */
export class SceneModel {
  name: string;
  readonly objects = observable.array<SceneObject>([], { deep: false });
  extra: Record<string, unknown>;

  constructor(data: SceneData = emptyScene()) {
    this.name = data.name;
    this.extra = { ...data.extra };
    this.objects.replace(data.objects.map(cloneObject));
    makeObservable(this, { name: observable, replaceAll: action });
  }

  find(id: string): SceneObject | undefined {
    return this.objects.find((o) => o.id === id);
  }

  indexOf(id: string): number {
    return this.objects.findIndex((o) => o.id === id);
  }

  ids(): string[] {
    return this.objects.map((o) => o.id);
  }

  toData(): SceneData {
    return { version: SCENE_VERSION, name: this.name, objects: this.objects.map(cloneObject), extra: { ...this.extra } };
  }

  replaceAll(data: SceneData): void {
    this.name = data.name;
    this.extra = { ...data.extra };
    this.objects.replace(data.objects.map(cloneObject));
  }

  /** 오브젝트 하나를 새 값으로 바꾼다 (MobX 가 알아채도록 배열 원소를 교체한다) */
  private replaceObject(id: string, next: SceneObject): void {
    const i = this.indexOf(id);
    if (i < 0) throw new Error(`오브젝트가 없다: ${id}`);
    this.objects[i] = next;
  }

  // ---- 명령 팩토리 ----

  addObject(obj: SceneObject, index?: number): Command {
    const model = this;
    const at = index ?? this.objects.length;
    return {
      label: `오브젝트 추가: ${obj.id}`,
      execute: action(() => {
        if (model.find(obj.id)) throw new Error(`id 가 겹친다: ${obj.id}`);
        model.objects.splice(Math.min(at, model.objects.length), 0, cloneObject(obj));
      }),
      undo: action(() => {
        const i = model.indexOf(obj.id);
        if (i >= 0) model.objects.splice(i, 1);
      }),
    };
  }

  removeObject(id: string): Command {
    const model = this;
    let removed: SceneObject | null = null;
    let removedAt = -1;
    return {
      label: `오브젝트 삭제: ${id}`,
      execute: action(() => {
        removedAt = model.indexOf(id);
        if (removedAt < 0) throw new Error(`오브젝트가 없다: ${id}`);
        removed = model.objects[removedAt];
        model.objects.splice(removedAt, 1);
      }),
      undo: action(() => {
        if (removed) model.objects.splice(removedAt, 0, removed);
      }),
    };
  }

  /** 여러 오브젝트를 옮긴다. 같은 coalesceKey 의 연속 명령(드래그)은 하나로 합쳐진다 */
  moveObjects(moves: Array<{ id: string; x: number; y: number }>, coalesceKey?: string): Command {
    const model = this;
    const before = new Map(moves.map((m) => [m.id, { x: model.find(m.id)?.x ?? 0, y: model.find(m.id)?.y ?? 0 }]));
    let target = moves.map((m) => ({ ...m }));
    const apply = (list: Array<{ id: string; x: number; y: number }>) => {
      for (const m of list) {
        const o = model.find(m.id);
        if (o) model.replaceObject(m.id, { ...o, x: m.x, y: m.y });
      }
    };
    const cmd: Command & { target: typeof target } = {
      label: moves.length === 1 ? `오브젝트 이동: ${moves[0].id}` : `오브젝트 ${moves.length}개 이동`,
      coalesceKey,
      target,
      execute: action(() => apply(cmd.target)),
      undo: action(() => apply([...before].map(([id, p]) => ({ id, x: p.x, y: p.y })))),
      merge(next) {
        const other = next as typeof cmd;
        target = other.target;
        cmd.target = target;
        return true;
      },
    };
    return cmd;
  }

  /** props 의 값 하나 (key 에 점을 쓰면 중첩: "anim.fps") */
  setProp(id: string, key: string, value: unknown, coalesceKey?: string): Command {
    const model = this;
    const o = model.find(id);
    if (!o) throw new Error(`오브젝트가 없다: ${id}`);
    const beforeProps = deepClone(o.props);
    const cmd: Command & { value: unknown } = {
      label: `속성 변경: ${id}.${key}`,
      coalesceKey,
      value,
      execute: action(() => {
        const cur = model.find(id)!;
        model.replaceObject(id, { ...cur, props: setPath(cur.props, key, cmd.value) });
      }),
      undo: action(() => {
        const cur = model.find(id)!;
        model.replaceObject(id, { ...cur, props: deepClone(beforeProps) });
      }),
      merge(next) {
        cmd.value = (next as typeof cmd).value;
        cmd.execute();
        return true;
      },
    };
    return cmd;
  }

  /** 공통 필드 (x, y, visible, id 는 renameObject 로) */
  setField(id: string, field: "x" | "y" | "visible", value: number | boolean, coalesceKey?: string): Command {
    const model = this;
    const o = model.find(id);
    if (!o) throw new Error(`오브젝트가 없다: ${id}`);
    const before = o[field];
    const cmd: Command & { value: number | boolean } = {
      label: `속성 변경: ${id}.${field}`,
      coalesceKey,
      value,
      execute: action(() => {
        const cur = model.find(id)!;
        model.replaceObject(id, { ...cur, [field]: cmd.value });
      }),
      undo: action(() => {
        const cur = model.find(id)!;
        model.replaceObject(id, { ...cur, [field]: before });
      }),
      merge(next) {
        cmd.value = (next as typeof cmd).value;
        cmd.execute();
        return true;
      },
    };
    return cmd;
  }

  renameObject(id: string, newId: string): Command {
    const model = this;
    return {
      label: `이름 바꾸기: ${id} → ${newId}`,
      execute: action(() => {
        if (newId === "" || (newId !== id && model.find(newId))) throw new Error(`쓸 수 없는 id 다: ${newId}`);
        const cur = model.find(id)!;
        model.replaceObject(id, { ...cur, id: newId });
      }),
      undo: action(() => {
        const cur = model.find(newId)!;
        model.replaceObject(newId, { ...cur, id });
      }),
    };
  }

  /** 그리기 순서 바꾸기 (from 위치의 것을 to 위치로) */
  reorder(from: number, to: number): Command {
    const model = this;
    return {
      label: "순서 바꾸기",
      execute: action(() => {
        const [o] = model.objects.splice(from, 1);
        model.objects.splice(to, 0, o);
      }),
      undo: action(() => {
        const [o] = model.objects.splice(to, 1);
        model.objects.splice(from, 0, o);
      }),
    };
  }

  attachScript(id: string, logicalName: string): Command {
    const model = this;
    return {
      label: `스크립트 붙이기: ${logicalName}`,
      execute: action(() => {
        const cur = model.find(id)!;
        if (cur.scripts.includes(logicalName)) return;
        model.replaceObject(id, { ...cur, scripts: [...cur.scripts, logicalName] });
      }),
      undo: action(() => {
        const cur = model.find(id)!;
        model.replaceObject(id, { ...cur, scripts: cur.scripts.filter((s) => s !== logicalName) });
      }),
    };
  }

  detachScript(id: string, logicalName: string): Command {
    const model = this;
    let index = -1;
    return {
      label: `스크립트 떼기: ${logicalName}`,
      execute: action(() => {
        const cur = model.find(id)!;
        index = cur.scripts.indexOf(logicalName);
        if (index < 0) return;
        model.replaceObject(id, { ...cur, scripts: cur.scripts.filter((_, i) => i !== index) });
      }),
      undo: action(() => {
        if (index < 0) return;
        const cur = model.find(id)!;
        const scripts = [...cur.scripts];
        scripts.splice(index, 0, logicalName);
        model.replaceObject(id, { ...cur, scripts });
      }),
    };
  }
}

export function cloneObject(o: SceneObject): SceneObject {
  return { ...o, props: { ...o.props }, scripts: [...o.scripts], extra: { ...o.extra } };
}

export function makeObject(type: string, id: string, defaults: Record<string, unknown>, init: Partial<SceneObject> = {}): SceneObject {
  return { id, type, x: 0, y: 0, visible: true, props: { ...defaults }, scripts: [], extra: {}, ...init };
}

/** JSON 값의 깊은 복사 (props 는 JSON 이다) */
export function deepClone<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => deepClone(v)) as unknown as T;
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepClone(v);
    return out as T;
  }
  return value;
}

function setPath(obj: Record<string, unknown>, key: string, value: unknown): Record<string, unknown> {
  const parts = key.split(".");
  const out = { ...obj };
  let cur = out;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = cur[parts[i]];
    cur[parts[i]] = isRecord(next) ? { ...next } : {};
    cur = cur[parts[i]] as Record<string, unknown>;
  }
  const last = parts[parts.length - 1];
  if (value === undefined) delete cur[last];
  else cur[last] = value;
  return out;
}
