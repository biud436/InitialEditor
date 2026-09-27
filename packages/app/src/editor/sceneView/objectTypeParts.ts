// 확장이 등록한 오브젝트 타입에 앱이 만드는 부분(인스펙터, 씬 뷰 노드)을 붙인다. 확장 API에 UI 등록이 아직 없어
// 타일맵 확장의 인스펙터와 씬 노드는 앱에 있다. 레지스트리의 명세 객체 그 자체에 채워서, 확장을 해제할 때
// 등록이 그대로 거둬지게 한다. 확장이 직접 준 것은 덮지 않는다.

import type { ObjectTypeSpec } from "@initial-editor/core";
import { intercept, type ObservableMap } from "mobx";

type PartKey = "Inspector" | "createSceneNode";

export type ObjectTypeParts = Partial<Pick<ObjectTypeSpec, PartKey>>;

/**
 * type의 명세에 parts를 붙인다. 지금 없으면 등록될 때 붙인다 (MobX intercept는 값이 맵에 들어가기 전에 불리므로
 * 반응(씬 뷰, 인스펙터)이 그 명세를 처음 볼 때 이미 채워져 있다). 돌려주는 함수는 듣기를 멈추고 붙인 것을 뗀다.
 */
export function attachObjectTypeParts(objectTypes: ObservableMap<string, ObjectTypeSpec>, type: string, parts: ObjectTypeParts): () => void {
  const filled = new Map<ObjectTypeSpec, PartKey[]>();
  const fill = (spec: ObjectTypeSpec | undefined) => {
    if (!spec || filled.has(spec)) return;
    const keys: PartKey[] = [];
    if (parts.Inspector !== undefined && spec.Inspector === undefined) {
      spec.Inspector = parts.Inspector;
      keys.push("Inspector");
    }
    if (parts.createSceneNode !== undefined && spec.createSceneNode === undefined) {
      spec.createSceneNode = parts.createSceneNode;
      keys.push("createSceneNode");
    }
    filled.set(spec, keys);
  };
  fill(objectTypes.get(type));
  const stop = intercept(objectTypes, (change) => {
    if (change.name === type && (change.type === "add" || change.type === "update")) fill(change.newValue);
    return change;
  });
  return () => {
    stop();
    for (const [spec, keys] of filled) {
      for (const key of keys) if (spec[key] === parts[key]) delete spec[key];
    }
    filled.clear();
  };
}
