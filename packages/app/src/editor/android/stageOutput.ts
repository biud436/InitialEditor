// 엔진의 android/prepare_assets.sh 가 찍는 줄 읽기 (docs/plans/e6-packaging.md 6.2, 6.3). 순수 함수라 Node 로 테스트한다.
// 마지막 줄 `STAGED files=<n> bytes=<b> stamp=<12자> rtp=<yes|no> dest=<경로>`, 미리 세기는 `DRYRUN files=<n> bytes=<b> rtp=<yes|no>`.
// `WARN ` 로 시작하는 줄은 경고다 (RTP 변환물, AAPT 가 버리는 이름).

import { formatBytes } from "../gameView/staging";

export interface StagedSummary {
  files: number;
  bytes: number;
  stamp: string;
  rtp: boolean;
  dest: string;
}

export interface DryRunSummary {
  files: number;
  bytes: number;
  rtp: boolean;
}

const STAGED_RE = /^STAGED files=(\d+) bytes=(\d+) stamp=([0-9a-f]{12}) rtp=(yes|no) dest=(.+)$/;
const DRYRUN_RE = /^DRYRUN files=(\d+) bytes=(\d+) rtp=(yes|no)$/;

export function parseStagedLine(line: string): StagedSummary | null {
  const m = STAGED_RE.exec(line.trim());
  if (!m) return null;
  return { files: Number(m[1]), bytes: Number(m[2]), stamp: m[3], rtp: m[4] === "yes", dest: m[5] };
}

export function parseDryRunLine(line: string): DryRunSummary | null {
  const m = DRYRUN_RE.exec(line.trim());
  if (!m) return null;
  return { files: Number(m[1]), bytes: Number(m[2]), rtp: m[3] === "yes" };
}

/** "파일 12개, 1.5 MB" */
export function countText(c: { files: number; bytes: number }): string {
  return `파일 ${c.files}개, ${formatBytes(c.bytes)}`;
}

/** 끝난 뒤의 토스트 */
export function stagedToast(s: StagedSummary): string {
  return `안드로이드 에셋 ${s.files}개, ${formatBytes(s.bytes)}`;
}

export const RTP_WARNING = "RTP 변환물이 들어갔다. 이 APK 는 배포하지 않는다";

/** 저장소에 무엇이 있는지 (android_repo_probe) */
export interface RepoState {
  /** android/app/jni/SDL2 */
  sdl: boolean;
  /** android/gradlew (래퍼는 커밋하지 않는다) */
  gradlew: boolean;
}

/** 스테이징 뒤 저장소에서 칠 명령. SDL 소스와 Gradle 래퍼가 없으면 그것부터 */
export function nextCommands(state: RepoState): string[] {
  const out: string[] = [];
  if (!state.sdl) out.push("./android/download_sdl.sh");
  out.push("cd android");
  if (!state.gradlew) out.push("gradle wrapper --gradle-version 8.6");
  out.push("./gradlew :app:assembleDebug");
  out.push("adb install -r app/build/outputs/apk/debug/app-debug.apk");
  return out;
}

export type LineLevel = "info" | "warn" | "error";

/** 콘솔에 남길 수준. 스크립트의 오류 줄(prepare_assets:, stage_list:)은 오류, WARN 과 그 밖의 stderr 는 경고 */
export function lineLevel(line: string, stream: "stdout" | "stderr"): LineLevel {
  if (/^WARN\b/.test(line)) return "warn";
  if (stream === "stderr") return /^(prepare_assets|stage_list):/.test(line) ? "error" : "warn";
  return "info";
}

/** 실패의 이유 한 줄: 스크립트의 마지막 오류 줄, 없으면 종료 코드 */
export function failureText(code: number | null, stderr: readonly string[]): string {
  const last = [...stderr].reverse().find((l) => l.trim() !== "");
  if (last) return last.replace(/^(prepare_assets|stage_list):\s*/, "");
  return code === null ? "스크립트가 시그널로 끝났다" : `스크립트가 종료 코드 ${code} 로 끝났다`;
}
