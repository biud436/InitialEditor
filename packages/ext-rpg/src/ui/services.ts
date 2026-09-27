// 이벤트 레이어의 부품(인스펙터, 목록 패널, 도구)이 함께 쓰는 것. 확장의 activate 가 한 벌 만든다.

import type { DocumentRegistry, ProjectBackend } from "@initial-editor/core";
import type { MapDocument } from "@initial-editor/ext-tilemap/model";
import type { RpgSources } from "../model/layer";
import type { EventPlayMode } from "../model/rpgPlay";
import type { GameConfig, ItemTable } from "../model/game";
import type { CommandClipboard } from "./clipboard";
import type { ImageUrl } from "./argWidgets/context";
import type { EventClipboard } from "./eventClipboard";

/** 부품이 보는 저장소 (RpgProjectStore 가 맞는다. 테스트는 고정 값) */
export interface RpgStoreView extends RpgSources {
  readonly game: GameConfig | null;
  readonly items: ItemTable | null;
  /** 프로젝트 파일 목록 (프로젝트 기준, ./ 없이) */
  fileList(): string[];
  /** 등록된 맵들의 events. 편집 중인 맵은 current 로 바꿔 넣는다 */
  projectEvents(currentPath?: string | null, current?: readonly unknown[]): Array<readonly unknown[]>;
  startState(mapPath: string): string;
  setStartState(mapPath: string, text: string): Promise<void>;
}

/** 이벤트 실행: 이 이벤트 앞에서 실행(play)과 이 이벤트 자동 재생(probe). 확장이 타일맵의 실행 길로 잇는다 */
export interface RpgPlayActions {
  /** 띄울 수 없는 이유 (러너가 못 띄운다, play 가 없다, parallel 등). 띄울 수 있으면 undefined */
  blocked(doc: MapDocument, index: number, mode: EventPlayMode): string | undefined;
  /** 띄웠으면 true */
  run(doc: MapDocument, index: number, mode: EventPlayMode): Promise<boolean>;
}

export interface RpgUiServices {
  store: RpgStoreView;
  /** 이벤트 실행. 없으면 인스펙터와 목록에 실행 단추가 없다 */
  play?: RpgPlayActions;
  /** 열린 문서 (목록 패널이 활성 맵을 찾는다) */
  documents: DocumentRegistry;
  clipboard: EventClipboard;
  commandClipboard?: CommandClipboard;
  imageUrl?: ImageUrl;
  /** 짧은 알림 (편집 거절 등) */
  notify?(message: string): void;
  confirm?(message: string): boolean | Promise<boolean>;
}

/** 프로젝트 그림을 blob URL 로 (인스펙터의 외형과 얼굴 격자). 파일이 바뀌면 버린다 */
export class ImageUrls {
  private readonly cache = new Map<string, Promise<string | null>>();
  private readonly made = new Map<string, string>();

  constructor(private readonly backend: () => ProjectBackend) {}

  readonly url = (path: string): Promise<string | null> => {
    let p = this.cache.get(path);
    if (!p) {
      p = this.load(path);
      this.cache.set(path, p);
    }
    return p;
  };

  private async load(path: string): Promise<string | null> {
    if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function" || typeof Blob === "undefined") return null;
    try {
      const bytes = await this.backend().readBinary(path);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeOf(path) }));
      this.made.set(path, url);
      return url;
    } catch {
      return null;
    }
  }

  invalidate(path: string): void {
    const url = this.made.get(path);
    if (url) URL.revokeObjectURL(url);
    this.made.delete(path);
    this.cache.delete(path);
  }

  dispose(): void {
    for (const url of this.made.values()) URL.revokeObjectURL(url);
    this.made.clear();
    this.cache.clear();
  }
}

function mimeOf(path: string): string {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "bmp") return "image/bmp";
  return "image/png";
}
