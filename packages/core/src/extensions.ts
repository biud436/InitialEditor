// 확장 API (docs/plans/04-extensions-and-tilemap.md 2절).
//
// 확장은 activate(api) 하나를 내보낸다. 코어는 등록된 것을 레지스트리에 모으고, 셸(app)이 그것을
// 메뉴와 패널과 인스펙터로 그린다. UI 컴포넌트의 타입은 코어가 모르므로 unknown 이다 (app 이 React
// 컴포넌트로 좁혀 쓴다). 확장이 문서를 고치는 길은 document.apply(cmd) 뿐이다.
//
// 확장끼리: activate 가 돌려준 값이 그 확장의 내보내기다. dependsOn 에 적은 확장의 것만 api.exportsOf 로 받는다
// (docs/plans/e5-rpg.md 2.1). 확장이 프로젝트와 문서를 보는 길은 api.workspace 의 읽기 전용 손잡이다.

import { action, makeObservable, observable, runInAction } from "mobx";
import type { ChangeEvent, ProjectBackend } from "./backend";
import { CommandRegistry, type EditorCommand } from "./commands";
import { DocumentRegistry } from "./document";
import { Disposables, Emitter } from "./events";
import type { LogSource } from "./log";
import { MenuRegistry, type MenuItemSpec } from "./menus";

/** 코어가 모르는 UI 컴포넌트 (app 에서는 React.ComponentType) */
export type UiComponent = unknown;

export interface ObjectTypeSpec {
  /** 씬 파일의 "type" 값. 코어 타입은 node, sprite, text */
  type: string;
  label: string;
  icon?: string;
  /** 새 오브젝트의 기본 props */
  defaults: Record<string, unknown>;
  /** 인스펙터에 그릴 컴포넌트 (props 편집) */
  Inspector?: UiComponent;
  /** 씬 뷰 노드를 만드는 함수. 반환 타입은 씬 뷰(E2)가 정한다 */
  createSceneNode?: (object: unknown, ctx: unknown) => unknown;
  /** 런타임 짝. 예: "scripts/lua/scene_types/tilemap.lua". 검증과 문서에 쓴다 */
  runtime?: { lua?: string; ruby?: string };
}

export interface AssetTypeSpec {
  id: string;
  label: string;
  /** 소문자, 점 없이. 예: ["png", "jpg"] */
  extensions: string[];
  /** 프로젝트 패널에서 더블클릭했을 때 */
  open?: (path: string) => void | Promise<void>;
  Preview?: UiComponent;
  icon?: string;
}

export type DockPosition = "left" | "right" | "bottom" | "center";

export interface PanelSpec {
  id: string;
  title: string;
  Component: UiComponent;
  defaultDock?: DockPosition;
  icon?: string;
  /** 이 패널을 넣을 레이아웃 프리셋 이름 (앱의 scene, script, tilemap). 없으면 창 메뉴로만 연다 */
  presets?: string[];
  /**
   * 거짓이면 이 프로젝트에 해당하지 않는 패널이다: 창 메뉴와 확장 패널 목록에 보이지 않고 프리셋도 열지 않으며, 되살린 레이아웃에서 뺀다.
   * undefined 는 아직 모른다 (확장이 프로젝트를 읽는 중): 메뉴와 프리셋은 보이지 않는 것처럼 다루고, 되살린 레이아웃은 답이 날 때까지 패널을 둔다.
   * 생략하면 늘 보인다. 관찰 가능해야 메뉴와 레이아웃이 따라온다
   */
  visible?(): boolean | undefined;
}

export interface ToolSpec {
  id: string;
  label: string;
  icon?: string;
  /** 이 오브젝트 타입이 선택됐을 때만 활성. 비우면 늘 */
  appliesTo?: string[];
  shortcut?: string;
}

export interface ValidationProblem {
  /** "error" 는 저장을 막지 않지만 "문제" 탭에 강조된다 */
  severity: "error" | "warning";
  message: string;
  /** 어느 파일 */
  path?: string;
  /** 파일 안 위치. 엔진과 같은 표기 (events[2].commands[3]) 또는 줄 번호 */
  location?: string;
}

export type Validator = (document: unknown) => ValidationProblem[] | Promise<ValidationProblem[]>;

export interface TransferSpec {
  id: string;
  label: string;
  extensions?: string[];
  run: () => void | Promise<void>;
}

/** 작업 공간의 프로젝트 (읽기 전용) */
export interface WorkspaceProject {
  readonly isOpen: boolean;
  /** 열린 프로젝트의 루트. 닫혀 있으면 "" */
  readonly root: string;
  /** 프로젝트가 열렸다 (레이아웃을 되살린 뒤) */
  onOpened(listener: () => void): () => void;
  onClosed(listener: () => void): () => void;
  /** 프로젝트 파일이 바뀌었다 (에디터의 저장이든 밖의 편집이든) */
  onFileChange(listener: (e: ChangeEvent) => void): () => void;
}

