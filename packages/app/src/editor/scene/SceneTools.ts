// E2 씬 도구의 상태 (Editor.sceneTools). 계층과 인스펙터와 씬 커맨드가 같은 것을 본다.
//   - activeScene: 활성 탭의 씬 문서 (아니면 null)
//   - clipboard: 복사한 오브젝트 (앱 안의 클립보드)
//   - assets: 인스펙터가 고르는 프로젝트 파일 목록 (그림, 폰트, 컴포넌트)
//   - 오브젝트 추가, 삭제, 복제, 복사, 붙여넣기, 이름 바꾸기, 순서, 스크립트 붙이기. 전부 document.apply(명령) 으로 간다
//     (docs/plans/e2-scene.md 마일스톤 5). 여러 오브젝트를 다루는 것은 compoundCommand 로 되돌리기 한 단계다.
// Editor 전체가 아니라 SceneToolsHost 만 보므로 Node 로 테스트한다 (SceneTools.test.ts).

import {
  cloneObject,
  deepClone,
  emptyScene,
  makeObject,
  SceneDocument,
  SCENES_DIR,
  sceneNameFromPath,
  scenePathFor,
  scriptPathFor,
  serializeScene,
  uniqueObjectId,
  type Command,
  type DocumentRegistry,
  type ExtensionRegistries,
  type LogStore,
  type ObjectTypeSpec,
  type Project,
  type ProjectBackend,
  type ProjectScope,
  type SceneObject,
} from "@initial-editor/core";
import { computed, makeObservable, observable, reaction, runInAction } from "mobx";
import { compoundCommand } from "./commands";
import { ProjectAssets } from "./projectAssets";

export const PASTE_OFFSET = 16;
const LOG = "editor";

export interface SceneToolsHost {
  readonly documents: DocumentRegistry;
  readonly registries: ExtensionRegistries;
  readonly backend: ProjectBackend;
  readonly project: Project;
  readonly log: LogStore;
  readonly toasts: { info(text: string): unknown; success(text: string): unknown; warn(text: string): unknown; error(text: string): unknown };
  readonly modals: { prompt(options: { title: string; label?: string; placeholder?: string; okLabel?: string; validate?: (v: string) => string | null }): Promise<string | null> };
  readonly tree: { reveal(path: string): Promise<void>; readonly filter?: { readonly scope: ProjectScope } };
  readonly events: { on(event: "projectOpened" | "projectClosed", listener: () => void): () => void };
  openPath(path: string): Promise<void>;
  /** 씬 뷰가 있으면 카메라 중심을 준다 (없으면 0, 0). 모양은 씬 뷰가 정하므로 느슨하게 본다 */
  readonly sceneSupport?: unknown;
}

/** 씬 이름 검사: 파일 이름이 되는 글자만 */
export function validateSceneName(value: string): string | null {
  const v = value.trim();
  if (!v) return "이름 비어 있음";
  if (/\.json$/i.test(v)) return "확장자 불필요 (.json 자동 추가)";
  if (!/^[\p{L}\p{N}_-]+$/u.test(v)) return "문자, 숫자, _, - 만 허용 (폴더 경로 불가)";
  return null;
}

/** 씬 파일의 논리 스크립트 이름 검사 (components/bird 꼴) */
export function validateLogicalScriptName(value: string): string | null {
  const v = value.trim();
  if (!v) return "이름 비어 있음";
  if (/\\/.test(v)) return "폴더 구분자는 / 만 허용 (\\ 불가)";
  if (/\.(lua|rb)$/i.test(v)) return "확장자 불필요 (언어에 따라 .lua 또는 .rb 자동 추가)";
  if (v.startsWith("/") || v.includes("..")) return "루트 기준 상대 경로여야 함 (/ 로 시작하거나 .. 포함 불가)";
  if (v.split("/").some((seg) => seg === "" || seg === ".")) return "비어 있거나 . 인 경로 구성 요소 포함";
  if (!/^[A-Za-z0-9_\-./]+$/.test(v)) return "영문, 숫자, _, -, / 만 허용";
  return null;
}

export class SceneTools {
  clipboard: SceneObject[] = [];
  readonly assets: ProjectAssets;
  private pasteCount = 0;
  private disposers: Array<() => void> = [];
  private validateDisposer: (() => void) | null = null;

  constructor(private readonly host: SceneToolsHost) {
    this.assets = new ProjectAssets({ backend: () => host.backend, isOpen: () => host.project.isOpen, scope: () => host.tree.filter?.scope });
    makeObservable(this, { clipboard: observable.ref, activeScene: computed, selectedObjects: computed });
  }

