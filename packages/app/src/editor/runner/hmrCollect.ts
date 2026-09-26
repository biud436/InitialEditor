// 핫 리로드 묶음 수집 (docs/plans/e1-scripting.md 마일스톤 2). Tauri 모드에서 에디터가 직접 모은다.
// 브리지 모드는 서버가 디스크에서 모으므로 이 코드를 쓰지 않는다 (BridgeBackend.hmrPush 는 목록을 무시한다).
//
// 묶음: scripts/ 아래의 .lua 와 .rb 전부, 그리고 있으면 resources/scenes/ 와 resources/maps/ 아래의 .json.
// 엔진은 받은 파일을 작업 폴더에 그대로 쓰고 VM 을 통째로 다시 시작한다 (씬과 맵도 그때 다시 읽는다).
// 숨김 폴더(.git 같은 것)는 건너뛴다. 읽기는 병렬이되 동시 수를 제한한다.

import { BackendError, extname, type Entry, type HmrFile, type ProjectBackend } from "@initial-editor/core";

export const HMR_SCRIPT_DIR = "scripts";
export const HMR_SCRIPT_EXTENSIONS: ReadonlySet<string> = new Set(["lua", "rb"]);
export const HMR_JSON_DIRS: readonly string[] = ["resources/scenes", "resources/maps"];
const DEFAULT_CONCURRENCY = 8;

async function walk(backend: ProjectBackend, dir: string, accept: (e: Entry) => boolean, out: string[]): Promise<void> {
  const queue = [dir];
  while (queue.length > 0) {
    const current = queue.shift()!;
    let entries: Entry[];
    try {
      entries = await backend.list(current);
    } catch (e) {
      if (e instanceof BackendError && e.code === "not_found") continue; // 그 폴더가 없는 프로젝트다
      throw e;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.kind === "dir") queue.push(entry.path);
      else if (accept(entry)) out.push(entry.path);
    }
  }
}

/** 묶음에 들어갈 경로 (정렬됨). 읽지는 않는다 */
export async function collectHmrPaths(backend: ProjectBackend): Promise<string[]> {
  const paths: string[] = [];
  await walk(backend, HMR_SCRIPT_DIR, (e) => HMR_SCRIPT_EXTENSIONS.has(extname(e.path)), paths);
  for (const dir of HMR_JSON_DIRS) await walk(backend, dir, (e) => extname(e.path) === "json", paths);
  return paths.sort();
}

/** 묶음을 읽어 hmrPush 에 넘길 모양으로. 파일이 없으면 빈 배열 */
export async function collectHmrFiles(backend: ProjectBackend, opts: { concurrency?: number } = {}): Promise<HmrFile[]> {
  const paths = await collectHmrPaths(backend);
  const files: HmrFile[] = new Array(paths.length);
  let next = 0;
  const worker = async () => {
    while (next < paths.length) {
      const i = next++;
      files[i] = { path: paths[i], data: await backend.readBinary(paths[i]) };
    }
  };
  const workers = Math.max(1, Math.min(opts.concurrency ?? DEFAULT_CONCURRENCY, paths.length));
  await Promise.all(Array.from({ length: workers }, worker));
  return files;
}