export interface WorkspaceLog {
  info(source: LogSource, text: string): void;
  warn(source: LogSource, text: string): void;
  error(source: LogSource, text: string): void;
}

export interface WorkspaceToasts {
  info(text: string): unknown;
  success(text: string): unknown;
  warn(text: string): unknown;
  error(text: string): unknown;
}

/** 확장이 보는 에디터: 백엔드, 열린 프로젝트, 열린 문서, 콘솔, 토스트. 앱이 ExtensionHostDeps.workspace 로 넘긴다 */
export interface Workspace {
  /** 지금 백엔드 (브라우저 모드에서 백엔드를 바꾸면 달라진다) */
  backend(): ProjectBackend;
  readonly project: WorkspaceProject;
  readonly documents: DocumentRegistry;
  readonly log: WorkspaceLog;
  readonly toasts: WorkspaceToasts;
  /** 프로젝트 파일을 에디터처럼 연다 (맵이면 맵 탭, 이미 열려 있으면 그 탭으로) */
  openPath(path: string): Promise<void>;
}

/** 프로젝트도 백엔드도 없는 작업 공간. 앱 밖(테스트)에서 호스트를 만들 때 쓴다 */
export function detachedWorkspace(): Workspace {
  const none = () => () => {};
  const quiet = { info: () => {}, success: () => {}, warn: () => {}, error: () => {} };
  return {
    backend: () => {
      throw new Error("작업 공간에 백엔드가 없다");
    },
    project: { isOpen: false, root: "", onOpened: none, onClosed: none, onFileChange: none },
    documents: new DocumentRegistry(),
    log: quiet,
    toasts: quiet,
    openPath: async (path) => {
      throw new Error(`작업 공간에 열 프로젝트가 없다: ${path}`);
    },
  };
}

export interface ExtensionApi {
  /** 작업 공간 (읽기 전용) */
  readonly workspace: Workspace;
  /** dependsOn 에 적은 확장이 activate 에서 돌려준 값. 적지 않은 확장이면 오류 */
  exportsOf<T = unknown>(extensionId: string): T;
  /** 확장을 해제할 때 부를 정리 (구독 끊기 등). 돌려준 함수로 먼저 부를 수 있다 */
  onDeactivate(dispose: () => void): () => void;
  registerObjectType(spec: ObjectTypeSpec): () => void;
  registerAssetType(spec: AssetTypeSpec): () => void;
  registerPanel(spec: PanelSpec): () => void;
  registerTool(spec: ToolSpec): () => void;
  registerCommand(cmd: EditorCommand): () => void;
  registerMenu(spec: MenuItemSpec): () => void;
  registerValidator(fn: Validator): () => void;
  registerImporter(spec: TransferSpec): () => void;
  registerExporter(spec: TransferSpec): () => void;
}

export interface Extension {
  id: string;
  name: string;
  /** 먼저 활성화되어야 하는 확장 id. 여기 적은 확장의 내보내기만 받는다 */
  dependsOn?: string[];
  /** 돌려준 값이 이 확장의 내보내기다 (없으면 undefined) */
  activate(api: ExtensionApi): unknown;
  deactivate?(): void | Promise<void>;
}

export class ExtensionRegistries {
  readonly objectTypes = observable.map<string, ObjectTypeSpec>({}, { deep: false });
  readonly assetTypes = observable.map<string, AssetTypeSpec>({}, { deep: false });
  readonly panels = observable.map<string, PanelSpec>({}, { deep: false });
  readonly tools = observable.map<string, ToolSpec>({}, { deep: false });
  readonly validators = observable.array<Validator>([], { deep: false });
  readonly importers = observable.map<string, TransferSpec>({}, { deep: false });
  readonly exporters = observable.map<string, TransferSpec>({}, { deep: false });

  assetTypeFor(ext: string): AssetTypeSpec | undefined {
    const e = ext.toLowerCase();
    for (const spec of this.assetTypes.values()) {
      if (spec.extensions.includes(e)) return spec;
    }
    return undefined;
  }
}

function putUnique<T>(map: Map<string, T>, key: string, value: T, what: string): () => void {
  if (map.has(key)) throw new Error(`${what}이(가) 이미 있다: ${key}`);
  runInAction(() => map.set(key, value));
  return action(() => {
    if (map.get(key) === value) map.delete(key);
  });
}

export interface ExtensionHostDeps {
  commands: CommandRegistry;
  menus: MenuRegistry;
  registries: ExtensionRegistries;
  /** 확장에게 줄 작업 공간. 없으면 detachedWorkspace() */
  workspace?: Workspace;
}

interface ActiveExtension {
  extension: Extension;
  disposables: Disposables;
  /** activate 가 돌려준 값 */
  exports: unknown;
}