  install(): void {
    const host = this.host;
    this.disposers.push(
      host.events.on("projectOpened", () => {
        void this.assets.refresh();
        this.watchProject();
      }),
      host.events.on("projectClosed", () => {
        this.assets.clear();
        this.unwatchProject();
      }),
      // 무시 파일을 다시 읽어 범위가 바뀌면 자산 목록도 다시 훑는다
      reaction(
        () => host.tree.filter?.scope,
        () => {
          if (host.project.isOpen) this.assets.schedule();
        },
      ),
      // 되돌리기와 다시 실행과 씬 뷰의 변경도 검사 결과에 반영되게 활성 씬의 되돌리기 스택을 따라간다
      reaction(
        () => this.activeScene,
        (doc) => {
          this.validateDisposer?.();
          this.validateDisposer = doc ? doc.undo.events.on("change", () => doc.revalidate()) : null;
        },
        { fireImmediately: true },
      ),
    );
    if (host.project.isOpen) {
      void this.assets.refresh();
      this.watchProject();
    }
  }

  private projectUnwatch: (() => void) | null = null;

  private watchProject(): void {
    this.unwatchProject();
    this.projectUnwatch = this.host.project.events.on("change", (e) => this.assets.changed(e.path));
  }

  private unwatchProject(): void {
    this.projectUnwatch?.();
    this.projectUnwatch = null;
  }

  dispose(): void {
    this.unwatchProject();
    this.validateDisposer?.();
    this.validateDisposer = null;
    for (const d of this.disposers.reverse()) d();
    this.disposers = [];
    this.assets.dispose();
  }

  // ---- 상태 ----

  get activeScene(): SceneDocument | null {
    const active = this.host.documents.active;
    return active instanceof SceneDocument ? active : null;
  }

  get selectedObjects(): SceneObject[] {
    const doc = this.activeScene;
    if (!doc) return [];
    return doc.scene.objects.filter((o) => doc.selection.has(o.id));
  }

  /** 활성 씬의 이름 (파일 이름). 씬 탭이 아니면 null */
  get activeSceneName(): string | null {
    const doc = this.activeScene;
    return doc?.path ? sceneNameFromPath(doc.path) : null;
  }

  typeSpec(type: string): ObjectTypeSpec | undefined {
    return this.host.registries.objectTypes.get(type);
  }

  typeLabel(type: string): string {
    return this.typeSpec(type)?.label ?? type;
  }

  /** 등록된 타입 전부 (코어 먼저, 그다음 등록 순) */
  objectTypes(): ObjectTypeSpec[] {
    return [...this.host.registries.objectTypes.values()];
  }

  /** 새 오브젝트를 놓을 자리: 씬 뷰의 카메라 중심, 없으면 0, 0 */
  spawnPoint(): { x: number; y: number } {
    const support = this.host.sceneSupport as { view?: { center?: unknown }; center?: unknown } | undefined;
    // 메서드는 제 객체에 묶어 부른다 (SceneSupport.center 는 this.rendererFor 를 쓴다)
    const owner: object | undefined = support?.view?.center !== undefined ? support.view : support;
    const candidate = support?.view?.center ?? support?.center;
    const center = typeof candidate === "function" ? (candidate as () => unknown).call(owner) : candidate;
    if (center && typeof center === "object") {
      const c = center as { x?: unknown; y?: unknown };
      if (typeof c.x === "number" && typeof c.y === "number" && Number.isFinite(c.x) && Number.isFinite(c.y)) return { x: Math.round(c.x), y: Math.round(c.y) };
    }
    return { x: 0, y: 0 };
  }

  /** 명령을 적용하고 검사 결과를 갱신한다 */
  apply(doc: SceneDocument, cmd: Command): void {
    doc.apply(cmd);
    doc.revalidate();
  }

  // ---- 오브젝트 ----

  addObject(type: string, at?: { x: number; y: number }): SceneObject | null {
    const doc = this.activeScene;
    if (!doc) {
      this.host.toasts.warn("활성 씬 탭 없음: 오브젝트 추가 불가");
      return null;
    }
    const spec = this.typeSpec(type);
    if (!spec) {
      this.host.toasts.error(`등록되지 않은 오브젝트 타입: ${type}`);
      return null;
    }
    const id = uniqueObjectId(type, doc.scene.ids());
    const p = at ?? this.spawnPoint();
    const obj = makeObject(type, id, deepClone(spec.defaults), { x: p.x, y: p.y });
    this.apply(doc, doc.scene.addObject(obj));
    doc.select([id]);
    this.host.log.info(LOG, `오브젝트 추가됨: ${id} (${spec.label}), 위치 ${p.x}, ${p.y}`);
    return doc.scene.find(id) ?? null;
  }

