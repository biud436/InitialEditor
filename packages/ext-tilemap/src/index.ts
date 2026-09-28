// 타일맵 확장 (docs/plans/04-extensions-and-tilemap.md 4절, docs/plans/e3-tilemap.md).
// 씬에 놓는 오브젝트 타입 "tilemap"을 등록한다. 맵 데이터는 씬이 아니라 props.map이 가리키는 맵 파일
// (resources/maps/*.json, 엔진 맵 포맷 v2)에 있다. 게임 안에서는 런타임 짝(scene_types/tilemap)이 그 파일을
// Tilemap.load로 열고, 앞의 groundLayers 개 레이어를 씬의 모든 오브젝트 아래에(drawBelow), 나머지를 모든 오브젝트
// 위에(drawAbove) 그린다. 오브젝트 순서 자리에는 그리지 않는다.
// 씬 뷰 노드와 인스펙터는 앱이 붙인다 (확장 API에 UI 등록이 아직 없다).
// activate 는 다른 확장이 맵에 레이어와 실행 제공자를 붙이는 자리(TilemapApi, contrib.ts)를 내보낸다.
// 검사기는 엔진 런타임 짝의 validate와 같은 규칙으로 씬의 타일맵 오브젝트를 검사한다. 맵 파일이 있고 맵으로 읽히는지는
// 파일을 보는 앱이 validateTilemapMapFiles로 따로 검사한다 (엔진은 맵 파일을 열지 못하면 씬을 거부한다).

import type { Extension, ExtensionApi, ObjectTypeSpec, ValidationProblem } from "@initial-editor/core";
import { TilemapContrib, type TilemapApi } from "./contrib";

export * from "./contrib";

export const TILEMAP_EXTENSION_ID = "tilemap";

export const TILEMAP_TYPE = "tilemap";

export const TILEMAP_RUNTIME = {
  lua: "scripts/lua/scene_types/tilemap.lua",
  ruby: "scripts/ruby/scene_types/tilemap.rb",
} as const;

/** 타일맵 오브젝트의 props. map은 프로젝트 루트 기준 맵 파일 경로 */
export interface TilemapProps {
  map: string;
  groundLayers: number;
}

export const TILEMAP_DEFAULTS: Readonly<TilemapProps> = { map: "", groundLayers: 1 };

/** 등록할 오브젝트 타입 명세 (부를 때마다 새 객체) */
export function tilemapObjectType(): ObjectTypeSpec {
  return {
    type: TILEMAP_TYPE,
    label: "타일맵",
    icon: "tilemap",
    defaults: { ...TILEMAP_DEFAULTS },
    runtime: { ...TILEMAP_RUNTIME },
  };
}

/** props를 읽는다. 모양이 어긋난 값은 기본값으로 (groundLayers는 0 이상의 정수) */
export function readTilemapProps(props: Record<string, unknown>): TilemapProps {
  const map = typeof props.map === "string" ? props.map : "";
  const g = props.groundLayers;
  const groundLayers = typeof g === "number" && Number.isFinite(g) && g >= 0 ? Math.floor(g) : TILEMAP_DEFAULTS.groundLayers;
  return { map, groundLayers };
}

interface TilemapEntry {
  /** objects 안의 자리 */
  index: number;
  id: string;
  props: Record<string, unknown>;
}

/** 씬 데이터의 타일맵 오브젝트. 씬이 아닌 값이면 빈 목록 */
function tilemapEntries(scene: unknown): TilemapEntry[] {
  const objects = (scene as { objects?: unknown } | null)?.objects;
  if (!Array.isArray(objects)) return [];
  const out: TilemapEntry[] = [];
  objects.forEach((o: unknown, i) => {
    const obj = o as { id?: unknown; type?: unknown; props?: unknown } | null;
    if (!obj || obj.type !== TILEMAP_TYPE) return;
    const id = typeof obj.id === "string" ? obj.id : `#${i}`;
    const props = (obj.props && typeof obj.props === "object" ? obj.props : {}) as Record<string, unknown>;
    out.push({ index: i, id, props });
  });
  return out;
}

export interface TilemapMapRef {
  /** objects 안의 자리 */
  index: number;
  id: string;
  map: string;
}

/** 타일맵 오브젝트가 가리키는 맵 파일 (props.map이 비었거나 문자열이 아니면 뺀다) */
export function tilemapMapRefs(scene: unknown): TilemapMapRef[] {
  return tilemapEntries(scene).flatMap(({ index, id, props }) => (typeof props.map === "string" && props.map !== "" ? [{ index, id, map: props.map }] : []));
}

/** 타일맵이 가리키는 맵 파일의 문제: 없다(missing), 있지만 JSON이 아니거나 맵 형식이 아니다(invalid, 이유) */
export type MapFileProblem = { kind: "missing" } | { kind: "invalid"; reason: string };

function mapFileMessage(ref: TilemapMapRef, problem: MapFileProblem): string {
  return problem.kind === "missing"
    ? `타일맵 ${ref.id}의 맵 파일이 없다: ${ref.map}. 엔진이 씬을 거부한다`
    : `타일맵 ${ref.id}의 맵 파일을 맵으로 읽지 못한다: ${ref.map} (${problem.reason}). 엔진이 씬을 거부한다`;
}

/**
 * 맵 파일이 없거나 맵으로 읽히지 않는 타일맵을 오류로 알린다. 엔진은 Tilemap.load가 실패하면 씬을 거부한다 (Lua와 mruby).
 * 파일의 문제는 부르는 쪽이 problemOf로 답한다 (문제없거나 모르면 null). 파일 시스템과 DOM을 모른다
 */
export function validateTilemapMapFiles(scene: unknown, problemOf: (path: string) => MapFileProblem | null): ValidationProblem[] {
  return tilemapMapRefs(scene).flatMap((ref): ValidationProblem[] => {
    const problem = problemOf(ref.map);
    return problem ? [{ severity: "error", message: mapFileMessage(ref, problem), location: `objects[${ref.index}].props.map` }] : [];
  });
}

/**
 * 씬 데이터의 타일맵 오브젝트 검사. 엔진 scene_types/tilemap.lua의 M.validate와 같은 규칙이다:
 * props.map은 비지 않은 문자열, groundLayers는 없거나 0 이상의 수. 씬이 아닌 값이면 빈 목록
 */
export function validateTilemapObjects(scene: unknown): ValidationProblem[] {
  const problems: ValidationProblem[] = [];
  for (const { index: i, id, props } of tilemapEntries(scene)) {
    const where = `objects[${i}].props`;
    if (typeof props.map !== "string" || props.map === "") {
      problems.push({ severity: "error", message: `타일맵 ${id}에 맵 파일(props.map)이 없다. 엔진이 씬을 거부한다`, location: `${where}.map` });
    }
    const g = props.groundLayers;
    if (g !== undefined && (typeof g !== "number" || !Number.isFinite(g) || g < 0)) {
      problems.push({ severity: "error", message: `타일맵 ${id}의 groundLayers는 0 이상의 수여야 한다: ${JSON.stringify(g)}`, location: `${where}.groundLayers` });
    }
  }
  return problems;
}

export const tilemapExtension: Extension = {
  id: TILEMAP_EXTENSION_ID,
  name: "타일맵",
  activate(api: ExtensionApi): TilemapApi {
    api.registerObjectType(tilemapObjectType());
    api.registerValidator(validateTilemapObjects);
    const contrib = new TilemapContrib({ documents: api.workspace.documents, warn: (m) => api.workspace.log.warn("maps", m) });
    api.onDeactivate(() => contrib.dispose());
    return contrib;
  },
};

export default tilemapExtension;
