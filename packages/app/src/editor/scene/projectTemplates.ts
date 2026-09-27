// 새 프로젝트 쓰기 (docs/plans/e2-scene.md 마일스톤 6, 03-project-and-runtime.md 1절, e6-packaging.md 마일스톤 3).
// 템플릿(빈 프로젝트, 플래피버드, 타일맵)과 언어(Lua, Ruby)를 받아 game.json, 진입점, 씬 로더, 씬 파일, 자산, .gitignore 를
// 백엔드에 쓴다. 파일 목록은 엔진에서 복사한 MANIFEST (templateManifest.ts) 가 정하고, 내용은 TemplateSource 가 준다
// (앱은 번들, 테스트는 fs). 이미 있는 파일은 건드리지 않고 없는 것만 만든다. 돌려주는 것은 이번에 쓴 경로 목록이다.

import { DEFAULT_GAME_JSON, GAME_JSON, serializeGameJson, type ProjectBackend, type ScriptBackend } from "@initial-editor/core";
import { bundledTemplateSource, templateManifest, type TemplateSource } from "./templateFiles";
import { TEMPLATE_START_SCENE, templatePlan, type ProjectTemplateId, type TemplateManifest } from "./templateManifest";

export interface ProjectTemplateOptions {
  template: ProjectTemplateId;
  language: ScriptBackend;
  /** game.json 의 name (보통 폴더 이름) */
  name: string;
}

export const PROJECT_DIRS = ["resources/images", "resources/audio", "resources/fonts", "resources/scenes", "resources/maps"];
export const GITIGNORE_PATH = ".gitignore";
export const GITIGNORE_TEXT =
  "# InitialEditor 가 쓰는 편집 상태 (레이아웃, 열린 탭). 게임 데이터가 아니다\n.initial-editor/\n" +
  "# 엔진이 실행할 때 쓰는 파일 (실행 파일 경로가 들어가 사람마다 다르다)\nconfig.setting\n";

/** 템플릿의 game.json (엔진 기본 해상도 768x896. 플래피 씬과 타일맵 템플릿의 맵도 그 크기다) */
export function templateGameJson(options: ProjectTemplateOptions): string {
  return serializeGameJson({
    ...DEFAULT_GAME_JSON,
    name: options.name,
    script: options.language,
    startScene: TEMPLATE_START_SCENE[options.template],
    extra: {},
  });
}

export async function writeProjectTemplate(
  backend: ProjectBackend,
  options: ProjectTemplateOptions,
  source: TemplateSource = bundledTemplateSource,
  manifest: TemplateManifest = templateManifest,
): Promise<string[]> {
  const written: string[] = [];
  const put = async (path: string, write: () => Promise<void>) => {
    if (await backend.exists(path)) return;
    await write();
    written.push(path);
  };
  await put(GAME_JSON, () => backend.writeText(GAME_JSON, templateGameJson(options)));
  const language = options.language === "mruby" ? "ruby" : "lua";
  for (const entry of templatePlan(manifest, options.template, language)) {
    await put(entry.to, async () => {
      if (entry.kind === "text") await backend.writeText(entry.to, source.text(entry.path));
      else await backend.writeBinary(entry.to, await source.binary(entry.path));
    });
  }
  await put(GITIGNORE_PATH, () => backend.writeText(GITIGNORE_PATH, GITIGNORE_TEXT));
  for (const dir of PROJECT_DIRS) await backend.mkdir(dir);
  return written;
}