  /** 선택한 오브젝트를 지운다. 지운 수 */
  deleteSelected(): number {
    const doc = this.activeScene;
    if (!doc) return 0;
    const ids = doc.selectedIds;
    if (ids.length === 0) return 0;
    // 뒤에서부터 지워야 앞의 색인이 흔들리지 않는다
    const ordered = [...ids].sort((a, b) => doc.scene.indexOf(b) - doc.scene.indexOf(a));
    const cmd = ordered.length === 1 ? doc.scene.removeObject(ordered[0]) : compoundCommand(`오브젝트 ${ordered.length}개 삭제`, ordered.map((id) => doc.scene.removeObject(id)));
    this.apply(doc, cmd);
    doc.clearSelection();
    return ids.length;
  }

  /** 선택한 오브젝트를 바로 뒤에 복제한다 (+16px). 새 id 목록 */
  duplicateSelected(): string[] {
    const doc = this.activeScene;
    if (!doc) return [];
    const ids = doc.selectedIds;
    if (ids.length === 0) return [];
    const taken = new Set(doc.scene.ids());
    // 원본 바로 뒤에 끼운다. 뒤의 것부터 끼워야 앞의 색인이 그대로다
    const sources = [...ids].sort((a, b) => doc.scene.indexOf(b) - doc.scene.indexOf(a));
    const commands: Command[] = [];
    const created: string[] = [];
    for (const id of sources) {
      const o = doc.scene.find(id)!;
      const newId = uniqueObjectId(id, taken);
      taken.add(newId);
      const copy = { ...cloneObject(o), id: newId, x: o.x + PASTE_OFFSET, y: o.y + PASTE_OFFSET, props: deepClone(o.props), extra: deepClone(o.extra) };
      commands.push(doc.scene.addObject(copy, doc.scene.indexOf(id) + 1));
      created.push(newId);
    }
    created.reverse();
    const cmd = commands.length === 1 ? { ...commands[0], label: `복제: ${created[0]}` } : compoundCommand(`오브젝트 ${created.length}개 복제`, commands);
    this.apply(doc, cmd);
    doc.select(created);
    return created;
  }

  copy(): number {
    const objects = this.selectedObjects;
    if (objects.length === 0) return 0;
    runInAction(() => {
      this.clipboard = objects.map((o) => ({ ...cloneObject(o), props: deepClone(o.props), extra: deepClone(o.extra) }));
      this.pasteCount = 0;
    });
    return objects.length;
  }

  cut(): number {
    const n = this.copy();
    if (n > 0) this.deleteSelected();
    return n;
  }

  /** 클립보드의 오브젝트를 새 id 로 맨 뒤에 붙인다. 붙일 때마다 16px 씩 더 밀린다 */
  paste(): string[] {
    const doc = this.activeScene;
    if (!doc || this.clipboard.length === 0) return [];
    this.pasteCount += 1;
    const offset = PASTE_OFFSET * this.pasteCount;
    const taken = new Set(doc.scene.ids());
    const commands: Command[] = [];
    const created: string[] = [];
    for (const o of this.clipboard) {
      const newId = uniqueObjectId(o.id, taken);
      taken.add(newId);
      const copy = { ...cloneObject(o), id: newId, x: o.x + offset, y: o.y + offset, props: deepClone(o.props), extra: deepClone(o.extra) };
      commands.push(doc.scene.addObject(copy));
      created.push(newId);
    }
    const cmd = commands.length === 1 ? { ...commands[0], label: `붙여넣기: ${created[0]}` } : compoundCommand(`오브젝트 ${created.length}개 붙여넣기`, commands);
    this.apply(doc, cmd);
    doc.select(created);
    return created;
  }

  /** 이름 바꾸기. 겹치거나 비었으면 토스트로 알리고 false */
  rename(id: string, newId: string): boolean {
    const doc = this.activeScene;
    if (!doc) return false;
    const next = newId.trim();
    if (next === id) return true;
    if (next === "") {
      this.host.toasts.warn("id 비어 있음");
      return false;
    }
    if (doc.scene.find(next)) {
      this.host.toasts.warn(`이미 있는 id: ${next}`);
      return false;
    }
    const selected = doc.selection.has(id);
    this.apply(doc, doc.scene.renameObject(id, next));
    if (selected) {
      runInAction(() => {
        doc.selection.delete(id);
        doc.selection.add(next);
      });
    }
    return true;
  }

  setVisible(id: string, visible: boolean): void {
    const doc = this.activeScene;
    if (!doc || !doc.scene.find(id)) return;
    this.apply(doc, doc.scene.setField(id, "visible", visible));
  }

