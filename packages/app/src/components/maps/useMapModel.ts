// 맵 모델의 평범한 데이터(레이어 목록, 타일셋)는 관찰 가능하지 않다. 레이어와 다시 읽기 이벤트에서 판을 올려 다시 그린다.

import type { MapDocument } from "@initial-editor/ext-tilemap/model";
import { useEffect, useState } from "react";

export function useMapStructure(doc: MapDocument): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    const offLayers = doc.model.events.on("layers", bump);
    const offReset = doc.model.events.on("reset", bump);
    return () => {
      offLayers();
      offReset();
    };
  }, [doc]);
  return version;
}
