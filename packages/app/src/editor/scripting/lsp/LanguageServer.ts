// Lua 언어 서버의 수명 (docs/plans/language-server.md 4.4절). ScriptSupport.languageServer 로 붙는다.
//   켜는 때: 설정(languageServer)이 켜져 있고, 프로젝트가 열려 있고, 실행 환경에 서버가 있고, Lua 모델이 처음 열릴 때.
//   끄는 때: 프로젝트를 닫거나 설정을 끌 때. 서버가 스스로 끝나면 한 번 다시 띄우고, 또 끝나면 오류로 둔다.
//   서버가 도는 동안 Lua 의 명세 공급자는 씬 계약 스니펫만 남긴다 (나머지는 서버가 준다).
// 서버를 띄우는 방법은 ServerLauncher 다. 데스크톱은 앱에 든 LuaLS(tauriLauncher), 시험은 Node 에서 띄운 LuaLS 를 잇는다.

import { isTauri, lspAvailable, TauriLanguageServer } from "@initial-editor/backend-tauri";
import { action, comparer, makeObservable, observable, reaction, runInAction } from "mobx";
import type { Editor } from "../../Editor";
import { bundledTemplateSource } from "../../scene/templateFiles";
import { monaco } from "../monaco";
import type { ScriptSupport } from "../ScriptSupport";
import { MODEL_SCHEME, MonacoBinding } from "./binding";
import { LanguageClient } from "./client";
import { configurationFor, PROJECT_STUB } from "./luaSettings";
import type { MessageTransport } from "./rpc";
import { fileUri, joinPath } from "./uri";

export type ServerState = "off" | "unavailable" | "idle" | "starting" | "running" | "failed";

export interface LaunchedServer {
  transport: MessageTransport;
  /** 서버가 본 프로젝트 루트 (절대 경로) */
  root: string;
  /** library 를 주었을 때 서버 쪽에 쓴 스텁의 절대 경로 */
  library: string | null;
  version: string | null;
}

export interface ServerLauncher {
  /** 서버가 있으면 판(모르면 null), 없으면 undefined */
  available(): Promise<{ version: string | null } | undefined>;
  /** root 에서 띄운다. library 는 프로젝트에 엔진 API 스텁이 없을 때 서버 쪽에 둘 스텁의 글이다 */
  launch(root: string, library: string | undefined): Promise<LaunchedServer>;
}

/** 데스크톱 앱에 든 LuaLS */
export const tauriLauncher: ServerLauncher = {
  async available() {
    const found = await lspAvailable();
    return found ? { version: found.version } : undefined;
  },
  async launch(root, library) {
    const server = await TauriLanguageServer.start(root, library);
    return { transport: server, root, library: server.info.library, version: server.info.version };
  },
};

const SERVER_NAME = "LuaLS";
/** 스스로 끝난 서버를 다시 띄우는 것은 이 시간 안에 한 번 */
const RESTART_WINDOW_MS = 60_000;

export class LuaLanguageServer {
  state: ServerState = "idle";
  version: string | null = null;
  /** 오류의 이유나 꺼진 이유 (상태 표시의 설명) */
  reason = "";
  client: LanguageClient | null = null;
  binding: MonacoBinding | null = null;
  private launcher: ServerLauncher | null;
  private generation = 0;
  private lastCrash = 0;
  private disposers: Array<() => void> = [];

  constructor(
    private readonly editor: Editor,
    private readonly support: ScriptSupport,
    launcher?: ServerLauncher | null,
  ) {
    this.launcher = launcher === undefined ? (isTauri() ? tauriLauncher : null) : launcher;
    makeObservable<LuaLanguageServer, "launcher">(this, { state: observable, version: observable, reason: observable, launcher: observable.ref, setState: action });
  }

  /** 이 실행 환경에 서버를 띄우는 방법이 있는가 (상태 표시를 할지) */
  get hasLauncher(): boolean {
    return this.launcher !== null;
  }

  get statusText(): string {
    switch (this.state) {
      case "off":
        return `${SERVER_NAME} 끔`;
      case "unavailable":
        return `${SERVER_NAME} 없음`;
      case "idle":
        return `${SERVER_NAME} 대기`;
      case "starting":
        return `${SERVER_NAME} 시작 중`;
      case "running":
        return this.version ? `${SERVER_NAME} ${this.version}` : SERVER_NAME;
      case "failed":
        return `${SERVER_NAME} 오류`;
    }
  }

