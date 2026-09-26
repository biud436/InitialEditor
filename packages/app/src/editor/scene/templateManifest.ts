// 템플릿 목록 (packages/app/templates/MANIFEST.json, scripts/sync-engine-templates.mjs 가 만든다).
// 어느 파일이 어느 템플릿과 언어에 들어가는지 고르는 순수 함수라 Node 로 테스트한다. 파일 내용을 읽는 것은
// templateFiles.ts (Vite) 와 테스트의 fs 소스가 한다.

export type ProjectTemplateId = "empty" | "flappy";
export type TemplateFileLanguage = "lua" | "ruby";

export interface TemplateFileEntry {
  /** 엔진 저장소와 packages/app/templates/ 안의 경로 */
  path: string;
  /** 새 프로젝트 안의 경로 */
  to: string;
  /** "common" 은 늘, 나머지는 그 템플릿일 때 */
  groups: string[];
  /** 없으면 두 언어 모두 */
  language: TemplateFileLanguage | null;
  kind: "text" | "binary";
  size: number;
  sha256: string;
}

export interface TemplateManifest {
  engineCommit: string | null;
  syncedAt: string;
  files: TemplateFileEntry[];
}

export const TEMPLATE_LABELS: Record<ProjectTemplateId, string> = {
  empty: "빈 프로젝트 (씬 하나)",
  flappy: "플래피버드 (씬과 컴포넌트)",
};

/** 템플릿이 여는 시작 씬 */
export const TEMPLATE_START_SCENE: Record<ProjectTemplateId, string> = { empty: "main", flappy: "flappy" };

/** 새 프로젝트에 넣을 파일을 고른다 (템플릿과 언어로) */
export function templatePlan(manifest: TemplateManifest, template: ProjectTemplateId, language: TemplateFileLanguage): TemplateFileEntry[] {
  return manifest.files.filter((f) => (f.groups.includes("common") || f.groups.includes(template)) && (f.language === null || f.language === language));
}
