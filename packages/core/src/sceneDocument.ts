// 씬 문서: resources/scenes/<이름>.json 하나. 되돌리기는 SceneModel 의 명령으로, 저장은 serializeScene 으로.

import { computed, makeObservable, observable, runInAction } from "mobx";
import type { ProjectBackend } from "./backend";
import { Document } from "./document";
import type { ValidationProblem } from "./extensions";
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

export class SceneDocument extends Document {
  readonly scene: SceneModel;
  /** 마지막 로드나 저장 뒤의 검사 결과 */
  problems: ValidationProblem[] = [];
  /** 선택된 오브젝트 id 들 (씬 뷰와 계층이 함께 본다) */
  readonly selection = observable.set<string>();

  constructor(
    private readonly backend: ProjectBackend,
    path: string,
    data: SceneData = emptyScene(sceneNameFromPath(path)),
    private readonly knownTypes: () => ReadonlySet<string>,
  ) {
    super(SCENE_KIND, path, basename(path));
    this.scene = new SceneModel(data);
    makeObservable(this, { problems: observable.shallow, selectedIds: computed });
    this.revalidate();
  }

  static async open(backend: ProjectBackend, path: string, knownTypes: () => ReadonlySet<string>): Promise<SceneDocument> {
    const text = await backend.readText(path);
    return new SceneDocument(backend, path, parseScene(text), knownTypes);
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

  revalidate(): ValidationProblem[] {
    const problems = validateScene(this.scene.toData(), this.knownTypes());
    runInAction(() => (this.problems = problems));
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
