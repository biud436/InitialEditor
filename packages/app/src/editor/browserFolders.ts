// 웹판의 폴더 다루기 (브라우저 폴더 모드). 시작 화면과 최근 프로젝트 메뉴가 쓴다.
//   폴더 열기: 폴더를 고르고(showDirectoryPicker) 핸들을 IndexedDB 에 기억한 뒤 연다. 기억한 핸들은 꺼내지 않는다
//   다시 열기: 일반 프로필이면 기억한 핸들을 꺼내 권한을 클릭 안에서 다시 묻고 연다. 시크릿 프로필일 수 있거나
//             지난번에 꺼내다 죽었으면 꺼내지 않고 이유를 한 줄 알린 뒤 폴더 고르기로 연다 (handleStore.ts)
//   샘플로 해 보기: 메모리 백엔드로 바꿔 샘플 프로젝트를 연다
// 최근 목록은 설정의 recentProjects 가 아니라 IndexedDB 의 기억한 폴더다 (키만으로는 이름을 모른다).

import { FsAccessBackend, requestReadWrite, supportsFolderPicker, type FolderRecord } from "@initial-editor/backend-fsaccess";
import { makeObservable, observable, runInAction } from "mobx";
import { createMemoryBackend, SAMPLE_ROOT } from "./backends";
import type { Editor } from "./Editor";

export class BrowserFolders {
  /** 기억한 폴더 (최근 순) */
  records: FolderRecord[] = [];
  loaded = false;
  /** 다시 열기가 폴더 고르기로 도는 이유 (시작 화면의 안내). 기억한 핸들을 바로 꺼내면 null */
  restoreNotice: string | null = null;
  readonly supported = supportsFolderPicker();
  readonly backend: FsAccessBackend;

  constructor(private readonly editor: Editor) {
    this.backend = editor.backend instanceof FsAccessBackend ? editor.backend : new FsAccessBackend();
    makeObservable(this, { records: observable.ref, loaded: observable, restoreNotice: observable });
    editor.events.on("projectOpened", () => {
      // 브라우저 폴더의 최근 목록은 IndexedDB 가 들고 있다. 설정 쪽 목록(브리지와 같은 저장소)에 키를 남기지 않는다
      const key = this.backend.openedRoot;
      for (const root of [key, SAMPLE_ROOT]) {
        if (root && editor.settings.settings.recentProjects.includes(root)) editor.settings.removeRecentProject(root);
      }
      void this.refresh();
    });
  }

  async refresh(): Promise<void> {
    const records = await this.backend.handles.list().catch(() => []);
    const notice = await this.backend.handles.restoreBlocker().catch(() => null);
    runInAction(() => {
      this.records = records;
      this.restoreNotice = notice;
      this.loaded = true;
    });
  }

  /** 폴더 열기. 클릭 처리기에서 바로 부른다 (대화상자는 사용자 제스처 안에서만 뜬다) */
  async openNew(): Promise<boolean> {
    let key: string | null;
    try {
      key = await this.backend.pickFolder();
    } catch (e) {
      this.fail("폴더를 열지 못했다", e);
      return false;
    }
    if (!key) return false;
    await this.refresh();
    return this.openKey(key);
  }

  /**
   * 기억한 폴더 다시 열기. 클릭 처리기에서 바로 부른다 (권한 묻기와 폴더 고르기는 사용자 제스처 안에서만 된다).
   * 핸들을 꺼낼 수 없는 곳이면 이유를 알리고 폴더 고르기로 연다
   */
  async reopen(record: FolderRecord): Promise<boolean> {
    const blocker = await this.backend.handles.restoreBlocker(record.key).catch(() => null);
    if (blocker) {
      this.editor.toasts.info(blocker);
      return this.openNew();
    }
    let handle;
    try {
      handle = await this.backend.handles.restore(record.key);
    } catch (e) {
      this.fail("기억한 폴더를 열지 못했다", e);
      return false;
    }
    if (!handle) {
      this.editor.toasts.warn(`${record.name} 폴더를 찾지 못했다. 폴더 열기로 다시 고른다`);
      return false;
    }
    const granted = await requestReadWrite(handle, true).catch(() => false);
    if (!granted) {
      this.editor.toasts.warn(`${record.name} 폴더에 읽고 쓸 권한을 받지 못했다`);
      return false;
    }
    return this.openKey(record.key);
  }

  async forget(key: string): Promise<void> {
    await this.backend.handles.forget(key).catch((e) => this.fail("목록에서 지우지 못했다", e));
    await this.refresh();
  }

  async forgetAll(): Promise<void> {
    for (const r of this.records) await this.backend.handles.forget(r.key).catch(() => {});
    await this.refresh();
  }

  /** 메모리의 샘플 프로젝트로 바꿔 연다. 폴더를 다시 열면 브라우저 폴더 백엔드로 돌아온다 */
  async openSample(): Promise<boolean> {
    if (!(await this.editor.replaceBackend(createMemoryBackend()))) return false;
    return this.editor.openProject(SAMPLE_ROOT);
  }

  private async openKey(key: string): Promise<boolean> {
    if (this.editor.backend !== this.backend && !(await this.editor.replaceBackend(this.backend))) return false;
    return this.editor.openProject(key);
  }

  private fail(what: string, e: unknown): void {
    const message = `${what}: ${(e as Error).message}`;
    this.editor.log.error("editor", message);
    this.editor.toasts.error(message);
  }
}

const instances = new WeakMap<Editor, BrowserFolders>();

/** 에디터 하나에 하나 */
export function browserFolders(editor: Editor): BrowserFolders {
  let folders = instances.get(editor);
  if (!folders) {
    folders = new BrowserFolders(editor);
    instances.set(editor, folders);
  }
  return folders;
}