/** 확장을 의존 순서로 활성화하고, 해제할 때 등록한 것을 전부 거둔다 */
export class ExtensionHost {
  readonly active = new Map<string, ActiveExtension>();
  readonly workspace: Workspace;
  readonly events = new Emitter<{ activated: string; deactivated: string }>();

  constructor(private readonly deps: ExtensionHostDeps) {
    this.workspace = deps.workspace ?? detachedWorkspace();
    makeObservable(this, { active: observable.shallow });
  }

  /** 활성 확장의 내보내기 (앱이 쓴다). 활성이 아니면 undefined */
  exportsOf<T = unknown>(extensionId: string): T | undefined {
    return this.active.get(extensionId)?.exports as T | undefined;
  }

  apiFor(extensionId: string): ExtensionApi {
    const entry = this.active.get(extensionId);
    if (!entry) throw new Error(`활성 확장이 아니다: ${extensionId}`);
    const d = entry.disposables;
    const { commands, menus, registries } = this.deps;
    const self = entry.extension;
    return {
      workspace: this.workspace,
      exportsOf: <T,>(id: string): T => {
        if (!(self.dependsOn ?? []).includes(id)) throw new Error(`확장 ${self.id} 은(는) dependsOn 에 ${id} 을(를) 적어야 그 내보내기를 받는다`);
        const dep = this.active.get(id);
        if (!dep) throw new Error(`확장 ${id} 이(가) 활성이 아니다`);
        return dep.exports as T;
      },
      onDeactivate: (dispose) => {
        let done = false;
        return d.add(() => {
          if (done) return;
          done = true;
          dispose();
        });
      },
      registerObjectType: (spec) => d.add(action(putUnique(registries.objectTypes, spec.type, spec, "오브젝트 타입"))),
      registerAssetType: (spec) => d.add(action(putUnique(registries.assetTypes, spec.id, spec, "자산 타입"))),
      registerPanel: (spec) => d.add(action(putUnique(registries.panels, spec.id, spec, "패널"))),
      registerTool: (spec) => d.add(action(putUnique(registries.tools, spec.id, spec, "도구"))),
      registerCommand: (cmd) => d.add(commands.register(cmd)),
      registerMenu: (spec) => d.add(menus.register(spec)),
      registerValidator: (fn) => {
        runInAction(() => registries.validators.push(fn));
        return d.add(
          action(() => {
            registries.validators.remove(fn);
          }),
        );
      },
      registerImporter: (spec) => d.add(action(putUnique(registries.importers, spec.id, spec, "가져오기"))),
      registerExporter: (spec) => d.add(action(putUnique(registries.exporters, spec.id, spec, "내보내기"))),
    };
  }

  /** 여러 확장을 의존 순서로 활성화한다. 순환이나 빠진 의존은 오류 */
  async activateAll(extensions: Extension[]): Promise<string[]> {
    const order = topoSort(extensions);
    for (const ext of order) await this.activate(ext);
    return order.map((e) => e.id);
  }

  async activate(ext: Extension): Promise<void> {
    if (this.active.has(ext.id)) return;
    for (const dep of ext.dependsOn ?? []) {
      if (!this.active.has(dep)) throw new Error(`확장 ${ext.id} 은(는) ${dep} 이(가) 먼저 있어야 한다`);
    }
    const entry: ActiveExtension = { extension: ext, disposables: new Disposables(), exports: undefined };
    action(() => this.active.set(ext.id, entry))();
    try {
      entry.exports = await ext.activate(this.apiFor(ext.id));
    } catch (e) {
      entry.disposables.dispose();
      action(() => this.active.delete(ext.id))();
      throw e;
    }
    this.events.emit("activated", ext.id);
  }

  async deactivate(id: string): Promise<void> {
    const entry = this.active.get(id);
    if (!entry) return;
    for (const other of this.active.values()) {
      if (other.extension.dependsOn?.includes(id)) await this.deactivate(other.extension.id);
    }
    await entry.extension.deactivate?.();
    entry.disposables.dispose();
    action(() => this.active.delete(id))();
    this.events.emit("deactivated", id);
  }
}

export function topoSort(extensions: Extension[]): Extension[] {
  const byId = new Map(extensions.map((e) => [e.id, e]));
  const result: Extension[] = [];
  const state = new Map<string, "visiting" | "done">();
  const visit = (ext: Extension, chain: string[]) => {
    const s = state.get(ext.id);
    if (s === "done") return;
    if (s === "visiting") throw new Error(`확장 의존이 순환한다: ${[...chain, ext.id].join(" → ")}`);
    state.set(ext.id, "visiting");
    for (const dep of ext.dependsOn ?? []) {
      const target = byId.get(dep);
      if (!target) throw new Error(`확장 ${ext.id} 이(가) 의존하는 ${dep} 이(가) 없다`);
      visit(target, [...chain, ext.id]);
    }
    state.set(ext.id, "done");
    result.push(ext);
  };
  for (const ext of extensions) visit(ext, []);
  return result;
}
