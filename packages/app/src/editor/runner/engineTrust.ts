// 프로젝트가 가리키는 엔진의 신뢰 (docs/plans/e6-packaging.md 2.3 절). 엔진 탐색은 후보를 `--features` 로 실행하므로
// 받은 폴더를 여는 것만으로 그 안의 실행 파일이 돌면 안 된다. 신뢰가 필요한 후보(.initial-editor/engine, build/, 형제 폴더)는
// 먼저 실행하지 않고 파일이 있는지만 보고, 있으면 경로를 보인 뒤 한 번 묻는다. 답은 앱 설정(engineTrust)에 남는다.
// 순수 함수라 Node 로 테스트한다. 묻는 모달은 EngineTrustDialog.tsx, 부르는 곳은 RunnerStore.resolveEngine 이다.

import type { EngineTrustRecord } from "@initial-editor/core";
import type { EngineCandidate } from "./engineCandidates";

/** 묻는 내용: 프로젝트와, 파일이 있는 신뢰 필요 후보 */
export interface TrustQuestion {
  /** 프로젝트의 정규 경로 (설정의 키) */
  root: string;
  candidates: EngineCandidate[];
  /** 앱에 든 엔진이 있는가 (거절 단추의 글이 달라진다) */
  hasBundled: boolean;
}

/** "이 엔진 실행 허용", "앱에 든 엔진만 쓰기", 또는 답 없이 닫음(null, 기억하지 않는다) */
export type TrustAnswer = "allow" | "deny" | null;

/** 이번 탐색에서 찔러도 되는 경로와, 남길 답 */
export interface TrustDecision {
  allowed: ReadonlySet<string>;
  /** 새로 남길 답. 기록이 이미 덮고 있거나 묻지 않았으면 null */
  record: EngineTrustRecord | null;
  /** 모달을 띄웠는가 */
  asked: boolean;
  /** 건너뛴 후보 (파일이 있는데 신뢰하지 않았다) */
  skipped: EngineCandidate[];
}

/** 기록이 지금 있는 경로를 모두 덮는가. 새 경로가 생겼으면(프로젝트가 다른 파일을 가리키면) 다시 묻는다 */
export function trustCovers(record: EngineTrustRecord | undefined, paths: readonly string[]): record is EngineTrustRecord {
  return !!record && paths.every((p) => record.exes.includes(p));
}

export interface DecideTrustInput {
  root: string;
  /** 신뢰가 필요한 후보 (engineCandidates 의 needsTrust) */
  candidates: EngineCandidate[];
  /** 경로마다 파일이 있는지. 없으면 모두 있다고 보고 묻는다 */
  exists?: (paths: string[]) => Promise<boolean[]>;
  /** 남아 있는 답. 함수면 파일을 본 뒤에 읽는다 (그사이 겹친 탐색이 남긴 답을 쓴다) */
  record: EngineTrustRecord | undefined | (() => EngineTrustRecord | undefined);
  /** 모달. 없거나 ask 가 거짓이면 묻지 않고 건너뛴다 */
  askTrust?: (q: TrustQuestion) => Promise<TrustAnswer>;
  ask: boolean;
  hasBundled: boolean;
}

/**
 * 신뢰가 필요한 후보 가운데 찔러도 되는 것. 파일이 하나도 없으면 묻지 않는다. 기록이 모두 덮으면 그 답을 쓰고,
 * 아니면 물어서 허용이면 보인 경로 전부를, 거절이면 아무것도 허용하지 않는다. 답 없이 닫으면 이번만 건너뛴다
 */
export async function decideTrust(input: DecideTrustInput): Promise<TrustDecision> {
  const none: ReadonlySet<string> = new Set();
  if (input.candidates.length === 0) return { allowed: none, record: null, asked: false, skipped: [] };
  let present = input.candidates;
  if (input.exists) {
    let flags: boolean[];
    try {
      flags = await input.exists(input.candidates.map((c) => c.path));
    } catch {
      flags = input.candidates.map(() => true); // 모르면 있다고 보고 묻는다 (실행하지 않는 쪽이 기본)
    }
    present = input.candidates.filter((_, i) => flags[i] === true);
  }
  if (present.length === 0) return { allowed: none, record: null, asked: false, skipped: [] };
  const paths = present.map((c) => c.path);
  const record = typeof input.record === "function" ? input.record() : input.record;
  if (trustCovers(record, paths)) {
    return record.allow
      ? { allowed: new Set(paths), record: null, asked: false, skipped: [] }
      : { allowed: none, record: null, asked: false, skipped: present };
  }
  if (!input.ask || !input.askTrust) return { allowed: none, record: null, asked: false, skipped: present };
  const answer = await input.askTrust({ root: input.root, candidates: present, hasBundled: input.hasBundled });
  if (answer === "allow") return { allowed: new Set(paths), record: { allow: true, exes: paths }, asked: true, skipped: [] };
  if (answer === "deny") return { allowed: none, record: { allow: false, exes: paths }, asked: true, skipped: present };
  return { allowed: none, record: null, asked: true, skipped: present };
}

/**
 * 새 답을 남은 기록에 더한다. 같은 답(둘 다 허용이거나 둘 다 거절)이면 경로를 합친다: 앱에 든 엔진이 답하지 않아 형제 무리를
 * 따로 물었을 때 앞 무리의 답이 지워지지 않게. 답이 다르면 새 답으로 바꾼다 (한 프로젝트의 기록은 답 하나다)
 */
export function mergeTrust(prev: EngineTrustRecord | undefined, next: EngineTrustRecord): EngineTrustRecord {
  if (!prev || prev.allow !== next.allow) return next;
  return { allow: next.allow, exes: [...new Set([...prev.exes, ...next.exes])] };
}