  reorder(from: number, to: number): void {
    const doc = this.activeScene;
    if (!doc) return;
    const n = doc.scene.objects.length;
    if (from === to || from < 0 || to < 0 || from >= n || to >= n) return;
    this.apply(doc, doc.scene.reorder(from, to));
  }

  /** 맨 앞으로 (가장 위에 그린다 = 목록 끝) */
  bringToFront(id: string): void {
    const doc = this.activeScene;
    if (!doc) return;
    this.reorder(doc.scene.indexOf(id), doc.scene.objects.length - 1);
  }

  /** 맨 뒤로 (가장 아래에 그린다 = 목록 처음) */
  sendToBack(id: string): void {
    const doc = this.activeScene;
    if (!doc) return;
    this.reorder(doc.scene.indexOf(id), 0);
  }

  attachScript(id: string, logicalName: string): boolean {
    const doc = this.activeScene;
    const o = doc?.scene.find(id);
    if (!doc || !o) return false;
    if (o.scripts.includes(logicalName)) {
      this.host.toasts.info(`이미 추가된 스크립트: ${logicalName}`);
      return false;
    }
    this.apply(doc, doc.scene.attachScript(id, logicalName));
    return true;
  }

  detachScript(id: string, logicalName: string): void {
    const doc = this.activeScene;
    if (!doc || !doc.scene.find(id)) return;
    this.apply(doc, doc.scene.detachScript(id, logicalName));
  }

  /** 논리 이름의 스크립트 파일 경로 (game.json 의 언어로) */
  scriptPath(logicalName: string): string {
    return scriptPathFor(logicalName, this.host.project.gameJson.script);
  }

  // ---- 씬 파일 ----

  /** 씬 문서를 연다. 씬 뷰가 openPath 로 씬 문서를 열면 그것을, 아니면 여기서 직접 SceneDocument 를 연다 */
  async openScene(path: string): Promise<SceneDocument | null> {
    const host = this.host;
    const existing = host.documents.findByPath(path);
    if (existing instanceof SceneDocument) {
      host.documents.activate(existing);
      return existing;
    }
    await host.openPath(path);
    const opened = host.documents.findByPath(path);
    if (opened instanceof SceneDocument) return opened;
    if (opened) host.documents.close(opened);
    try {
      const doc = await SceneDocument.open(host.backend, path, () => new Set(host.registries.objectTypes.keys()), () => host.registries.validators);
      host.documents.open(doc);
      return doc;
    } catch (e) {
      const message = `${path} 열기 실패: ${(e as Error).message}`;
      host.log.error(LOG, message);
      host.toasts.error(message);
      return null;
    }
  }

  /** 새 씬: 이름을 묻고 빈 씬을 resources/scenes/<이름>.json 에 쓰고 연다 */
  async newScene(): Promise<SceneDocument | null> {
    const host = this.host;
    if (!host.project.isOpen) {
      host.toasts.warn("열린 프로젝트 없음");
      return null;
    }
    const name = await host.modals.prompt({ title: "새 씬", label: `생성 경로: ${SCENES_DIR}/<이름>.json`, placeholder: "stage1", okLabel: "만들기", validate: validateSceneName });
    if (!name) return null;
    return this.createScene(name.trim());
  }

  async createScene(name: string): Promise<SceneDocument | null> {
    const host = this.host;
    const path = scenePathFor(name);
    try {
      if (await host.backend.exists(path)) {
        host.toasts.warn(`이미 있는 파일: ${path}`);
        return null;
      }
      await host.backend.writeText(path, serializeScene(emptyScene(name)));
      await host.project.refresh("").catch(() => {});
      await host.project.refresh("resources").catch(() => {});
      await host.project.refresh(SCENES_DIR).catch(() => {});
      await host.tree.reveal(path);
      host.log.info(LOG, `씬 생성됨: ${path}`);
    } catch (e) {
      const message = `씬 생성 실패: ${(e as Error).message}`;
      host.log.error(LOG, message);
      host.toasts.error(message);
      return null;
    }
    return this.openScene(path);
  }

  /** 활성 씬을 game.json 의 startScene 으로 */
  async setStartScene(): Promise<boolean> {
    const host = this.host;
    const name = this.activeSceneName;
    if (!name || !host.project.isOpen) return false;
    try {
      await host.project.saveGameJson({ ...host.project.gameJson, startScene: name });
      host.log.info(LOG, `시작 씬: ${name}`);
      host.toasts.success(`시작 씬으로 지정됨: ${name}`);
      return true;
    } catch (e) {
      host.toasts.error(`game.json 저장 실패: ${(e as Error).message}`);
      return false;
    }
  }

  isStartScene(): boolean {
    const name = this.activeSceneName;
    return name !== null && this.host.project.gameJson.startScene === name;
  }
}
