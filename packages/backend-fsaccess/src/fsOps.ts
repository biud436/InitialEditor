// 핸들 위의 작은 도구: 폴더 고르기, OPFS 루트, 권한, 폴더 한 층 읽기, 원자적 쓰기, 복사.

import { BackendError } from "@initial-editor/core";
import { errorName, toBackendError } from "./errors";
import { DIR_STAMP, type Stamp, type StampedEntry } from "./poller";
import type { FsDirHandle, FsFileData, FsFileHandle, FsHandle, FsHandleBase } from "./types";

interface PickerHost {
  showDirectoryPicker?: (options: { mode: "readwrite"; id?: string }) => Promise<unknown>;
  navigator?: { storage?: { getDirectory?: () => Promise<unknown> } };
}

/** 폴더 고르기 대화상자의 id. 크롬은 id 마다 마지막으로 고른 폴더에서 대화상자를 연다 (다시 열기가 고르기로 돌 때 같은 폴더가 가깝다) */
export const FOLDER_PICKER_ID = "initial-editor";

/** 이 브라우저에 폴더 열기가 있는가 (크롬, 엣지). 파이어폭스와 사파리는 없다 */
export function supportsFolderPicker(): boolean {
  return typeof (globalThis as PickerHost).showDirectoryPicker === "function";
}

export async function defaultPicker(): Promise<FsDirHandle | null> {
  const host = globalThis as PickerHost;
  if (typeof host.showDirectoryPicker !== "function") {
    throw new BackendError("이 브라우저는 폴더 열기를 지원하지 않습니다. 크롬이나 엣지를 사용하세요.", "unsupported");
  }
  try {
    return (await host.showDirectoryPicker({ mode: "readwrite", id: FOLDER_PICKER_ID })) as FsDirHandle;
  } catch (e) {
    if (errorName(e) === "AbortError") return null;
    throw toBackendError(e);
  }
}

export async function defaultOpfsRoot(): Promise<FsDirHandle> {
  const storage = (globalThis as PickerHost).navigator?.storage;
  if (typeof storage?.getDirectory !== "function") throw new BackendError("이 브라우저는 OPFS를 지원하지 않습니다", "unsupported");
  return (await storage.getDirectory()) as FsDirHandle;
}

/**
 * 폴더의 읽기와 쓰기 권한을 확인하고, ask 면 없을 때 묻는다. 묻는 것은 클릭 처리기 안에서만 된다.
 * queryPermission 이 없는 핸들(OPFS, 가짜)은 권한이 있는 것으로 본다.
 */
export async function requestReadWrite(handle: FsHandleBase, ask = true): Promise<boolean> {
  if (typeof handle.queryPermission !== "function") return true;
  const descriptor = { mode: "readwrite" as const };
  if ((await handle.queryPermission(descriptor)) === "granted") return true;
  if (!ask || typeof handle.requestPermission !== "function") return false;
  try {
    return (await handle.requestPermission(descriptor)) === "granted";
  } catch {
    return false;
  }
}

export function isMissing(e: unknown): boolean {
  const name = errorName(e);
  return name === "NotFoundError" || name === "TypeMismatchError";
}

export function fileStamp(file: FsFileData): Stamp {
  return { kind: "file", size: file.size, mtime: file.lastModified };
}

export function joinRel(dir: string, name: string): string {
  return dir === "" ? name : `${dir}/${name}`;
}

/** 폴더 한 층의 항목과 도장. 목록을 읽는 사이에 사라진 파일은 뺀다 */
export async function readEntries(dir: FsDirHandle): Promise<StampedEntry[]> {
  const out: StampedEntry[] = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === "directory") {
      out.push({ name, stamp: DIR_STAMP });
      continue;
    }
    try {
      out.push({ name, stamp: fileStamp(await handle.getFile()) });
    } catch (e) {
      if (!isMissing(e)) throw e;
    }
  }
  return out;
}

export async function writeFile(handle: FsFileHandle, data: Uint8Array): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(data);
  } catch (e) {
    await writable.abort().catch(() => {});
    throw e;
  }
  await writable.close();
}

/** move() 가 없거나 실패할 때: 복사한다 (폴더는 통째로) */
export async function copyEntry(src: FsHandle, destDir: FsDirHandle, name: string): Promise<void> {
  if (src.kind === "file") {
    const data = new Uint8Array(await (await src.getFile()).arrayBuffer());
    await writeFile(await destDir.getFileHandle(name, { create: true }), data);
    return;
  }
  const sub = await destDir.getDirectoryHandle(name, { create: true });
  for await (const [childName, child] of src.entries()) await copyEntry(child, sub, childName);
}
