// 스크립트 언어 서버의 수명 (docs/plans/language-server.md 4.4절). 언어마다 하나씩 ScriptSupport 에 붙는다.
//   켜는 때: 설정(languageServer)이 켜져 있고, 프로젝트가 열려 있고, 그 언어의 모델이 처음 열릴 때.
//   끄는 때: 프로젝트를 닫거나 설정을 끌 때. 서버가 스스로 끝나면 한 번 다시 띄우고, 또 끝나면 오류로 둔다.
// 서버를 띄우는 방법(ServerLauncher)은 차례대로 쓸 수 있는 첫 것을 고른다. Lua 는 데스크톱에서 앱에 든 LuaLS(tauriLauncher),
// 그 밖에는 분석기 워커(worker/launcher.ts)이고, Ruby 는 분석기 워커다. 시험은 Node 에서 띄운 LuaLS 를 잇는다.
// LuaLS 처럼 명세 공급자를 대신하는 서버가 돌면 Lua 의 명세 공급자는 씬 계약 스니펫만 남긴다.

import { isTauri, lspAvailable, TauriLanguageServer } from "@initial-editor/backend-tauri";
import { ProjectScope } from "@initial-editor/core";
import { action, comparer, makeObservable, observable, reaction, runInAction } from "mobx";
import type { Editor } from "../../Editor";
import { bundledTemplateSource } from "../../scene/templateFiles";
import { walkProject } from "../find";
import { monaco } from "../monaco";
import type { ScriptSupport } from "../ScriptSupport";
import { MODEL_SCHEME, MonacoBinding } from "./binding";
import { LanguageClient } from "./client";
import { configurationFor, PROJECT_STUB } from "./luaSettings";
import type { MessageTransport } from "./rpc";
import { fileUri, joinPath } from "./uri";
import type { WorkspaceFile } from "./worker/protocol";

export type ServerState = "off" | "unavailable" | "idle" | "starting" | "running" | "failed";
export type ScriptLanguageId = "lua" | "ruby";

export interface LaunchedServer {
  transport: MessageTransport;
  /** 서버가 본 프로젝트 루트 (절대 경로. 디스크를 모르는 서버는 가짜 루트) */
  root: string;
  /** library 를 주었을 때 서버 쪽에 쓴 스텁의 절대 경로 */
  library: string | null;
  version: string | null;
}

export interface ServerLauncher {
  /** 상태 표시의 이름 (LuaLS, Lua 분석기) */
  name: string;
  /** 명세 공급자의 완성, 시그니처, 호버를 대신하는가 (LuaLS) */
  replacesSpec: boolean;
  /** 디스크의 프로젝트를 스스로 읽는가. 아니면 에디터가 initial/workspaceFiles 로 준다 */
  readsDisk?: boolean;
  /** 서버가 있으면 판(모르면 null), 없으면 undefined */
  available(): Promise<{ version: string | null } | undefined>;
  /** root 에서 띄운다. library 는 프로젝트에 엔진 API 스텁이 없을 때 서버 쪽에 둘 스텁의 글이다 */
  launch(root: string, library: string | undefined): Promise<LaunchedServer>;
}

/** 데스크톱 앱에 든 LuaLS */
export const tauriLauncher: ServerLauncher = {
  name: "LuaLS",
  replacesSpec: true,
  readsDisk: true,
  async available() {
    const found = await lspAvailable();
    return found ? { version: found.version } : undefined;
  },
  async launch(root, library) {
    const server = await TauriLanguageServer.start(root, library);
    return { transport: server, root, library: server.info.library, version: server.info.version };
  },
};

export interface ScriptLanguageServerOptions {
  languageId: ScriptLanguageId;
  /** 쓸 수 있는 첫 것을 고른다 */
  launchers: ServerLauncher[];
}

