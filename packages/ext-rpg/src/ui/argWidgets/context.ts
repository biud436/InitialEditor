// 인자 위젯이 함께 쓰는 것 (엔진 M2 2.3 의 위젯 열).
//
// 위젯은 값 하나를 그리고 onChange(값, 세션) 으로 알린다. 값 undefined 는 인자를 지운다.
// 세션은 타이핑의 합치기 키이고, 고르기와 누르기는 세션 없이 한 번이 되돌리기 한 단계다.
// 위젯은 명령을 모른다: 커맨드 폼은 setArg 에, 이벤트 인스펙터는 setField 에 잇는다.

import type { ArgSpec, EventSchema } from "../../model/schema";
import type { RefSources } from "../../model/refs";

export type ImageUrl = (projectPath: string) => string | null | undefined | Promise<string | null | undefined>;

export interface ArgContext {
  schema: EventSchema;
  /** ref 칸의 제안 목록 재료 (refs.ts) */
  refs: RefSources;
  /** 프로젝트 파일 목록 (프로젝트 기준, ./ 없이). 파일 고르기와 외형, 얼굴의 그림 찾기에 쓴다 */
  files: readonly string[];
  /** 그림 파일의 URL (외형, 얼굴 격자). 없으면 번호만 보인다 */
  imageUrl?: ImageUrl;
  disabled?: boolean;
  /** 되묻기 (가지가 있는 항목 빼기) */
  confirm: (message: string) => boolean | Promise<boolean>;
}

export interface ArgWidgetProps {
  spec: ArgSpec;
  value: unknown;
  onChange: (value: unknown, session?: string) => void;
  ctx: ArgContext;
  sessionPrefix: string;
  testId: string;
  id?: string;
}

/** 비어 있을 때 보일 글: 기본값이 있으면 그 값 */
export function emptyText(spec: ArgSpec): string {
  if (spec.default === undefined) return "지정 안 함";
  return `지정 안 함 (기본값 ${defaultText(spec.default)})`;
}

export function defaultText(v: unknown): string {
  if (v === true) return "참";
  if (v === false) return "거짓";
  return typeof v === "string" ? v : JSON.stringify(v);
}

/** 선택 인자의 빈 글은 인자를 지운다 */
export function textValue(spec: ArgSpec, v: string): string | undefined {
  return v === "" && !spec.required ? undefined : v;
}

/** 파일의 확장자 (소문자, 점 없이) */
export function extOf(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot < 0 ? "" : base.slice(dot + 1).toLowerCase();
}

/** accept 확장자에 맞는 파일, dir 아래 것이 먼저 (둘 다 이름순) */
export function pickableFiles(files: readonly string[], accept?: readonly string[], dir?: string): string[] {
  const exts = accept?.map((a) => a.toLowerCase());
  const matched = files.filter((f) => !exts || exts.length === 0 || exts.includes(extOf(f)));
  const prefix = dir ? `${dir.replace(/^\.\//, "").replace(/\/+$/, "")}/` : null;
  const inDir = prefix ? matched.filter((f) => f.startsWith(prefix)).sort() : [];
  const rest = matched.filter((f) => !prefix || !f.startsWith(prefix)).sort();
  return [...inDir, ...rest];
}
