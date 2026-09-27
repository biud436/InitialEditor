// 웹뷰 보안 정책(CSP) 위반 모으기 (docs/plans/e6-packaging.md 2.5 절). main.tsx 가 에디터를 만들기 전에 붙인다.
// 자가 검사는 이 목록을 보고서의 cspViolations 에 적고, 하나라도 있으면 실패다.

export interface CspViolation {
  directive: string;
  blocked: string;
  source: string | null;
  line: number | null;
  sample: string | null;
}

export interface CspCollector {
  readonly list: CspViolation[];
  stop(): void;
}

interface ViolationLike {
  effectiveDirective?: string;
  violatedDirective?: string;
  blockedURI?: string;
  sourceFile?: string;
  lineNumber?: number;
  sample?: string;
}

export function toViolation(e: ViolationLike): CspViolation {
  return {
    directive: e.effectiveDirective || e.violatedDirective || "?",
    blocked: e.blockedURI || "(inline)",
    source: e.sourceFile || null,
    line: typeof e.lineNumber === "number" && e.lineNumber > 0 ? e.lineNumber : null,
    sample: e.sample || null,
  };
}

export function installCspCollector(target: Pick<EventTarget, "addEventListener" | "removeEventListener">): CspCollector {
  const list: CspViolation[] = [];
  const onViolation = (e: Event) => list.push(toViolation(e as unknown as ViolationLike));
  target.addEventListener("securitypolicyviolation", onViolation);
  return { list, stop: () => target.removeEventListener("securitypolicyviolation", onViolation) };
}
