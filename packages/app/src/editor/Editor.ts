// 에디터 하나. 코어의 모델(프로젝트, 문서, 커맨드, 메뉴, 확장, 로그, 설정)과 셸의 상태(토스트, 모달, 레이아웃, 테마)를
// 한 객체에 모은다. 컴포넌트는 useEditor() 로 이것을 받는다 (EditorContext.tsx).

import {
  CommandRegistry,
  type Document,
  DocumentRegistry,
  Emitter,
  ExtensionHost,
  ExtensionRegistries,
  extname,
  LogStore,
  MenuRegistry,
  Project,
  type SaveOutcome,
  SettingsStore,
  type Platform,
  type ProjectBackend,
  type ProjectInfo,
  type SettingsStorage,
} from "@initial-editor/core";
import { tilemapExtension } from "@initial-editor/ext-tilemap";
import { makeObservable, observable, runInAction } from "mobx";
import { matchMediaSource, ThemeController, type SystemThemeSource, type ThemeTarget } from "../theme/ThemeController";
import { registerAppCommands } from "./appCommands";
import { registerAppMenus } from "./appMenus";
import { installRunner } from "./runner";
import type { RunnerStore } from "./runner/RunnerStore";
import { installScriptSupport } from "./scripting";
import type { ScriptSupport } from "./scripting";
import { installSceneSupport } from "./sceneView";
import type { SceneSupport } from "./sceneView";
import { installMapSupport, type MapSupport } from "./maps";
import { installSceneTools } from "./scene";
import type { SceneTools } from "./scene";
import { installMapSchema, type MapSchemaStore } from "./maps/schemaStore";
import { MODE_LABELS, type BackendMode } from "./backends";
import { DocumentDock } from "./documentDock";
import { IMAGE_EXTENSIONS, ImagePreviewDocument } from "./documents/ImagePreviewDocument";
import { TEXT_EXTENSIONS, TextPreviewDocument } from "./documents/TextPreviewDocument";
import { WELCOME_KIND, WelcomeDocument } from "./documents/WelcomeDocument";
import { LayoutPersistence } from "./layoutPersistence";
import { LayoutStore } from "./layout";
import type { KeyValueStorage } from "./LocalStorageSettingsStorage";
import { ModalStore } from "./modals";
import { ProjectTreeModel } from "./projectTree";
import { installRecentProjectsMenu } from "./recentProjects";
import { modalSaveGuard } from "./SaveConflictDialog";
import { ToastStore } from "./toasts";

export interface EditorOptions {
  mode: BackendMode;
  backend: ProjectBackend;
  storage: SettingsStorage;
  platform: Platform;
  /** 레이아웃의 브라우저 저장소 (기본 localStorage) */
  local?: KeyValueStorage;
  themeTarget?: ThemeTarget;
  themeSource?: SystemThemeSource;
  bridgeUrl?: string;
  /** 시작하자마자 열 프로젝트 */
  autoOpenRoot?: string;
}

export const APP_VERSION: string = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";

export class Editor {
  readonly mode: BackendMode;
  readonly version = APP_VERSION;
  backend: ProjectBackend;
  project!: Project;
  tree!: ProjectTreeModel;
  bridgeUrl: string | undefined;