const LANGUAGE_LABEL: Record<ScriptLanguageId, string> = { lua: "Lua", ruby: "Ruby" };
const EXTENSION: Record<ScriptLanguageId, RegExp> = { lua: /\.lua$|(^|\/)\.luarc\.json$/, ruby: /\.rb$/ };
/** 분석기 워커가 색인하는 폴더 (엔진 API 스텁이 있는 resources/api 는 명세 공급자의 몫이다) */
const WORKSPACE_ROOTS = ["scripts"];
/** 스스로 끝난 서버를 다시 띄우는 것은 이 시간 안에 한 번 */
const RESTART_WINDOW_MS = 60_000;

export class ScriptLanguageServer {
  state: ServerState = "idle";
  version: string | null = null;
  /** 지금 고른(또는 고를) 서버의 이름 */
  name: string;
  /** 오류의 이유나 꺼진 이유 (상태 표시의 설명) */
  reason = "";
  client: LanguageClient | null = null;
  binding: MonacoBinding | null = null;
  readonly languageId: ScriptLanguageId;
  private launchers: ServerLauncher[];
  private launcher: ServerLauncher | null = null;
  private generation = 0;
  private lastCrash = 0;
  private disposers: Array<() => void> = [];

  constructor(
    private readonly editor: Editor,
    private readonly support: ScriptSupport,
    options: ScriptLanguageServerOptions,
  ) {
    this.languageId = options.languageId;
    this.launchers = options.launchers;
    this.name = options.launchers[0]?.name ?? "";
    makeObservable<ScriptLanguageServer, "launchers">(this, { state: observable, version: observable, name: observable, reason: observable, launchers: observable.ref, setState: action });
  }

  /** 이 실행 환경에 서버를 띄우는 방법이 있는가 (상태 표시를 할지) */
  get hasLauncher(): boolean {
    return this.launchers.length > 0;
  }

  get statusText(): string {
    const name = this.name;
    switch (this.state) {
      case "off":
        return `${name} 끔`;
      case "unavailable":
        return `${name} 없음`;
      case "idle":
        return `${name} 대기`;
      case "starting":
        return `${name} 시작 중`;
      case "running":
        return this.version ? `${name} ${this.version}` : name;
      case "failed":
        return `${name} 오류`;
    }
  }

  get statusTitle(): string {
    const label = LANGUAGE_LABEL[this.languageId];
    switch (this.state) {
      case "off":
        return `설정에서 언어 서버를 껐습니다. ${label} 스크립트는 API 명세의 자동 완성을 씁니다.`;
      case "unavailable":
        return `이 실행 환경에는 ${label} 언어 서버가 없습니다. API 명세의 자동 완성을 씁니다.`;
      case "idle":
        return `${label} 스크립트를 열면 언어 서버(${this.name})를 시작합니다.`;
      case "starting":
        return `언어 서버(${this.name})를 시작하는 중입니다.`;
      case "running":
        return this.launcher?.replacesSpec
          ? `${label} 스크립트의 자동 완성, 진단, 정의로 이동, 이름 바꾸기를 언어 서버(${this.name})가 처리합니다.`
          : `${label} 스크립트의 구문 오류, 문서 기호, 프로젝트 안의 정의 찾기를 언어 서버(${this.name})가 처리합니다. 엔진 API 의 자동 완성은 API 명세에서 옵니다.`;
      case "failed":
        return `언어 서버(${this.name})가 멈췄습니다. ${this.reason} 도구 메뉴의 "언어 서버 다시 시작"으로 다시 시작할 수 있습니다.`;
    }
  }

  setState(state: ServerState, reason = ""): void {
    this.state = state;
    this.reason = reason;
  }

  /** 서버를 띄우는 방법을 하나로 바꾼다 (시험, 다른 실행 환경). 돌던 서버는 끈다 */
  async setLauncher(launcher: ServerLauncher | null): Promise<void> {
    await this.stop();
    runInAction(() => {
      this.launchers = launcher ? [launcher] : [];
      this.name = launcher?.name ?? "";
    });
    this.setState("idle");
    this.sync();
  }

