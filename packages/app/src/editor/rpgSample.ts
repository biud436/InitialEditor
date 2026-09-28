// 메모리 모드의 기본 샘플: 엔진의 RPG 데모 「떠나기 전에」(번들 템플릿 rpg). 처음 열 때 템플릿을 메모리에 쓴다
// (그림과 소리는 번들 자산 URL 에서 비동기로 읽는다). 이 쓰기는 사용자의 변경이 아니므로 떠나기 전 확인에 세지 않는다.

import { MemoryBackend, type ProjectInfo } from "@initial-editor/core";
import { writeProjectTemplate } from "./scene/projectTemplates";
import type { TemplateSource } from "./scene/templateFiles";

export const RPG_SAMPLE_NAME = "떠나기 전에";
/** 샘플을 열면 맵 뷰로 여는 맵 */
export const RPG_SAMPLE_MAP_PATH = "resources/maps/port_town.json";

export class RpgSampleBackend extends MemoryBackend {
  private seeded: Promise<void> | null = null;

  constructor(private readonly source?: TemplateSource) {
    super();
  }

  override async open(root: string): Promise<ProjectInfo> {
    await super.open(root);
    this.seeded ??= writeProjectTemplate(this, { template: "rpg", language: "lua", name: RPG_SAMPLE_NAME }, this.source).then(() => {
      this.volatileWrites = 0;
    });
    await this.seeded;
    return super.open(root);
  }
}