  readonly documents = new DocumentRegistry();
  readonly commands: CommandRegistry;
  readonly menus = new MenuRegistry();
  readonly registries = new ExtensionRegistries();
  readonly extensions: ExtensionHost;
  readonly log = new LogStore();
  readonly settings: SettingsStore;
  readonly toasts = new ToastStore();
  readonly modals = new ModalStore();
  readonly theme: ThemeController;
  readonly persistence: LayoutPersistence;
  readonly documentDock: DocumentDock;
  readonly layout: LayoutStore;
  /** 에디터 전역 이벤트. 저장 뒤 핫 리로드(runner)처럼 모듈끼리 느슨하게 잇는다 */
  readonly events = new Emitter<{ documentSaved: Document; documentReloaded: Document; projectOpened: ProjectInfo; projectClosed: void }>();
  /** E1: 엔진 실행기 (installRunner 가 붙인다) */
  runner!: RunnerStore;
  /** E1: 스크립트 편집 지원 (installScriptSupport 가 붙인다) */
  scripting!: ScriptSupport;
  /** E2: 씬 뷰 (installSceneSupport 가 붙인다: 씬 문서 열기와 PIXI 씬 뷰) */
  sceneSupport!: SceneSupport;
  /** E3: 맵 뷰 (installMapSupport 가 붙인다: 맵 문서 열기, PIXI 맵 뷰, 팔레트와 레이어 패널의 상태, 맵 커맨드) */
  mapSupport!: MapSupport;
  /** E2: 씬 도구 (installSceneTools 가 붙인다: 계층, 인스펙터, 씬 커맨드, 템플릿) */
  sceneTools!: SceneTools;
  /** E3: 맵 오브젝트 스키마 (installMapSchema가 붙인다: resources/schema/map-objects.json, 여기서 실행) */
  mapSchema!: MapSchemaStore;

  private readonly labelProviders = new Map<string, () => string>();
  private readonly hintProviders = new Map<string, () => string | undefined>();
  private readonly checkedProviders = new Map<string, () => boolean>();
  private projectDisposers: Array<() => void> = [];
  private disposers: Array<() => void> = [];
  /** 진행 중인 저장 (문서마다 하나) */
  private readonly saving = new Map<Document, Promise<SaveOutcome>>();
  private readonly autoOpenRoot: string | undefined;

  constructor(opts: EditorOptions) {
    this.mode = opts.mode;
    this.backend = opts.backend;
    this.bridgeUrl = opts.bridgeUrl;
    this.autoOpenRoot = opts.autoOpenRoot;
    this.commands = new CommandRegistry({ platform: opts.platform });
    this.extensions = new ExtensionHost({ commands: this.commands, menus: this.menus, registries: this.registries });
    this.settings = new SettingsStore(opts.storage);
    this.theme = new ThemeController(this.settings, opts.themeTarget ?? document.documentElement, opts.themeSource ?? matchMediaSource());
    this.persistence = new LayoutPersistence({
      local: opts.local ?? window.localStorage,
      project: () => this.project,
      warn: (m) => this.log.warn("editor", m),
    });
    this.documentDock = new DocumentDock({
      documents: this.documents,
      openPath: (path) => this.openPath(path),
      openWelcome: () => this.openWelcome(),
      canOpenPaths: () => this.project.isOpen,
    });
    this.layout = new LayoutStore({ persistence: this.persistence, documents: this.documentDock, warn: (m) => this.log.warn("editor", m) });
    makeObservable(this, { backend: observable.ref, project: observable.ref, tree: observable.ref, bridgeUrl: observable });
    this.setProject(new Project(opts.backend));
  }

  get platform(): Platform {
    return this.commands.context.platform;
  }

  get isBrowser(): boolean {
    return this.mode !== "tauri";
  }

  /** 설정을 읽고 커맨드와 메뉴와 확장을 등록한다. 렌더 전에 한 번 */
  async start(): Promise<void> {
    await this.settings.load();
    this.theme.start();
    registerAppCommands(this);
    registerAppMenus(this);
    this.disposers.push(installRecentProjectsMenu(this));
    installScriptSupport(this);
    installSceneSupport(this); // 스크립트 지원 뒤에: openPath 를 바깥에서 감싸 resources/scenes/*.json 을 먼저 가로챈다
    installMapSupport(this); // 가장 바깥에서 resources/maps/*.json 을 가로챈다
    installSceneTools(this);
    installRunner(this);
    installMapSchema(this);
    try {
      const ids = await this.extensions.activateAll([tilemapExtension]);
      this.log.info("editor", `확장 활성: ${ids.join(", ")}`);
    } catch (e) {
      this.log.error("editor", `확장 활성 실패: ${(e as Error).message}`);
    }
    this.openWelcome();
    this.log.info("editor", `InitialEditor ${this.version} 시작 (모드: ${MODE_LABELS[this.mode]}, 백엔드: ${this.backend.kind}, 플랫폼: ${this.platform})`);
    if (this.autoOpenRoot) void this.openProject(this.autoOpenRoot);
  }

