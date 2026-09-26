// 레이어 패널의 동작. 모델의 레이어 명령을 넣고, 번호로 든 편집 상태(대상 레이어, 숨긴 레이어)를 새 번호에 맞춘다.
// 번호 맞추기는 명령 안에서 한다: 되돌리기와 다시 하기에서도 숨김과 대상이 같은 레이어를 따라간다.

import type { Command } from "@initial-editor/core";
import type { MapDocument, MapTarget } from "@initial-editor/ext-tilemap/model";
import { runInAction } from "mobx";

/** 겹치지 않는 새 레이어 이름 (layer 1, layer 2 ...) */
export function uniqueLayerName(names: readonly string[]): string {
  const taken = new Set(names);
  for (let i = names.length + 1; ; i++) {
    const name = `layer ${i}`;
    if (!taken.has(name)) return name;
  }
}

/** 옛 레이어 번호를 새 번호로 (null이면 그 레이어가 없어졌다) */
type Remap = (i: number) => number | null;

/** 숨긴 레이어 번호를 map으로 옮긴다 (null이면 뺀다) */
function remapHidden(doc: MapDocument, map: Remap): void {
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

function sameTarget(a: MapTarget, b: MapTarget): boolean {
  return a.kind === b.kind && (a.kind !== "layer" || a.index === (b as { index: number }).index);
}

/**
 * 모델의 레이어 명령에 편집 상태 맞추기를 붙인다. forward는 명령 전 번호를 명령 뒤 번호로, back은 그 반대다.
 * 대상: 명령 직후 그대로면 되돌릴 때 명령 전 대상으로, 다시 할 때 명령 뒤 대상으로 간다. 그 사이 바꿨으면
 * 같은 레이어를 따라가고, 그 레이어가 없어지면 명령 전(또는 뒤) 대상으로 간다.
 * removed가 있으면 그 번호의 레이어가 없어진다: 숨겨져 있었으면 되돌릴 때 다시 숨긴다.
 */
function withEditState(doc: MapDocument, inner: Command, forward: Remap, back: Remap, targetAfter: MapTarget, removed: number | null = null): Command {
  const targetBefore = doc.target;
  let executed = false;
  let removedHidden = false;
  const follow = (from: MapTarget, to: MapTarget, map: Remap): MapTarget | null => {
    const cur = doc.target;
    if (sameTarget(cur, from)) return to;
    if (cur.kind !== "layer") return null;
    const j = map(cur.index);
    return j === null ? to : { kind: "layer", index: j };
  };
  return {
    label: inner.label,
    execute: () => {
      const next = executed ? follow(targetBefore, targetAfter, forward) : targetAfter;
      removedHidden = removed !== null && doc.hiddenLayers.has(removed);
      inner.execute();
      executed = true;
      remapHidden(doc, forward);
      if (next) doc.setTarget(next);
    },
    undo: () => {
      const next = follow(targetAfter, targetBefore, back);
      inner.undo();
      remapHidden(doc, back);
      if (removed !== null && removedHidden) runInAction(() => doc.hiddenLayers.add(removed));
      if (next) doc.setTarget(next);
    },
  };
}

function activeLayer(doc: MapDocument): number | null {
  return doc.target.kind === "layer" && doc.target.index < doc.model.layers.length ? doc.target.index : null;
}

/** 대상 레이어 위(대상이 레이어가 아니면 맨 위)에 새 레이어를 넣고 대상으로 한다. 새 번호를 돌려준다 */
export function addLayer(doc: MapDocument): number {
  const active = activeLayer(doc);
  const at = active === null ? doc.model.layers.length : active + 1;
  const name = uniqueLayerName(doc.model.layers.map((l) => l.name));
  doc.apply(
    withEditState(
      doc,
      doc.model.addLayer(name, at),
      (i) => (i >= at ? i + 1 : i),
      (i) => (i === at ? null : i > at ? i - 1 : i),
      { kind: "layer", index: at },
    ),
  );
  return at;
}

/** 대상 레이어를 지운다. 마지막 하나는 지우지 않는다 */
export function removeLayer(doc: MapDocument): boolean {
  const index = activeLayer(doc);
  if (index === null || doc.model.layers.length <= 1) return false;
  doc.apply(
    withEditState(
      doc,
      doc.model.removeLayer(index),
      (i) => (i === index ? null : i > index ? i - 1 : i),
      (i) => (i >= index ? i + 1 : i),
      { kind: "layer", index: Math.max(0, index - 1) },
      index,
    ),
  );
  return true;
}

/** 대상 레이어를 위(+1, 나중에 그린다)나 아래(-1)로 옮긴다 */
export function moveLayer(doc: MapDocument, direction: 1 | -1): boolean {
  const index = activeLayer(doc);
  if (index === null) return false;
  const to = index + direction;
  if (to < 0 || to >= doc.model.layers.length) return false;
  const swap = (i: number) => (i === index ? to : i === to ? index : i);
  doc.apply(withEditState(doc, doc.model.moveLayer(index, to), swap, swap, { kind: "layer", index: to }));
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
