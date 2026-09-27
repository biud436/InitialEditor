// 커맨드의 맵 위치 인자 (e5 문서 4절의 "맵 이동의 대상 고르기"). 맵 인자(ref map)와 정수 인자 x, y 를 함께 가진 커맨드가
// 대상이고(지금 스키마에서는 transfer), 커맨드 이름은 코드에 적지 않는다. DOM 은 모른다.
//
//   대상 맵   맵 인자가 가리키는 rpg-game.json 항목의 file. 등록되지 않았거나, 파일이 없거나, 엔진이 열 수 없는 맵이면 이유
//   맵 확인   엔진의 Tilemap::load 규칙(ext-tilemap 의 checkEngineMap)과 타일셋 그림이 프로젝트에 있는지
//   단추      맵에서 고르기는 대상 맵과 쓸 수 있는 레이어가 있어야 하고, 대상 보기는 대상 맵과 x, y 가 있어야 한다

import { checkEngineMap } from "@initial-editor/ext-tilemap/model";
import { bareProjectPath, mapByName, type GameConfig } from "./game";
import { field, isJsonText, isNonNegInt } from "./json";
import type { Cell } from "./play";
import type { CommandSpec } from "./schema";

/** 맵 위치 인자의 이름 */
export interface LocationArgs {
  map: string;
  x: string;
  y: string;
}

/** 맵 인자(ref map)와 정수 인자 x, y 가 모두 있는 커맨드의 인자 이름. 아니면 null */
export function locationArgs(spec: CommandSpec | undefined | null): LocationArgs | null {
  if (!spec) return null;
  const map = spec.args.find((a) => a.type === "ref" && a.ref === "map");
  const x = spec.args.find((a) => a.name === "x" && a.type === "integer");
  const y = spec.args.find((a) => a.name === "y" && a.type === "integer");
  return map && x && y ? { map: map.name, x: x.name, y: y.name } : null;
}

/** 맵 파일 하나를 읽은 결과와 엔진 규칙의 판정 */
export type MapFileCheck = { kind: "missing" } | { kind: "error"; message: string } | { kind: "invalid"; reason: string } | { kind: "ok"; images: readonly string[] };

/** 읽은 글을 엔진 규칙으로 판정한다. 타일셋 그림이 있는지는 mapFileProblem 이 본다 */
export function checkMapFile(read: { kind: "missing" } | { kind: "error"; message: string } | { kind: "text"; text: string }): MapFileCheck {
  if (read.kind !== "text") return read;
  const r = checkEngineMap(read.text);
  return r.ok ? { kind: "ok", images: r.images } : { kind: "invalid", reason: r.reason };
}

/**
 * 맵 파일을 엔진이 열 수 없는 이유 (없으면 null, 판정을 아직 모르면 undefined). 타일셋 그림은 fileExists 가 아는 것만 본다
 * (fileExists 가 null 이면 보지 않는다)
 */
export function mapFileProblem(path: string, check: MapFileCheck | undefined, fileExists: ((projectPath: string) => boolean) | null | undefined): string | null | undefined {
  if (!check) return undefined;
  if (check.kind === "missing") return `맵 파일 없음: ${path}`;
  if (check.kind === "error") return `맵 파일 읽기 실패: ${check.message}`;
  if (check.kind === "invalid") return `엔진이 열 수 없는 맵: ${check.reason}`;
  const missing = fileExists ? check.images.find((img) => !fileExists(img)) : undefined;
  return missing === undefined ? null : `엔진이 열 수 없는 맵: 타일셋 그림 없음 (${missing})`;
}

export interface LocationSources {
  readonly game: GameConfig | null;
  /** rpg-game.json 을 읽지 못한 이유 */
  readonly gameProblem?: string | null;
  /** 맵 파일을 엔진이 열 수 없는 이유 (프로젝트 경로). 열 수 있으면 null, 아직 모르면 undefined */
  mapFileProblem(path: string): string | null | undefined;
}

export type LocationTarget =
  | { ok: true; name: string; /** 대상 맵 파일 (프로젝트 경로) */ path: string; /** x 와 y 가 모두 0 이상의 정수면 그 타일 */ cell: Cell | null }
  | { ok: false; reason: string };

/** 커맨드의 대상 맵 */
export function locationTarget(cmd: unknown, args: LocationArgs, sources: LocationSources): LocationTarget {
  const name = field(cmd, args.map);
  if (name === undefined || name === "") return { ok: false, reason: "맵 미지정" };
  if (!isJsonText(name)) return { ok: false, reason: "맵 인자가 글이 아님" };
  if (!sources.game) return { ok: false, reason: `rpg-game.json 읽기 실패${sources.gameProblem ? ` (${sources.gameProblem})` : ""}` };
  const entry = mapByName(sources.game, name);
  if (!entry) return { ok: false, reason: `rpg-game.json 에 등록되지 않은 맵: ${name}` };
  const path = bareProjectPath(entry.file);
  const problem = sources.mapFileProblem(path);
  if (problem === undefined) return { ok: false, reason: `맵 파일 확인 중: ${path}` };
  if (problem !== null) return { ok: false, reason: problem };
  const x = field(cmd, args.x);
  const y = field(cmd, args.y);
  return { ok: true, name, path, cell: isNonNegInt(x) && isNonNegInt(y) ? { x, y } : null };
}

/** 맵에서 고르기를 막는 이유. locked 는 레이어의 잠금(스키마, 읽기 전용 맵), views 는 맵 뷰를 쓸 수 없는 이유 */
export function pickBlocked(target: LocationTarget, locked: string | null | undefined, views?: string): string | undefined {
  if (locked) return `읽기 전용: ${locked}`;
  if (views) return views;
  return target.ok ? undefined : target.reason;
}

/** 대상 보기를 막는 이유 */
export function revealBlocked(target: LocationTarget, views?: string): string | undefined {
  if (views) return views;
  if (!target.ok) return target.reason;
  return target.cell ? undefined : "x, y 미지정";
}
