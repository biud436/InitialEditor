// 웹판의 폴더 다루기 (브라우저 폴더 모드). 시작 화면과 최근 프로젝트 메뉴가 쓴다.
//   폴더 열기(프로젝트 열기 커맨드, Ctrl+O 도 이것): 폴더를 고르고(showDirectoryPicker), 열린 프로젝트를 닫는다
//             (저장하지 않은 문서를 묻는다). 닫은 뒤에만 핸들을 IndexedDB 에 기억하고 연다. 기억한 핸들은 꺼내지 않는다
//   다시 열기: 일반 프로필이면 기억한 핸들을 꺼내 권한을 클릭 안에서 다시 묻고 연다. 시크릿 프로필일 수 있거나
//             지난번에 꺼내다 죽었으면 꺼내지 않고 이유를 한 줄 알린 뒤 폴더 고르기로 연다 (handleStore.ts)
//   샘플로 해 보기: 메모리 백엔드로 바꿔 샘플 프로젝트를 열고, 게임이 그리는 샘플 맵을 맵 뷰로 연 뒤 "칠하고 F5" 를 한 번 알린다
//   새 프로젝트: 폴더를 고르고(클릭 안에서) 열린 프로젝트를 닫는다. 대화상자에서 만들기를 누르면 기억하고 이 백엔드로 바꾼다
//             (pickNewProjectFolder, adopt). 템플릿 쓰기는 newProject.ts
// 최근 목록은 설정의 recentProjects 가 아니라 IndexedDB 의 기억한 폴더다 (키만으로는 이름을 모른다).

import { FsAccessBackend, requestReadWrite, supportsFolderPicker, type FolderRecord, type FsDirHandle } from "@initial-editor/backend-fsaccess";
import { makeObservable, observable, runInAction } from "mobx";
import { createMemoryBackend, SAMPLE_ROOT } from "./backends";
import type { Editor } from "./Editor";
import { RPG_SAMPLE_MAP_PATH } from "./rpgSample";
import { SAMPLE_MAP_PATH } from "./sampleProject";

export class BrowserFolders {
  /** 기억한 폴더 (최근 순) */
  records: FolderRecord[] = [];
  loaded = false;
  /** 다시 열기가 폴더 고르기로 도는 이유 (시작 화면의 안내). 기억한 핸들을 바로 꺼내면 null */
  restoreNotice: string | null = null;
  readonly supported = supportsFolderPicker();
  readonly backend: FsAccessBackend;

  constructor(
    private readonly editor: Editor,
    backend?: FsAccessBackend,
  ) {
    this.backend = backend ?? (editor.backend instanceof FsAccessBackend ? editor.backend : new FsAccessBackend());
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

  /**
   * 폴더 열기. 클릭 처리기에서 바로 부른다 (대화상자는 사용자 제스처 안에서만 뜬다).
   * 저장하지 않은 문서를 묻는 곳에서 취소하면 기억한 기록과 이 페이지의 핸들을 바꾸지 않는다
   */
  async openNew(): Promise<boolean> {
    let handle: FsDirHandle | null;
    try {
      handle = await this.backend.pickHandle();
    } catch (e) {
      this.fail("폴더 열기 실패", e);
      return false;
    }
    if (!handle) return false;
    if (!(await this.editor.closeProject())) return false;
    let key: string;
    try {
      key = (await this.backend.handles.remember(handle)).key;
    } catch (e) {
      this.fail("폴더 열기 실패", e);
      return false;
    }
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
      this.fail("최근 폴더 열기 실패", e);
      return false;
    }
    if (!handle) {
      this.editor.toasts.warn(`${record.name} 폴더 없음. 폴더 열기로 다시 선택`);
      return false;
    }
    const granted = await requestReadWrite(handle, true).catch(() => false);
    if (!granted) {
      this.editor.toasts.warn(`${record.name} 폴더의 읽기와 쓰기 권한 없음`);
      return false;
    }
    return this.openKey(record.key);
  }