  /**
   * 문서를 저장하고 documentSaved를 알린다 (저장 시 핫 리로드가 여기에 붙는다). 모든 저장이 여기를 지난다.
   * 파일이 밖에서 바뀌었거나 지워졌거나 다시 읽지 못했으면 모달로 묻는다 (03-project-and-runtime.md 파일 규칙 4).
   * 결과는 저장함, 다시 읽음, 취소 중 하나다. 같은 문서의 저장이 진행 중이면 그 결과를 함께 기다린다
   */
  saveDocument(doc: Document): Promise<SaveOutcome> {
    const running = this.saving.get(doc);
    if (running) return running;
    const task = this.runSave(doc).finally(() => this.saving.delete(doc));
    this.saving.set(doc, task);
    return task;
  }

  private async runSave(doc: Document): Promise<SaveOutcome> {
    const outcome = await doc.saveChecked(modalSaveGuard(this.modals, (path) => this.backend.readText(path)));
    if (outcome === "saved") this.events.emit("documentSaved", doc);
    else if (outcome === "reloaded") this.log.info("editor", `저장하지 않고 디스크 내용으로 다시 읽었다: ${doc.path ?? doc.title}`);
    else this.log.info("editor", `저장을 취소했다: ${doc.path ?? doc.title}`);
    return outcome;
  }

  /** 프로젝트를 연다. game.json 이 없으면 만들 것인지 묻는다 */
  async openProject(root: string): Promise<boolean> {
    if (this.project.isOpen) {
      if (!(await this.closeProject())) return false;
    }
    this.log.info("editor", `프로젝트 여는 중: ${root}`);
    let info;
    try {
      info = await this.project.open(root);
    } catch (e) {
      const message = (e as Error).message;
      this.log.error("editor", `프로젝트를 열지 못했다: ${message}`);
      this.toasts.error(`프로젝트를 열지 못했다: ${message}`);
      return false;
    }
    if (this.mode !== "memory") this.settings.addRecentProject(root);
    this.log.info("editor", `프로젝트 열림: ${info.root} (game.json ${info.hasGameJson ? "있음" : "없음"})`);
    if (!info.hasGameJson) {
      const ok = await this.modals.confirm({
        title: "프로젝트 등록",
        message: "이 폴더를 프로젝트로 등록할까요? game.json 을 만듭니다",
        okLabel: "만들기",
        cancelLabel: "나중에",
      });
      if (ok) {
        try {
          await this.project.saveGameJson({ ...this.project.gameJson, name: info.name });
          this.log.info("editor", "game.json 을 만들었다");
        } catch (e) {
          this.log.error("editor", `game.json 을 만들지 못했다: ${(e as Error).message}`);
          this.toasts.error(`game.json 을 만들지 못했다: ${(e as Error).message}`);
        }
      }
    }
    await this.layout.restore();
    this.events.emit("projectOpened", info);
    return true;
  }

  /** 프로젝트를 닫는다. 저장 안 된 문서가 있으면 묻는다. 취소면 false */
  async closeProject(): Promise<boolean> {
    if (!this.project.isOpen) return true;
    const dirty = this.documents.dirtyDocuments.length;
    if (dirty > 0) {
      const ok = await this.modals.confirm({
        title: "프로젝트 닫기",
        message: `저장하지 않은 문서가 ${dirty}개 있다. 저장하지 않고 닫을까?`,
        okLabel: "닫기",
        danger: true,
      });
      if (!ok) return false;
    }
    await this.layout.flush();
    for (const doc of [...this.documents.documents]) {
      if (doc.kind !== WELCOME_KIND) this.documents.close(doc);
    }
    const root = this.project.root;
    await this.project.close();
    this.events.emit("projectClosed", undefined);
    this.log.info("editor", `프로젝트를 닫았다: ${root}`);
    this.openWelcome();
    return true;
  }

