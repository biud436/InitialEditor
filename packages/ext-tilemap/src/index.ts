// 타일맵 확장 (docs/plans/e3-tilemap.md). E0 에서는 껍데기만 있다: 활성화되지만 아무것도 등록하지 않는다.
// E3 에서 오브젝트 타입 tilemap, 타일셋 자산, 팔레트와 레이어 패널, 도구, 맵 v2 변환이 들어온다.

import type { Extension, ExtensionApi } from "@initial-editor/core";

export const tilemapExtension: Extension = {
  id: "tilemap",
  name: "타일맵",
  activate(_api: ExtensionApi) {
    // E3 에서 채운다
  },
};

export default tilemapExtension;
