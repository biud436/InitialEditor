// 다른 확장이 맵 문서에 붙이는 레이어의 상태 (docs/plans/e5-rpg.md 2.2).
// 레이어는 맵 파일의 최상위 키 하나(섹션)를 맡는다. 상태가 붙은 섹션은 저장할 때 모델의 원본 대신 상태의 serialize() 값을 쓴다.
// 등록과 붙이기는 contrib.ts 의 TilemapApi 가 하고, 여기는 문서가 쥐는 모양만 둔다.

import type { Command } from "@initial-editor/core";
import type { MapDocument } from "./mapDocument";
import type { CellOffset } from "./resize";
import type { ObjectProblem } from "./schema";

/** 확장 레이어가 맵 문서 하나에 붙인 상태 */
export interface MapLayerState {
  /** 편집을 막는 이유 (스키마 버전, 두 벌인 맵 등). 없으면 null. 관찰 가능해야 레이어 패널이 따라온다 */
  readonly locked: string | null;
  /** 맵 파일에 쓸 값. undefined 면 키를 쓰지 않는다 */
  serialize(): unknown;
  /** 문제 목록. severity error 가 있으면 앱이 저장 전에 묻는다 */
  problems(): ObjectProblem[];
  /** 파일을 다시 읽었다. raw 는 새 원본 (없으면 undefined) */
  reset(raw: unknown): void;
  /** 스키마나 설정이 바뀌었다. 데이터는 그대로 두고 locked 와 problems 를 다시 계산한다 */
  refresh(): void;
  dispose(): void;
  /** 맵 크기 바꾸기가 칸을 옮긴다. 되돌릴 명령을 돌려주면 크기 바꾸기와 한 단계다. 없으면 옮기지 않는다 */
  shift?(offset: CellOffset): Command | null;
}

/** 문서가 레이어를 붙이는 데 쓰는 것 (MapLayerSpec 의 일부) */
export interface MapLayerBinding {
  readonly id: string;
  /** 이 레이어가 읽고 쓰는 맵 파일의 최상위 키 */
  readonly section: string;
  /** 이 맵에 붙지 않으면 null */
  attach(doc: MapDocument): MapLayerState | null;
}

/** 확장이 맡을 수 없는 최상위 키 (타일맵이 해석한다). events 는 타일맵이 자리만 지키므로 맡을 수 있다 */
export const TILEMAP_OWN_KEYS: readonly string[] = ["version", "name", "id", "width", "height", "tileWidth", "tileHeight", "layers", "collision", "tilesets", "objects"];

/** 섹션 이름을 쓸 수 없는 이유. 쓸 수 있으면 null */
export function sectionKeyProblem(key: string): string | null {
  if (key.trim() === "") return "섹션 이름이 비었다";
  if (TILEMAP_OWN_KEYS.includes(key)) return `섹션 ${key} 은(는) 타일맵이 맡는다`;
  return null;
}