  async forget(key: string): Promise<void> {
    await this.backend.handles.forget(key).catch((e) => this.fail("최근 폴더 목록에서 제거 실패", e));
    await this.refresh();
  }

  async forgetAll(): Promise<void> {
    for (const r of this.records) await this.backend.handles.forget(r.key).catch(() => {});
    await this.refresh();
  }

  /** 메모리의 샘플 프로젝트로 바꿔 연다. 폴더를 다시 열면 브라우저 폴더 백엔드로 돌아온다 */
  async openSample(): Promise<boolean> {
    if (!(await this.editor.replaceBackend(createMemoryBackend(pageSampleQuery())))) return false;
    if (!(await this.editor.openProject(SAMPLE_ROOT))) return false;
    await openSampleMap(this.editor);
    return true;
  }

  /**
   * 새 프로젝트의 폴더를 고른다. 클릭 처리기에서 바로 부른다 (대화상자는 사용자 제스처 안에서만 뜬다).
   * 고른 뒤 열린 프로젝트를 닫는다(저장하지 않은 문서를 묻는다). 기억하지는 않는다 (adopt). 취소면 null
   */
  async pickNewProjectFolder(): Promise<FsDirHandle | null> {
    let handle: FsDirHandle | null;
    try {
      handle = await this.backend.pickHandle();
    } catch (e) {
      this.fail("폴더 선택 실패", e);
      return null;
    }
    if (!handle) return null;
    if (!(await this.editor.closeProject())) return null;
    return handle;
  }

  /** 새 프로젝트를 만들 폴더를 기억하고 이 백엔드로 바꾼다. 돌려주는 키를 open 에 넘긴다. 못 하면 null */
  async adopt(handle: FsDirHandle): Promise<string | null> {
    let key: string;
    try {
      key = (await this.backend.handles.remember(handle)).key;
    } catch (e) {
      this.fail("최근 폴더 저장 실패", e);
      return null;
    }
    await this.refresh();
    if (this.editor.backend !== this.backend && !(await this.editor.replaceBackend(this.backend))) return null;
    return key;
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

/** 에디터 하나에 하나. backend 는 처음 만들 때만 쓴다 (테스트가 가짜 폴더를 넘긴다) */
export function browserFolders(editor: Editor, backend?: FsAccessBackend): BrowserFolders {
  let folders = instances.get(editor);
  if (!folders) {
    folders = new BrowserFolders(editor, backend);
    instances.set(editor, folders);
  }
  return folders;
}

/** 샘플 맵을 열었을 때 한 번 띄우는 안내 */
export const SAMPLE_MAP_HINT = "샘플 게임에서 렌더링하는 맵입니다. 팔레트에서 타일을 선택해 칠하고 저장한 뒤 F5를 눌러 실행하세요.";
export const RPG_SAMPLE_HINT = "RPG 데모 「떠나기 전에」의 항구 마을입니다. 타일을 칠하거나 이벤트를 편집하고 저장한 뒤 F5를 눌러 실행하세요.";

/** 페이지 주소의 ?sample= (메모리 샘플 고르기, backends.ts 의 sampleKind) */
export function pageSampleQuery(): string | null {
  return typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("sample");
}

const hinted = new WeakSet<object>();

/** 샘플 맵(RPG 데모면 항구 마을, 초원 샘플이면 meadow.json)을 맵 뷰로 열고, 이 페이지에서 처음이면 "칠하고 F5" 를 알린다 */
export async function openSampleMap(editor: Pick<Editor, "openPath" | "toasts" | "backend">): Promise<void> {
  const rpg = await editor.backend.exists(RPG_SAMPLE_MAP_PATH).catch(() => false);
  await editor.openPath(rpg ? RPG_SAMPLE_MAP_PATH : SAMPLE_MAP_PATH);
  if (hinted.has(editor)) return;
  hinted.add(editor);
  editor.toasts.show(rpg ? RPG_SAMPLE_HINT : SAMPLE_MAP_HINT, "info", 8000);
}