  /** 백엔드를 바꾼다 (브라우저 모드에서 다른 브리지 URL 로) */
  async replaceBackend(backend: ProjectBackend, bridgeUrl?: string): Promise<boolean> {
    if (!(await this.closeProject())) return false;
    await this.backend.close().catch(() => {});
    runInAction(() => {
      this.backend = backend;
      this.bridgeUrl = bridgeUrl;
    });
    this.setProject(new Project(backend));
    this.log.info("editor", `백엔드 교체: ${backend.kind}${bridgeUrl ? ` (${bridgeUrl})` : ""}`);
    return true;
  }

  openWelcome(): void {
    const existing = this.documents.documents.find((d) => d.kind === WELCOME_KIND);
    if (existing) {
      this.documents.activate(existing);
      return;
    }
    this.documents.open(new WelcomeDocument());
  }

  /** 프로젝트 패널의 더블클릭. 확장자에 따라 미리보기 문서를 연다 */
  async openPath(path: string): Promise<void> {
    const existing = this.documents.findByPath(path);
    if (existing) {
      this.documents.activate(existing);
      return;
    }
    const ext = extname(path);
    const asset = this.registries.assetTypeFor(ext);
    if (asset?.open) {
      await asset.open(path);
      return;
    }
    let doc: TextPreviewDocument | ImagePreviewDocument;
    if (TEXT_EXTENSIONS.has(ext)) doc = new TextPreviewDocument(this.backend, path);
    else if (IMAGE_EXTENSIONS.has(ext)) doc = new ImagePreviewDocument(this.backend, path);
    else {
      this.toasts.info("미리보기가 없는 파일이다");
      return;
    }
    this.documents.open(doc);
    try {
      await doc.load();
    } catch (e) {
      const message = `${path} 을(를) 읽지 못했다: ${(e as Error).message}`;
      this.log.error("editor", message);
      this.toasts.error(message);
      this.documents.close(doc);
    }
  }

  /** 메뉴에 보일 라벨. 되돌리기처럼 동적인 것은 provider 가 준다 */
  commandLabel(id: string): string {
    return this.labelProviders.get(id)?.() ?? this.commands.get(id)?.label ?? id;
  }

  /** 비활성 이유 (툴팁) */
  commandHint(id: string): string | undefined {
    return this.hintProviders.get(id)?.();
  }

  commandChecked(id: string): boolean {
    return this.checkedProviders.get(id)?.() ?? false;
  }

  setLabelProvider(id: string, fn: () => string): void {
    this.labelProviders.set(id, fn);
  }

  setHint(id: string, fn: () => string | undefined): void {
    this.hintProviders.set(id, fn);
  }

  setChecked(id: string, fn: () => boolean): void {
    this.checkedProviders.set(id, fn);
  }

  private setProject(project: Project): void {
    for (const d of this.projectDisposers) d();
    this.projectDisposers = [];
    this.tree?.dispose();
    runInAction(() => {
      this.project = project;
      this.tree = new ProjectTreeModel(project);
    });
    this.projectDisposers.push(
      project.events.on("change", (e) => {
        const doc = this.documents.findByPath(e.path);
        if (!doc || e.origin === "self") return;
        if (e.kind === "delete") {
          runInAction(() => (doc.externallyChanged = true));
          return;
        }
        if (!doc.dirty) {
          // 실패하면 reloadFromDisk가 배너를 띄우고 저장을 막는다
          doc.reloadFromDisk().then(
            () => {
              this.log.info("editor", `밖에서 바뀌어 다시 읽었다: ${e.path}`);
              this.events.emit("documentReloaded", doc);
            },
            (err: Error) => {
              const message = `${e.path} 을(를) 다시 읽지 못했다: ${err.message}`;
              this.log.warn("editor", message);
              this.toasts.error(message);
            },
          );
        } else {
          runInAction(() => (doc.externallyChanged = true));
          this.log.warn("editor", `밖에서 바뀌었지만 수정 중이라 두었다: ${e.path}`);
        }
      }),
    );
  }

  dispose(): void {
    for (const d of this.disposers) d();
    for (const d of this.projectDisposers) d();
    this.tree?.dispose();
    this.layout.dispose();
    this.theme.dispose();
  }
}
