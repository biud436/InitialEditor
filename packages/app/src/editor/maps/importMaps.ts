// 맵 가져오기 (맵 > 맵 가져오기). 확장이 등록한 맵 가져오기(TilemapApi.registerMapImporter, 예: RPG Maker 2000 게임)로
// 다른 도구의 폴더를 맵 파일로 옮긴다. 대화상자는 components/maps/ImportMapDialog.tsx.
//   - 폴더는 <input type="file" webkitdirectory> 로 고른다. 브라우저, 데스크톱 앱, 메모리 모드에서 같고, 프로젝트 백엔드와
//     상관없다. 고른 파일의 webkitRelativePath 가 고른 폴더 기준 경로다
//   - 가져온 뒤: 맵 id 는 프로젝트의 맵 가운데 가장 큰 것 다음부터, 쓴 폴더를 다시 읽고, 콘솔에 맵마다 한 줄, 첫 맵을 연다

import type { LogStore, ProjectBackend } from "@initial-editor/core";
import type { ImportSource, MapImportPlan, MapImportResult } from "@initial-editor/ext-tilemap";
import { MAPS_DIR } from "@initial-editor/ext-tilemap/model";
import { RESOURCES_DIR } from "../scene/projectAssets";
import { listMapPaths, nextMapId } from "./newMap";

const LOG = "maps";

/** 고른 폴더의 파일로 ImportSource. 파일이 없으면 null */
export function sourceFromFiles(files: ArrayLike<File>): ImportSource | null {
  const byPath = new Map<string, File>();
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const rel = (f.webkitRelativePath || f.name).replace(/\\/g, "/");
    byPath.set(rel, f);
  }
  if (byPath.size === 0) return null;
  const first = [...byPath.keys()][0];
  const name = first.includes("/") ? first.slice(0, first.indexOf("/")) : "";
  return {
    name,
    paths: [...byPath.keys()],
    read: async (path) => {
      const f = byPath.get(path);
      if (!f) throw new Error(`선택한 폴더에 없는 파일: ${path}`);
      return new Uint8Array(await f.arrayBuffer());
    },
  };
}

export interface ImportHost {
  readonly backend: ProjectBackend;
  readonly project: { refresh(rel: string): Promise<unknown> };
  readonly log: LogStore;
}

/** 고른 항목을 가져와 쓴 폴더를 다시 읽고 콘솔에 남긴다 */
export async function runMapImport(host: ImportHost, plan: MapImportPlan, ids: readonly string[], progress?: (done: number, total: number) => void): Promise<MapImportResult> {
  const firstMapId = await nextMapId(host.backend, await listMapPaths(host.backend));
  const result = await plan.run(ids, { backend: host.backend, firstMapId, progress });
  const dirs = new Set(["", RESOURCES_DIR, MAPS_DIR]);
  for (const p of [...result.maps, ...result.files]) {
    const parts = p.split("/");
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
  }
  for (const dir of dirs) await host.project.refresh(dir).catch(() => {});
  host.log.info(LOG, `맵 가져오기: ${plan.title}, 맵 ${result.maps.length}개`);
  for (const note of result.notes) host.log.info(LOG, `  ${note}`);
  return result;
}
