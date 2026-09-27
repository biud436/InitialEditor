// 템플릿 목록 (packages/app/templates/MANIFEST.json, scripts/sync-engine-templates.mjs 가 만든다).
// 어느 파일이 어느 템플릿과 언어에 들어가는지 고르는 순수 함수라 Node 로 테스트한다. 파일 내용을 읽는 것은
// templateFiles.ts (Vite) 와 테스트의 fs 소스가 한다.

export type ProjectTemplateId = "empty" | "flappy" | "tilemap";
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
  /** 엔진의 git 이 추적하지 않는 생성물 (플래피 그림). 엔진 체크아웃과 대조할 때 원본이 없어도 된다 */
  generated: boolean;
}

/** checkout: 엔진 체크아웃에서, release: 엔진의 템플릿 묶음(Initial2D-templates.zip)에서 */
export type TemplateManifestSource = "checkout" | "release";

export interface TemplateManifest {
  source: TemplateManifestSource;
  /** 다시 맞추는 명령 */
  syncCommand: string;
  /** 엔진 커밋 40자 */
  engineCommit: string;
  /** 엔진의 추적 파일이 커밋과 달랐다 */
  dirty?: boolean;
  syncedAt: string;
  files: TemplateFileEntry[];
}

export const TEMPLATE_LABELS: Record<ProjectTemplateId, string> = {
  empty: "빈 프로젝트 (씬 하나)",
  flappy: "플래피버드 (씬과 컴포넌트)",
  tilemap: "타일맵",
};

/** 템플릿이 여는 시작 씬 */
export const TEMPLATE_START_SCENE: Record<ProjectTemplateId, string> = { empty: "main", flappy: "flappy", tilemap: "main" };

/** 새 프로젝트에 넣을 파일을 고른다 (템플릿과 언어로) */
export function templatePlan(manifest: TemplateManifest, template: ProjectTemplateId, language: TemplateFileLanguage): TemplateFileEntry[] {
  return manifest.files.filter((f) => (f.groups.includes("common") || f.groups.includes(template)) && (f.language === null || f.language === language));
}