  install(): void {
    const editor = this.editor;
    this.disposers.push(
      reaction(
        () => [editor.settings.settings.languageServer, editor.project.isOpen, editor.project.root] as const,
        () => {
          void this.stop().then(() => this.sync());
        },
        // 설정은 바꿀 때마다 새 객체라서 세 값을 견준다
        { equals: comparer.shallow },
      ),
      reaction(
        () => editor.settings.settings.scriptDiagnostics,
        () => this.binding?.refreshMarkers(),
      ),
      editor.events.on("fileChanged", (e) => {
        const binding = this.binding;
        if (!this.client || !binding || !EXTENSION[this.languageId].test(e.path)) return;
        const type = e.kind === "create" ? 1 : e.kind === "delete" ? 3 : 2;
        this.client.filesChanged([{ uri: binding.serverUri(e.path), type }]);
      }),
    );
    const created = monaco.editor.onDidCreateModel((model) => {
      if (model.getLanguageId() === this.languageId && model.uri.scheme === MODEL_SCHEME) this.sync();
    });
    this.disposers.push(() => created.dispose());
    this.sync();
  }

  dispose(): void {
    for (const d of this.disposers.splice(0).reverse()) d();
    void this.stop();
  }

  /** 다시 시작한다 (메뉴 커맨드). 그 언어의 스크립트가 열려 있지 않으면 열릴 때 시작한다 */
  async restart(): Promise<void> {
    await this.stop();
    this.lastCrash = 0;
    if (this.wanted() && this.hasModel()) await this.start();
  }

  private wanted(): boolean {
    return this.editor.settings.settings.languageServer && this.editor.project.isOpen && this.launchers.length > 0;
  }

  private hasModel(): boolean {
    return monaco.editor.getModels().some((m) => m.getLanguageId() === this.languageId && m.uri.scheme === MODEL_SCHEME);
  }

  private sync(): void {
    if (!this.launchers.length) return;
    if (!this.editor.settings.settings.languageServer) {
      if (this.state !== "off") this.setState("off");
      return;
    }
    if (this.state === "off") this.setState("idle");
    if (this.wanted() && this.state === "idle" && this.hasModel()) void this.start();
  }

  /** 쓸 수 있는 첫 서버 */
  private async choose(): Promise<{ launcher: ServerLauncher; version: string | null } | null> {
    for (const launcher of this.launchers) {
      const found = await launcher.available().catch(() => undefined);
      if (found) return { launcher, version: found.version };
    }
    return null;
  }

  /** 디스크를 모르는 서버에 줄 프로젝트 스크립트 (scripts 아래의 그 언어 파일) */
  private async workspaceFiles(serverUri: (path: string) => string): Promise<WorkspaceFile[]> {
    const editor = this.editor;
    const backend = editor.backend;
    const ext = this.languageId === "lua" ? ".lua" : ".rb";
    const scope = editor.tree?.filter.scope ?? new ProjectScope();
    const out: WorkspaceFile[] = [];
    for await (const entry of walkProject(backend, WORKSPACE_ROOTS, () => editor.project.isOpen, scope)) {
      if (!entry.path.endsWith(ext)) continue;
      try {
        out.push({ uri: serverUri(entry.path), text: await backend.readText(entry.path) });
      } catch {
        // 읽지 못한 파일은 건너뛴다
      }
    }
    return out;
  }

