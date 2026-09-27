// File System Access API 중 이 백엔드가 쓰는 부분 (WICG 명세의 모양).
// lib.dom 에 없는 것(queryPermission, requestPermission, move)도 여기서 정한다.
// 브라우저의 진짜 핸들은 이 모양으로 바꿔 쓰고, 테스트의 가짜(test/fakeFs.ts)는 이 모양을 구현한다.

export type FsPermissionMode = "read" | "readwrite";
export type FsPermissionState = "granted" | "denied" | "prompt";

export interface FsPermissionDescriptor {
  mode: FsPermissionMode;
}

export interface FsHandleBase {
  readonly kind: "file" | "directory";
  readonly name: string;
  isSameEntry(other: FsHandleBase): Promise<boolean>;
  /** 크로미움의 폴더 열기 핸들에만 있다. 없으면 권한을 이미 가진 것으로 본다 (OPFS 등) */
  queryPermission?(descriptor: FsPermissionDescriptor): Promise<FsPermissionState>;
  /** 사용자 제스처(클릭) 안에서만 물을 수 있다 */
  requestPermission?(descriptor: FsPermissionDescriptor): Promise<FsPermissionState>;
  /** 옮기기와 이름 바꾸기. 브라우저와 대상에 따라 없거나 실패한다 */
  move?(destination: FsDirHandle, newName: string): Promise<void>;
}

/** getFile() 이 돌려주는 File 에서 쓰는 것 */
export interface FsFileData {
  readonly size: number;
  readonly lastModified: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface FsWritable {
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(reason?: unknown): Promise<void>;
}

export interface FsFileHandle extends FsHandleBase {
  readonly kind: "file";
  getFile(): Promise<FsFileData>;
  /** 임시 파일(스왑 파일)에 쓰고 close() 에서 한 번에 바꾼다 */
  createWritable(options?: { keepExistingData?: boolean }): Promise<FsWritable>;
}

export interface FsDirHandle extends FsHandleBase {
  readonly kind: "directory";
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FsDirHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FsFileHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  entries(): AsyncIterableIterator<[string, FsHandle]>;
}

export type FsHandle = FsFileHandle | FsDirHandle;
