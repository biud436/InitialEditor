// 확장 레이어의 앱 쪽 자리 (docs/plans/e5-rpg.md 2.3). 타일맵 확장이 내보낸 TilemapApi(editor.tilemap)의 레이어를
// 맵 뷰와 레이어 패널과 인스펙터와 커맨드가 여기서 읽는다.
//   - 레이어마다 커맨드 map.layer.<id>: 대상을 그 레이어로 (단축키는 toolKey, 맵 메뉴의 "<이름> 도구").
//     맵 탭이 활성이고, 그 맵에 레이어 상태가 붙었고, 도구 단축키가 켜졌을 때만(MapSupport.toolKeysOff) 켜진다. 레이어의 visible 이 거짓이면
//     (이 프로젝트에 그 레이어가 없다) 메뉴에서 빠진다
//   - 저장 전 질문: 레이어 상태에 오류가 있는 맵은 목록을 보이고 "그래도 저장"을 묻는다

import type { CommandRegistry, Document, MenuRegistry } from "@initial-editor/core";
import { sortLayers, type MapLayerSpec, type TilemapApi } from "@initial-editor/ext-tilemap";
import { MapDocument, type ObjectProblem } from "@initial-editor/ext-tilemap/model";
import { reaction } from "mobx";
import type { ConfirmOptions } from "../modals";
import type { MapSupport } from "./MapSupport";

export const LAYER_COMMAND_PREFIX = "map.layer.";

/** 등록된 레이어, 아래부터 그리는 순서 (타일맵이 없으면 빈 목록) */
export function mapLayerSpecs(tilemap: TilemapApi | null | undefined): MapLayerSpec[] {
  return tilemap ? sortLayers(tilemap.layers.values()) : [];
}

export function layerCommandId(id: string): string {
  return `${LAYER_COMMAND_PREFIX}${id}`;
}

export interface LayerCommandHost {
  readonly tilemap: TilemapApi | null;
  readonly commands: Pick<CommandRegistry, "register">;
  readonly menus: Pick<MenuRegistry, "register">;
  setChecked(id: string, fn: () => boolean): void;
  setHint(id: string, fn: () => string | undefined): void;
}

const NEED_MAP = "맵 탭이 활성일 때";

/** 대상을 레이어로 고른다. 레이어 상태가 없으면(이 맵에 붙지 않았다) false */
export function selectExtLayer(doc: MapDocument, id: string): boolean {
  if (!doc.layerState(id)) return false;
  doc.setTarget({ kind: "ext", id });
  return true;
}

/** 레이어마다 커맨드와 메뉴를 둔다. 레이어가 등록되거나 거둬지면 따라간다. 돌려주는 함수로 뗀다 */
export function registerLayerCommands(host: LayerCommandHost, support: Pick<MapSupport, "activeMap" | "toolKeysOff">): () => void {
  const placed = new Map<string, { spec: MapLayerSpec; off: () => void }>();
  const sync = (specs: MapLayerSpec[]) => {
    for (const [id, entry] of [...placed]) {
      if (specs.includes(entry.spec)) continue;
      entry.off();
      placed.delete(id);
    }
    specs.forEach((spec, i) => {
      if (placed.has(spec.id)) return;
      const id = layerCommandId(spec.id);
      const attached = () => support.activeMap?.layerState(spec.id) != null;
      const offCommand = host.commands.register({
        id,
        label: `${spec.label} 도구`,
        category: "map",
        shortcut: spec.toolKey,
        enabled: () => attached() && !support.toolKeysOff,
        visible: () => spec.visible?.() ?? true,
        run: () => {
          const doc = support.activeMap;
          if (doc) selectExtLayer(doc, spec.id);
        },
      });
      host.setChecked(id, () => {
        const t = support.activeMap?.target;
        return t?.kind === "ext" && t.id === spec.id;
      });
      host.setHint(id, () => (!support.activeMap ? NEED_MAP : attached() ? undefined : `이 맵에는 ${spec.label} 레이어가 없다`));
      const offMenu = host.menus.register({ path: `맵/${spec.label} 도구`, commandId: id, order: 60 + i });
      placed.set(spec.id, {
        spec,
        off: () => {
          offMenu();
          offCommand();
        },
      });
    });
  };
  const stop = reaction(() => mapLayerSpecs(host.tilemap), sync, { fireImmediately: true });
  return () => {
    stop();
    for (const entry of placed.values()) entry.off();
    placed.clear();
  };
}

/** 저장 전 질문의 본문. 오류를 위치와 함께 몇 줄 보인다 */
export function layerErrorsMessage(title: string, errors: readonly ObjectProblem[], max = 8): string {
  const lines = errors.slice(0, max).map((p) => `- ${p.location}: ${p.message}`);
  if (errors.length > max) lines.push(`- 그 밖에 ${errors.length - max}개`);
  return `${title}에 오류가 ${errors.length}개 있다. 엔진이 틀린 항목을 건너뛰거나 멈출 수 있다.\n${lines.join("\n")}`;
}

/**
 * 저장 전 확인 (Editor.saveDocument 가 쓰기 전에 부른다). 맵 문서의 레이어 상태에 오류가 있으면 목록을 보이고
 * "그래도 저장"을 묻는다. 오류가 없거나 맵이 아니면 묻지 않고 true
 */
export async function confirmLayerErrors(modals: { confirm(options: ConfirmOptions): Promise<boolean> }, doc: Document): Promise<boolean> {
  if (!(doc instanceof MapDocument)) return true;
  const errors = doc.layerErrors();
  if (errors.length === 0) return true;
  return modals.confirm({
    title: "오류가 있는 맵 저장",
    message: layerErrorsMessage(doc.title, errors),
    okLabel: "그래도 저장",
    cancelLabel: "취소",
  });
}
