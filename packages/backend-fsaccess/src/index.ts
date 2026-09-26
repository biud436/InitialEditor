// @initial-editor/backend-fsaccess: 브라우저 폴더(File System Access API) 백엔드. 웹판(Cloudflare Pages)이 쓴다.

export { FsAccessBackend, OPFS_NAME, OPFS_ROOT, type FsAccessBackendOptions } from "./FsAccessBackend";
export { requestReadWrite, supportsFolderPicker } from "./fsOps";
export {
  createHandleStore,
  HandleStore,
  IdbFolderTable,
  MAX_FOLDERS,
  MemoryFolderTable,
  NO_RESTORE_MESSAGE,
  RESTORE_GUARD_KEY,
  RESTORE_GUARD_TTL_MS,
  RestoreGuard,
  type FolderRecord,
  type FolderTable,
  type KeyValueStore,
} from "./handleStore";
export { ChangePoller, DEFAULT_POLL_MS, SELF_WINDOW_MS, type PollSource, type Stamp, type StampedEntry } from "./poller";
export { hashBytes } from "./hash";
export type { FsDirHandle, FsFileHandle, FsHandle, FsHandleBase } from "./types";