  get statusTitle(): string {
    switch (this.state) {
      case "off":
        return "설정에서 언어 서버를 껐습니다. Lua 는 API 명세의 자동 완성을 씁니다.";
      case "unavailable":
        return "이 앱에는 언어 서버가 들어 있지 않습니다. Lua 는 API 명세의 자동 완성을 씁니다.";
      case "idle":
        return "Lua 스크립트를 열면 언어 서버를 시작합니다.";
      case "starting":
        return "언어 서버를 시작하는 중입니다.";
      case "running":
        return "Lua 스크립트의 자동 완성, 진단, 정의로 이동, 이름 바꾸기를 언어 서버가 처리합니다.";
      case "failed":
        return `언어 서버가 멈췄습니다. ${this.reason} 도구 메뉴의 "언어 서버 다시 시작"으로 다시 시작할 수 있습니다.`;
    }
  }

  setState(state: ServerState, reason = ""): void {
    this.state = state;
    this.reason = reason;
  }

  /** 서버를 띄우는 방법을 바꾼다 (시험, 다른 실행 환경). 돌던 서버는 끈다 */
  async setLauncher(launcher: ServerLauncher | null): Promise<void> {
    await this.stop();
    runInAction(() => {
      this.launcher = launcher;
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
        if (!this.client || !/\.lua$|(^|\/)\.luarc\.json$/.test(e.path)) return;
        const type = e.kind === "create" ? 1 : e.kind === "delete" ? 3 : 2;
        this.client.filesChanged([{ uri: fileUri(joinPath(this.editor.project.root, e.path)), type }]);
      }),
    );
    const created = monaco.editor.onDidCreateModel((model) => {
      if (model.getLanguageId() === "lua" && model.uri.scheme === MODEL_SCHEME) this.sync();
    });
    this.disposers.push(() => created.dispose());
    this.sync();
  }

  dispose(): void {
    for (const d of this.disposers.splice(0).reverse()) d();
    void this.stop();
  }

  /** 다시 시작한다 (메뉴 커맨드) */
  async restart(): Promise<void> {
    await this.stop();
    this.lastCrash = 0;
    await this.start();
  }

  private wanted(): boolean {
    return this.editor.settings.settings.languageServer && this.editor.project.isOpen && this.launcher !== null;
  }

  private hasLuaModel(): boolean {
    return monaco.editor.getModels().some((m) => m.getLanguageId() === "lua" && m.uri.scheme === MODEL_SCHEME);
  }

  private sync(): void {
    if (!this.launcher) return;
    if (!this.editor.settings.settings.languageServer) {
      if (this.state !== "off") this.setState("off");
      return;
    }
    if (this.state === "off") this.setState("idle");
    if (this.wanted() && this.state === "idle" && this.hasLuaModel()) void this.start();
  }

  private async start(): Promise<void> {
    const launcher = this.launcher;
    if (!launcher || !this.wanted() || this.state === "starting" || this.state === "running") return;
    const generation = ++this.generation;
    const editor = this.editor;
    const projectRoot = editor.project.root;
    this.setState("starting");
    let transport: MessageTransport | null = null;
    try {
      const found = await launcher.available();
      if (generation !== this.generation) return;
      if (!found) {
        this.setState("unavailable");
        return;
      }
      const hasStub = await editor.backend.exists(PROJECT_STUB).catch(() => false);
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
          if (type === 1) editor.log.warn("editor", `${SERVER_NAME}: ${message}`);
        },
        onDiagnostics: (params) => binding?.setDiagnostics(params),
      });
      binding = new MonacoBinding({
        client,
        languageId: "lua",
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
        this.version = launched.version ?? found.version ?? (reported && !reported.startsWith("<") ? reported : null);
      });
      this.setState("running");
      this.support.setLuaSpecMode("hooks");
      editor.log.info("editor", `${SERVER_NAME} ${this.version ?? ""} 시작: ${root}${hasStub ? "" : " (프로젝트에 엔진 API 스텁이 없어 앱에 든 것을 씁니다)"}`);
    } catch (e) {
      transport?.close();
      if (generation !== this.generation) return;
      this.teardown();
      const message = (e as Error).message ?? String(e);
      this.setState("failed", message);
      editor.log.warn("editor", `${SERVER_NAME} 시작 실패: ${message}`);
    }
  }

  private crashed(generation: number, reason: string): void {
    if (generation !== this.generation) return;
    this.teardown();
    const now = Date.now();
    if (now - this.lastCrash > RESTART_WINDOW_MS) {
      this.lastCrash = now;
      this.editor.log.warn("editor", `${SERVER_NAME} 가 멈춰 다시 시작합니다: ${reason}`);
      this.setState("idle");
      void this.start();
      return;
    }
    this.setState("failed", reason);
    this.editor.log.warn("editor", `${SERVER_NAME} 가 다시 멈췄습니다: ${reason}`);
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
    this.support.setLuaSpecMode("full");
  }
}
