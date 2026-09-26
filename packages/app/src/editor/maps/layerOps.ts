// 레이어 패널의 동작. 모델의 레이어 명령을 넣고, 번호로 든 편집 상태(대상 레이어, 숨긴 레이어)를 새 번호에 맞춘다.

import type { MapDocument } from "@initial-editor/ext-tilemap/model";
import { runInAction } from "mobx";

/** 겹치지 않는 새 레이어 이름 (layer 1, layer 2 ...) */
export function uniqueLayerName(names: readonly string[]): string {
  const taken = new Set(names);
  for (let i = names.length + 1; ; i++) {
    const name = `layer ${i}`;
    if (!taken.has(name)) return name;
  }
}

/** 숨긴 레이어 번호를 map으로 옮긴다 (null이면 뺀다) */
function remapHidden(doc: MapDocument, map: (i: number) => number | null): void {
  const next: number[] = [];
  for (const i of doc.hiddenLayers) {
    const j = map(i);
    if (j !== null) next.push(j);
  }
  runInAction(() => {
    doc.hiddenLayers.clear();
    for (const j of next) doc.hiddenLayers.add(j);
  });
}

function activeLayer(doc: MapDocument): number | null {
  return doc.target.kind === "layer" && doc.target.index < doc.model.layers.length ? doc.target.index : null;
}

/** 대상 레이어 위(대상이 레이어가 아니면 맨 위)에 새 레이어를 넣고 대상으로 한다. 새 번호를 돌려준다 */
export function addLayer(doc: MapDocument): number {
  const active = activeLayer(doc);
  const at = active === null ? doc.model.layers.length : active + 1;
  const name = uniqueLayerName(doc.model.layers.map((l) => l.name));
  doc.apply(doc.model.addLayer(name, at));
  remapHidden(doc, (i) => (i >= at ? i + 1 : i));
  doc.setTarget({ kind: "layer", index: at });
  return at;
}

/** 대상 레이어를 지운다. 마지막 하나는 지우지 않는다 */
export function removeLayer(doc: MapDocument): boolean {
  const index = activeLayer(doc);
  if (index === null || doc.model.layers.length <= 1) return false;
  doc.apply(doc.model.removeLayer(index));
  remapHidden(doc, (i) => (i === index ? null : i > index ? i - 1 : i));
  doc.setTarget({ kind: "layer", index: Math.max(0, index - 1) });
  return true;
}

/** 대상 레이어를 위(+1, 나중에 그린다)나 아래(-1)로 옮긴다 */
export function moveLayer(doc: MapDocument, direction: 1 | -1): boolean {
  const index = activeLayer(doc);
  if (index === null) return false;
  const to = index + direction;
  if (to < 0 || to >= doc.model.layers.length) return false;
  doc.apply(doc.model.moveLayer(index, to));
  remapHidden(doc, (i) => (i === index ? to : i === to ? index : i));
  doc.setTarget({ kind: "layer", index: to });
  return true;
}

/** 이름 바꾸기. 비었거나 같으면 하지 않는다 */
export function renameLayer(doc: MapDocument, index: number, name: string): boolean {
  const clean = name.trim();
  const layer = doc.model.layers[index];
  if (!layer || clean === "" || clean === layer.name) return false;
  doc.apply(doc.model.renameLayer(index, clean));
  return true;
}