  private async start(): Promise<void> {
    if (!this.wanted() || this.state === "starting" || this.state === "running") return;
    const generation = ++this.generation;
    const editor = this.editor;
    const projectRoot = editor.project.root;
    this.setState("starting");
    let transport: MessageTransport | null = null;
    try {
      const chosen = await this.choose();
      if (generation !== this.generation) return;
      if (!chosen) {
        this.setState("unavailable");
        return;
      }
      const launcher = chosen.launcher;
      runInAction(() => {
        this.launcher = launcher;
        this.name = launcher.name;
      });
      const lua = this.languageId === "lua";
      const hasStub = lua && launcher.readsDisk ? await editor.backend.exists(PROJECT_STUB).catch(() => false) : true;
      const stubText = hasStub ? undefined : bundledTemplateSource.text(PROJECT_STUB);
      const launched = await launcher.launch(projectRoot, stubText);
      transport = launched.transport;
      if (generation !== this.generation) {
        launched.transport.close();
        return;
      }
      const root = launched.root;
      const library = hasStub ? [joinPath(root, PROJECT_STUB)] : launched.library ? [launched.library] : [];
      let binding: MonacoBinding | null = null;
      const client = new LanguageClient(launched.transport, {
        root,
        rootUri: fileUri(root),
        settings: (section) => configurationFor(section, library),
        onLog: (type, message) => {
          if (type === 1) editor.log.warn("editor", `${launcher.name}: ${message}`);
        },
        onDiagnostics: (params) => binding?.setDiagnostics(params),
        workspace: launcher.readsDisk
          ? undefined
          : {
              files: () => this.workspaceFiles((path) => binding!.serverUri(path)),
              read: async (uri) => {
                const path = binding?.projectPath(uri);
                return path ? editor.backend.readText(path).catch(() => null) : null;
              },
            },
      });
      binding = new MonacoBinding({
        client,
        languageId: this.languageId,
        root,
        diagnosticsMode: () => editor.settings.settings.scriptDiagnostics,
        openFile: async (path, line, column) => (await this.support.openScript(path, line, column)) !== null,
        readFile: (path) => editor.backend.readText(path),
        openForEdit: async (paths) => {
          const active = editor.documents.active;
          for (const path of paths) if (!editor.documents.findByPath(path)) await this.support.openScript(path);
          if (active) editor.documents.activate(active);
        },
      });
      client.connection.onClose((reason) => this.crashed(generation, reason));
      const result = await client.start();
      if (generation !== this.generation) {
        void client.stop();
        return;
      }
      binding.install();
      runInAction(() => {
        this.client = client;
        this.binding = binding;
        // LuaLS 는 serverInfo.version 에 "<Unknown>" 을 보내므로 배포본의 판(luals.json)을 먼저 쓴다
        const reported = result.serverInfo?.version;
        this.version = launched.version ?? chosen.version ?? (reported && !reported.startsWith("<") ? reported : null);
      });
      this.setState("running");
      if (lua && launcher.replacesSpec) this.support.setLuaSpecMode("hooks");
      editor.log.info("editor", `${launcher.name} ${this.version ?? ""} 시작: ${projectRoot}${hasStub ? "" : " (프로젝트에 엔진 API 스텁이 없어 앱에 든 것을 씁니다)"}`);
    } catch (e) {
      transport?.close();
      if (generation !== this.generation) return;
      this.teardown();
      const message = (e as Error).message ?? String(e);
      this.setState("failed", message);
      editor.log.warn("editor", `${this.name} 시작 실패: ${message}`);
    }
  }

  private crashed(generation: number, reason: string): void {
    if (generation !== this.generation) return;
    this.teardown();
    const now = Date.now();
    if (now - this.lastCrash > RESTART_WINDOW_MS) {
      this.lastCrash = now;
      this.editor.log.warn("editor", `언어 서버(${this.name})가 멈춰 다시 시작합니다: ${reason}`);
      this.setState("idle");
      void this.start();
      return;
    }
    this.setState("failed", reason);
    this.editor.log.warn("editor", `언어 서버(${this.name})가 다시 멈췄습니다: ${reason}`);
  }

  /** 서버를 끈다 (설정과 프로젝트 변화, 다시 시작) */
  async stop(): Promise<void> {
    this.generation++;
    const client = this.client;
    this.teardown();
    if (this.state === "running" || this.state === "starting" || this.state === "failed") this.setState("idle");
    await client?.stop();
  }

  private teardown(): void {
    this.binding?.dispose();
    runInAction(() => {
      this.binding = null;
      this.client = null;
    });
    if (this.languageId === "lua") this.support.setLuaSpecMode("full");
  }
}

/** 이 실행 환경의 서버들: Lua 는 데스크톱이면 LuaLS 먼저, Ruby 는 분석기 워커 */
export function defaultLaunchers(languageId: ScriptLanguageId, worker: (language: ScriptLanguageId) => ServerLauncher): ServerLauncher[] {
  if (languageId === "lua") return isTauri() ? [tauriLauncher, worker("lua")] : [worker("lua")];
  return [worker("ruby")];
}
