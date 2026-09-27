// 자가 검사 모드의 셸 명령 (src-tauri/src/selftest.rs, docs/plans/e6-packaging.md 5절).
//   selftest_plan() → 계획 JSON 또는 null (평소 실행)
//   selftest_progress(step), selftest_write_log(name, text, encoding?) → 쓴 절대 경로, selftest_finish(report, code)
// 셸은 계획 파일의 경로를 환경 변수에서만 읽고, 로그는 workDir/logs 안의 단순 이름만, 보고서는 계획의 report 에만 쓴다.

import { invoke } from "@tauri-apps/api/core";
import { toBackendError } from "./index";

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw toBackendError(e);
  }
}

/** 자가 검사 계획. 평소 실행이면 null */
export function selftestPlan(): Promise<unknown> {
  return call<unknown>("selftest_plan");
}

export function selftestProgress(step: Record<string, unknown>): Promise<void> {
  return call<void>("selftest_progress", { step });
}

/** logs/<name> 에 쓴다. 바이트는 base64 로 보낸다 */
export function selftestWriteLog(name: string, data: string | Uint8Array): Promise<string> {
  if (typeof data === "string") return call<string>("selftest_write_log", { name, text: data, encoding: "utf8" });
  return call<string>("selftest_write_log", { name, text: bytesToBase64(data), encoding: "base64" });
}

/** 보고서를 쓰고 앱을 code 로 끝낸다 */
export function selftestFinish(report: string, code: number): Promise<void> {
  return call<void>("selftest_finish", { report, code });
}

export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]);
  }
  return btoa(binary);
}
