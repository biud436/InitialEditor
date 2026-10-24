// RPG Maker 2000 타일맵 확장 (docs/plans/rm2k-tilemap.md). 타일맵 확장의 자리에 타일셋 종류 "rm2k" 를 등록한다:
//   - 새 맵 대화상자에서 ChipSet(480x256, 타일 16) 을 고르면 아틀라스로 구워 resources/tiles/<이름>.rm2k.png 에 쓰고,
//     타일셋 항목에 animations(물, 애니메이션 타일)와 rm2k 키를 적는다
//   - 팔레트는 하층과 상층 두 쪽이고, 칠하면 땅과 물의 모양을 이웃에 맞춘다 (rules.ts)
//   - 원본 ChipSet 이 바뀌면 열린 맵의 아틀라스를 다시 굽고, 맵을 열 때 아틀라스가 없으면 굽는다 (저장소에 아틀라스를 두지
//     않아도 ChipSet 만 있으면 된다)

import type { Extension, ExtensionApi } from "@initial-editor/core";
import { TILEMAP_EXTENSION_ID, type PalettePage, type TilemapApi, type TilesetKindSpec } from "@initial-editor/ext-tilemap";
import { MapDocument, type Tileset } from "@initial-editor/ext-tilemap/model";
import {
  atlasPathFor,
  bakeChipsetFile,
  CHIPSET_HEIGHT,
  CHIPSET_WIDTH,
  DEFAULT_WATER_ANIMATION,
  PALETTE_COLUMNS,
  PALETTE_PAGES,
  paletteCellOf,
  rm2kAutotileRule,
  rm2kInfo,
  rm2kTileset,
  TILE,
  type WaterAnimation,
} from "./model";

export const RM2K_EXTENSION_ID = "rm2k";
export const RM2K_TILESET_KIND = "rm2k";
const LOG = "rm2k";

/** 타일셋 하나의 팔레트 쪽 (gid 로) */
export function rm2kPalettePages(tileset: Tileset): PalettePage[] {
  const first = tileset.firstGid;
  return PALETTE_PAGES.map((page) => ({
    id: page.id,
    label: page.label,
    columns: PALETTE_COLUMNS,
    cells: page.cells.map((c) => ({ value: c.local === null ? 0 : first + c.local, icon: first + c.icon, label: c.label })),
    cellOf: (gid: number) => paletteCellOf(page, gid <= 0 ? null : gid - first),
  }));
}

function waterOption(options: Readonly<Record<string, string>>): WaterAnimation {
  return {
    pattern: options.water === "loop" ? "loop" : DEFAULT_WATER_ANIMATION.pattern,
    speed: options.waterSpeed === "fast" ? "fast" : DEFAULT_WATER_ANIMATION.speed,
  };
}

export function rm2kTilesetKind(): TilesetKindSpec {
  return {
    id: RM2K_TILESET_KIND,
    label: "RPG Maker 2000 ChipSet",
    description: "하층과 상층 팔레트, 땅과 물의 오토타일, 물결과 애니메이션 타일을 씁니다. 이미지는 아틀라스로 바꿔 resources/tiles 에 씁니다.",
    guides: [
      { label: "따라 하기", page: "rm2k-tutorial.md" },
      { label: "설명서", page: "rm2k.md" },
    ],
    owns: (tileset) => rm2kInfo(tileset) !== null,
    palette: (tileset) => rm2kPalettePages(tileset),
    autotile: (tileset) => rm2kAutotileRule(tileset.firstGid),
    accepts: (image, tileWidth, tileHeight) => image.width === CHIPSET_WIDTH && image.height === CHIPSET_HEIGHT && tileWidth === TILE && tileHeight === TILE,
    options: [
      {
        id: "water",
        label: "물결",
        choices: [
          { value: "pingpong", label: "왕복" },
          { value: "loop", label: "한 방향" },
        ],
        default: DEFAULT_WATER_ANIMATION.pattern,
      },
      {
        id: "waterSpeed",
        label: "물결 빠르기",
        choices: [
          { value: "normal", label: "보통" },
          { value: "fast", label: "빠르게" },
        ],
        default: DEFAULT_WATER_ANIMATION.speed,
      },
    ],
    async createTileset({ source, options, backend }) {
      const image = atlasPathFor(source);
      await bakeChipsetFile(backend, source, image);
      return rm2kTileset(source, image, waterOption(options));
    },
  };
}

export const rm2kExtension: Extension = {
  id: RM2K_EXTENSION_ID,
  name: "RPG Maker 2000 타일맵",
  dependsOn: [TILEMAP_EXTENSION_ID],
  activate(api: ExtensionApi) {
    const tilemap = api.exportsOf<TilemapApi>(TILEMAP_EXTENSION_ID);
    const { workspace } = api;
    api.onDeactivate(tilemap.registerTilesetKind(rm2kTilesetKind()));

    // 같은 아틀라스를 두 번 겹쳐 굽지 않는다 (굽는 중에 또 바뀌면 끝난 뒤 한 번 더)
    const running = new Map<string, Promise<void>>();
    const bake = (chipset: string, image: string, why: string): Promise<void> => {
      const prev = running.get(image) ?? Promise.resolve();
      const next = prev.then(async () => {
        try {
          await bakeChipsetFile(workspace.backend(), chipset, image);
          workspace.log.info(LOG, `${why}: ${chipset} → ${image}`);
        } catch (e) {
          const message = `ChipSet 굽기 실패 (${chipset}): ${(e as Error).message}`;
          workspace.log.error(LOG, message);
          workspace.toasts.error(message);
        }
      });
      running.set(image, next);
      void next.finally(() => {
        if (running.get(image) === next) running.delete(image);
      });
      return next;
    };

    const rm2kTilesets = (doc: MapDocument) =>
      doc.model.tilesets.flatMap((t) => {
        const info = rm2kInfo(t);
        return info ? [{ image: t.image, chipset: info.chipset }] : [];
      });

    const ensureAtlases = async (doc: MapDocument) => {
      const backend = workspace.backend();
      for (const t of rm2kTilesets(doc)) {
        try {
          if (!(await backend.exists(t.image)) && (await backend.exists(t.chipset))) await bake(t.chipset, t.image, "아틀라스가 없어 ChipSet 으로 만듦");
        } catch {
          // 확인하지 못한 파일은 맵 뷰가 읽기 실패로 알린다
        }
      }
    };

    api.onDeactivate(
      workspace.documents.events.on("open", (doc) => {
        if (doc instanceof MapDocument) void ensureAtlases(doc);
      }),
    );
    for (const doc of workspace.documents.documents) if (doc instanceof MapDocument) void ensureAtlases(doc);

    api.onDeactivate(
      workspace.project.onFileChange((e) => {
        if (e.kind === "delete") return;
        const targets = new Map<string, string>();
        for (const doc of workspace.documents.documents) {
          if (!(doc instanceof MapDocument)) continue;
          for (const t of rm2kTilesets(doc)) if (t.chipset === e.path) targets.set(t.image, t.chipset);
        }
        for (const [image, chipset] of targets) void bake(chipset, image, "ChipSet 이 바뀌어 아틀라스를 다시 구움");
      }),
    );
  },
};
