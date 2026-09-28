// 스크립트 편집 지원의 상태 (E1 마일스톤 1, 4, 5). Editor.scripting 으로 붙는다.
//   - 텍스트 파일을 ScriptDocument 로 여는 것 (openPath 를 감싼다, 아래 install 의 설명)
//   - API 명세와 Monaco 공급자 (자동완성, 시그니처, 호버). 프로젝트를 열고 닫을 때 다시 읽는다
//   - Monaco 테마 연동, 프로젝트 찾기(FindStore), 커맨드와 메뉴(scriptCommands.ts)

import { extname } from "@initial-editor/core";
import { computed, makeObservable, observable, runInAction } from "mobx";
import type { Editor } from "../Editor";
import { SCRIPT_EXTENSIONS, ScriptDocument } from "../documents/ScriptDocument";
import { countSpec, EMPTY_SPEC, type ApiSpec } from "./apiSpec";
import { registerApiProviders } from "./completion";
import { FindStore } from "./find";
import { registerScriptCommands } from "./scriptCommands";
import { API_SPEC_PATH, loadApiSpec, type SpecSource } from "./specLoader";
import { installMonacoTheme } from "./themes";

export class ScriptSupport {
  /** 지금 자동완성이 쓰는 명세 */
  spec: ApiSpec = EMPTY_SPEC;
  /** 명세의 출처. "none" 은 아직 안 읽었다 */
  specSource: SpecSource | "none" = "none";
  readonly find: FindStore;
  private disposers: Array<() => void> = [];
  private projectDisposers: Array<() => void> = [];
  private providers: (() => void) | null = null;
  private specRun = 0;

  constructor(private readonly editor: Editor) {
    this.find = new FindStore({ backend: () => editor.backend, isOpen: () => editor.project.isOpen, scope: () => editor.tree?.filter.scope });
    makeObservable(this, { spec: observable.ref, specSource: observable, openCount: computed, activeScript: computed });
  }

  /** 열린 스크립트 문서 수 (상태 바용) */
  get openCount(): number {
    return this.editor.documents.documents.filter((d) => d instanceof ScriptDocument).length;
  }

  /** 활성 탭의 스크립트 문서. 다른 종류의 탭이면 null */
  get activeScript(): ScriptDocument | null {
    const active = this.editor.documents.active;
    return active instanceof ScriptDocument ? active : null;
  }

  install(): void {
    const editor = this.editor;
    // Editor.openPath 는 확장자로 문서 종류를 고르는데 열기 레지스트리가 아직 없어서 여기서 감싼다.
    // 텍스트 확장자는 ScriptDocument 로, 자산 타입 확장이 잡은 확장자와 그 밖은 원래 함수로. Editor.ts 에
    // 열기 레지스트리(registerOpener)가 생기면 이 감싸기는 그것으로 바꾼다.
    const original = editor.openPath.bind(editor);
    editor.openPath = async (path: string) => {
      const ext = extname(path);
      if (!SCRIPT_EXTENSIONS.has(ext) || editor.registries.assetTypeFor(ext)?.open) return original(path);
      await this.openScript(path);
    };
    this.disposers.push(() => {
      editor.openPath = original;
    });
    this.disposers.push(installMonacoTheme(editor.theme));
    this.disposers.push(registerScriptCommands(editor, this));
    this.disposers.push(
      editor.events.on("projectOpened", () => {
        this.watchProject();
        void this.reloadSpec();
      }),
      editor.events.on("projectClosed", () => {
        this.unwatchProject();
        this.find.clear();
        void this.reloadSpec();
      }),
    );
    void this.reloadSpec();
  }

  /** 명세를 다시 읽고 Monaco 공급자를 다시 건다 (프로젝트의 resources/api/initial2d-api.json, 없으면 내장 기본값) */
  async reloadSpec(): Promise<void> {
    const run = ++this.specRun;
    const editor = this.editor;
    const loaded = await loadApiSpec(editor.backend, editor.project.isOpen);
    if (run !== this.specRun) return;
    runInAction(() => {
      this.spec = loaded.spec;
      this.specSource = loaded.source;
    });
    this.providers?.();
    this.providers = registerApiProviders(loaded.spec);
    const n = countSpec(loaded.spec);
    if (loaded.problem) editor.log.warn("editor", loaded.problem);
    if (loaded.source === "project") {
      editor.log.info("editor", `API 명세 로드됨: ${API_SPEC_PATH} (함수 ${n.functions}개, 클래스 ${n.classes}개, 상수 ${n.constants}개)`);
    } else {
      editor.log.info("editor", `내장 기본 API 명세(fallback)를 사용합니다 (함수 ${n.functions}개). 프로젝트에 ${API_SPEC_PATH} 파일이 없거나 불러오지 못했습니다.`);
    }
  }

  /** 스크립트를 열고(이미 열려 있으면 활성으로) 줄이 있으면 그 줄로 간다. 못 열면 null */
  async openScript(path: string, line?: number, column?: number): Promise<ScriptDocument | null> {
    const editor = this.editor;
    const existing = editor.documents.findByPath(path);
    let doc: ScriptDocument;
    if (existing instanceof ScriptDocument) {
      editor.documents.activate(existing);
      doc = existing;
    } else if (existing) {
      editor.documents.activate(existing);
      return null;
    } else {
      doc = new ScriptDocument(editor.backend, path);
      editor.documents.open(doc);
      try {
        await doc.load();
      } catch (e) {
        const message = `${path} 열기 실패: ${(e as Error).message}`;
        editor.log.error("editor", message);
        editor.toasts.error(message);
        editor.documents.close(doc);
        return null;
      }
    }
    if (line !== undefined) doc.reveal(line, column ?? 1);
    return doc;
  }

  /** 미수정 스크립트가 밖에서 바뀌어 다시 읽히면(Editor 가 한다) 토스트로 알린다. 다시 읽기에 성공했을 때만 */
  private watchProject(): void {
    this.unwatchProject();
    const editor = this.editor;
    this.projectDisposers.push(
      editor.events.on("documentReloaded", (doc) => {
        if (doc instanceof ScriptDocument) editor.toasts.info(`외부에서 변경되어 다시 읽음: ${doc.title}`);
      }),
    );
  }

  private unwatchProject(): void {
    for (const d of this.projectDisposers) d();
    this.projectDisposers = [];
  }

  dispose(): void {
    this.unwatchProject();
    this.providers?.();
    this.providers = null;
    for (const d of this.disposers.reverse()) d();
    this.disposers = [];
  }
}
