// 맵 오브젝트의 복사, 잘라내기, 붙여넣기, 복제, 삭제. 편집 메뉴의 edit.* 커맨드(scene/sceneCommands.ts)는
// 활성 문서가 맵이면 mapEditRouter로 온다. 아니면 씬 쪽이 그대로 받는다.
// 클립보드는 종류마다 하나다: 씬 오브젝트는 SceneTools.clipboard, 맵 오브젝트는 MapClipboard (MapSupport.clipboard).
// 붙여넣기는 맨 뒤에 붙이고 x로만 한 칸(타일 폭) 옮긴다. y는 그대로라 바닥에 선 몬스터와 시작 지점이 바닥에 남는다.
// 거듭 붙이면 한 칸씩 더 간다. 맵 밖이면 안으로 당기고, 당겨서 옮김이 없어지면(맵 끝의 오브젝트) 반대쪽으로 옮긴다.
// id는 맵에 없으면 원래 것을 쓴다: 잘라내고 붙이면 옮기기이고(시작 지점은 start 그대로), 있으면 새 id다.
// 잘라내기는 복사와 삭제이고 삭제가 되돌리기 한 단계다.

import type { Document } from "@initial-editor/core";
import { cloneObject, compound, MapDocument, typeOf, uniqueMapObjectId, type MapObject, type MapObjectSchema } from "@initial-editor/ext-tilemap/model";
import { makeObservable, observable, runInAction } from "mobx";
import { deleteMapObjects, duplicateMapObjects, type MapObjectHost } from "./objectTools/actions";
import { placeCopy, type CopyBounds } from "./objectTools/rules";

export { pasteAxis } from "./objectTools/rules";

const LOG = "maps";

export interface PastePlan {
  objects: MapObject[];
  /** 하나만 둘 수 있는 타입이라 붙이지 않은 클립보드의 id */
  skipped: string[];
}

/**
 * 붙일 오브젝트: x로 dx 픽셀 옮김(y는 그대로, 순찰 범위는 x와 함께), 맵 안으로 당김 (placeCopy).
 * id는 맵과 이번 붙이기에 없으면 원래 것, 있으면 겹치지 않는 새 것이다.
 * 하나만 둘 수 있는 타입은 맵에 이미 있거나 이번에 하나 붙였으면 건너뛴다.
 */
export function planPaste(schema: MapObjectSchema | null, existing: readonly MapObject[], clipboard: readonly MapObject[], dx: number, geometry: CopyBounds): PastePlan {
  const taken = new Set(existing.map((o) => o.id));
  const uniqueTaken = new Set(existing.map((o) => o.type));
  const objects: MapObject[] = [];
  const skipped: string[] = [];
  for (const source of clipboard) {
    const spec = typeOf(schema, source.type);
    if (spec?.unique && uniqueTaken.has(source.type)) {
      skipped.push(source.id);
      continue;
    }
    uniqueTaken.add(source.type);
    const placed = placeCopy(source, spec, dx, geometry);
    const id = taken.has(source.id) ? uniqueMapObjectId(source.id.replace(/_\d+$/, "") || source.type, taken) : source.id;
    taken.add(id);
    objects.push({ ...placed, id });
  }
  return { objects, skipped };
}

export class MapClipboard {
  objects: MapObject[] = [];
  private pasteCount = 0;

  constructor() {
    makeObservable(this, { objects: observable.ref });
  }

  get size(): number {
    return this.objects.length;
  }

  /** 고른 오브젝트를 담는다 (맵의 순서대로). 담은 수 */
  copy(doc: MapDocument): number {
    const selected = doc.model.objects.filter((o) => doc.selection.has(o.id));
    if (selected.length === 0) return 0;
    runInAction(() => {
      this.objects = selected.map(cloneObject);
    });
    this.pasteCount = 0;
    return selected.length;
  }

  /** 복사하고 지운다 (되돌리기 한 단계). 지운 수 */
  cut(doc: MapDocument): number {
    if (this.copy(doc) === 0) return 0;
    const ids = doc.selectedIds;
    const cmd = doc.model.removeObjects(ids);
    doc.apply({ ...cmd, label: ids.length === 1 ? `잘라내기: ${ids[0]}` : `오브젝트 ${ids.length}개 잘라내기` });
    runInAction(() => ids.forEach((id) => doc.selection.delete(id)));
    return ids.length;
  }

  /** 붙이고 붙인 것을 고른다. 새 id 목록 */
  paste(host: MapObjectHost, doc: MapDocument): string[] {
    if (this.objects.length === 0) return [];
    const step = this.pasteCount + 1;
    const m = doc.model;
    const plan = planPaste(doc.schema, m.objects, this.objects, m.tileWidth * step, { pixelWidth: m.pixelWidth, pixelHeight: m.pixelHeight });
    if (plan.skipped.length > 0) host.toasts.warn(`맵당 1개만 허용되는 타입이라 붙여넣기 제외: ${plan.skipped.join(", ")}`);
    if (plan.objects.length === 0) return [];
    this.pasteCount = step;
    const ids = plan.objects.map((o) => o.id);
    const cmds = plan.objects.map((o) => m.addObject(o));
    doc.apply(cmds.length === 1 ? { ...cmds[0], label: `붙여넣기: ${ids[0]}` } : compound(`오브젝트 ${ids.length}개 붙여넣기`, cmds));
    doc.select(ids);
    host.log.info(LOG, `오브젝트 붙여넣기: ${ids.join(", ")}`);
    return ids;
  }
}

export type EditAction = "copy" | "cut" | "paste" | "duplicate" | "delete";

export const NEED_MAP_SELECTION = "선택한 맵 오브젝트 없음 (맵 오브젝트 패널이나 맵 뷰에서 선택)";
export const EMPTY_MAP_CLIPBOARD = "복사한 맵 오브젝트 없음";

export interface MapEditHost extends MapObjectHost {
  readonly documents: { readonly active: Document | null };
}

/** 편집 커맨드의 맵 쪽. active()가 null이면 씬 쪽이 받는다 */
export interface MapEditRouter {
  active(): MapDocument | null;
  enabled(action: EditAction): boolean;
  hint(action: EditAction): string | undefined;
  run(action: EditAction): void;
}

export function mapEditRouter(host: MapEditHost, clipboard: () => MapClipboard | null): MapEditRouter {
  const active = () => (host.documents.active instanceof MapDocument ? host.documents.active : null);
  const selected = () => active()?.selectedIds ?? [];
  const enabled = (action: EditAction) => {
    if (!active()) return false;
    if (action === "paste") return (clipboard()?.size ?? 0) > 0;
    return selected().length > 0;
  };
  return {
    active,
    enabled,
    hint: (action) => (enabled(action) ? undefined : action === "paste" ? EMPTY_MAP_CLIPBOARD : NEED_MAP_SELECTION),
    run: (action) => {
      const doc = active();
      const board = clipboard();
      if (!doc || !enabled(action)) return;
      switch (action) {
        case "copy": {
          const n = board?.copy(doc) ?? 0;
          if (n > 0) host.toasts.info(`맵 오브젝트 ${n}개 복사됨`);
          break;
        }
        case "cut":
          board?.cut(doc);
          break;
        case "paste":
          board?.paste(host, doc);
          break;
        case "duplicate":
          duplicateMapObjects(host, doc, doc.selectedIds);
          break;
        case "delete":
          deleteMapObjects(doc, doc.selectedIds);
          break;
      }
    },
  };
}
