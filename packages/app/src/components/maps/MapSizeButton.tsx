// 맵 뷰 머리의 크기 표시. 누르면 맵/크기 바꾸기 (map.resize) 대화상자를 연다.

import type { MapDocument } from "@initial-editor/ext-tilemap/model";
import { observer } from "mobx-react-lite";

export const MapSizeButton = observer(function MapSizeButton({ document: doc, onResize }: { document: MapDocument; onResize: () => void }) {
  const m = doc.model;
  void m.revision;
  return (
    <button type="button" className="map-view-size" onClick={onResize} data-testid="map-size" title={`레이어 ${m.layers.length}, 오브젝트 ${m.objects.length}. 누르면 크기 바꾸기`}>
      {m.width}x{m.height} 칸 ({m.pixelWidth}x{m.pixelHeight} px)
    </button>
  );
});
