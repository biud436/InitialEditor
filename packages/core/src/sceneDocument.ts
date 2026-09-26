// 씬 문서: resources/scenes/<이름>.json 하나. 되돌리기는 SceneModel 의 명령으로, 저장은 serializeScene 으로.

import { computed, makeObservable, observable, runInAction } from "mobx";
import type { ProjectBackend } from "./backend";
import { Document } from "./document";
import type { ValidationProblem, Validator } from "./extensions";
import { basename } from "./paths";
import { emptyScene, parseScene, SceneModel, serializeScene, validateScene, type SceneData } from "./scene";

export const SCENE_KIND = "scene";
export const SCENES_DIR = "resources/scenes";

export function scenePathFor(name: string): string {
  return `${SCENES_DIR}/${name}.json`;
}

export function sceneNameFromPath(path: string): string {
  return basename(path).replace(/\.json$/i, "");
}

/** 확장이 등록한 검사기. 씬 데이터(SceneData)를 받는다 */
export type SceneValidators = () => Iterable<Validator>;

export class SceneDocument extends Document {
  readonly scene: SceneModel;
  /** 마지막 검사 결과 (씬 규칙 뒤에 확장 검사기의 결과) */
  problems: ValidationProblem[] = [];
  /** 선택된 오브젝트 id 들 (씬 뷰와 계층이 함께 본다) */
  readonly selection = observable.set<string>();
  private validationRun = 0;

  constructor(
    private readonly backend: ProjectBackend,
    path: string,
    data: SceneData = emptyScene(sceneNameFromPath(path)),
    private readonly knownTypes: () => ReadonlySet<string>,
    private readonly validators: SceneValidators = () => [],
  ) {
    super(SCENE_KIND, path, basename(path));
    this.scene = new SceneModel(data);
    makeObservable(this, { problems: observable.shallow, selectedIds: computed });
    this.revalidate();
  }

  static async open(backend: ProjectBackend, path: string, knownTypes: () => ReadonlySet<string>, validators?: SceneValidators): Promise<SceneDocument> {
    const text = await backend.readText(path);
    return new SceneDocument(backend, path, parseScene(text), knownTypes, validators);
  }

  get selectedIds(): string[] {
    return this.scene.objects.filter((o) => this.selection.has(o.id)).map((o) => o.id);
  }

  select(ids: Iterable<string>, additive = false): void {
    runInAction(() => {
      if (!additive) this.selection.clear();
      for (const id of ids) this.selection.add(id);
    });
  }

  clearSelection(): void {
    runInAction(() => this.selection.clear());
  }

  /**
   * 씬 규칙과 확장 검사기로 검사한다. 돌려주는 것은 바로 나온 결과이고, 비동기 검사기의 결과는
   * 끝나는 대로 problems에 더한다 (그 사이에 다시 검사했으면 버린다).
   */
  revalidate(): ValidationProblem[] {
    const data = this.scene.toData();
    const problems = validateScene(data, this.knownTypes());
    const pending: Array<Promise<ValidationProblem[]>> = [];
    for (const fn of this.validators()) {
      try {
        const result = fn(data);
        if (Array.isArray(result)) problems.push(...result);
        else pending.push(Promise.resolve(result));
      } catch (e) {
        problems.push(validatorFailure(e));
      }
    }
    const run = ++this.validationRun;
    runInAction(() => (this.problems = problems));
    if (pending.length > 0) {
      void Promise.allSettled(pending).then((results) => {
        if (run !== this.validationRun) return;
        const more = results.flatMap((r) => (r.status === "fulfilled" ? r.value : [validatorFailure(r.reason)]));
        if (more.length > 0) runInAction(() => (this.problems = [...problems, ...more]));
      });
    }
    return problems;
  }

  text(): string {
    return serializeScene(this.scene.toData());
  }

  async save(): Promise<void> {
    if (!this.path) throw new Error("경로가 없는 씬은 저장할 수 없다");
    this.assertCanSave();
    this.revalidate();
    // 쓰는 동안 들어온 편집은 dirty로 남도록 쓰기 전의 상태로 표시한다
    const state = this.undo.stateId;
    await this.backend.writeText(this.path, this.text());
    this.markSaved(state);
  }

  async reload(): Promise<void> {
    if (!this.path) return;
    const text = await this.backend.readText(this.path);
    const data = parseScene(text);
    runInAction(() => {
      this.scene.replaceAll(data);
      this.undo.clear();
      this.selection.clear();
    });
    this.markSaved();
    this.revalidate();
  }
}

function validatorFailure(e: unknown): ValidationProblem {
  return { severity: "warning", message: `검사기가 실패했다: ${e instanceof Error ? e.message : String(e)}` };
}
