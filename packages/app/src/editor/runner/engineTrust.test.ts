import { describe, expect, it } from "vitest";
import type { EngineCandidate } from "./engineCandidates";
import { decideTrust, trustCovers, type TrustQuestion } from "./engineTrust";

const BUILD: EngineCandidate = { source: "project-build", path: "/g/build/Initial2D", needsTrust: true };
const SIBLING: EngineCandidate = { source: "sibling", path: "/Initial2D/build/Initial2D", needsTrust: true };

describe("trustCovers", () => {
  it("기록이 지금 있는 경로를 모두 덮을 때만 참", () => {
    expect(trustCovers(undefined, [BUILD.path])).toBe(false);
    expect(trustCovers({ allow: true, exes: [BUILD.path] }, [BUILD.path])).toBe(true);
    expect(trustCovers({ allow: true, exes: [BUILD.path, SIBLING.path] }, [SIBLING.path])).toBe(true);
    expect(trustCovers({ allow: false, exes: [BUILD.path] }, [BUILD.path, SIBLING.path])).toBe(false);
  });
});

describe("decideTrust", () => {
  const base = { root: "/g", candidates: [BUILD, SIBLING], record: undefined, ask: true, hasBundled: true };

  it("후보가 없으면 아무것도 보지 않는다", async () => {
    let called = false;
    const d = await decideTrust({ ...base, candidates: [], exists: async () => ((called = true), []) });
    expect(d).toEqual({ allowed: new Set(), record: null, asked: false, skipped: [] });
    expect(called).toBe(false);
  });

  it("파일이 있는 것만 묻고 허용이면 그 경로를 남긴다", async () => {
    const asked: TrustQuestion[] = [];
    const d = await decideTrust({ ...base, exists: async () => [false, true], askTrust: async (q) => (asked.push(q), "allow") });
    expect(asked.map((q) => q.candidates)).toEqual([[SIBLING]]);
    expect([...d.allowed]).toEqual([SIBLING.path]);
    expect(d.record).toEqual({ allow: true, exes: [SIBLING.path] });
    expect(d.asked).toBe(true);
  });

  it("파일을 보지 못하면 있다고 보고 묻는다 (실행하지 않는 쪽이 기본)", async () => {
    const asked: TrustQuestion[] = [];
    const d = await decideTrust({
      ...base,
      exists: async () => Promise.reject(new Error("셸 오류")),
      askTrust: async (q) => (asked.push(q), "deny"),
    });
    expect(asked[0].candidates).toEqual([BUILD, SIBLING]);
    expect(d.allowed.size).toBe(0);
    expect(d.record).toEqual({ allow: false, exes: [BUILD.path, SIBLING.path] });
    expect(d.skipped).toEqual([BUILD, SIBLING]);
  });

  it("묻지 말라거나 물을 곳이 없으면 건너뛰고 기억하지 않는다", async () => {
    const noAsk = await decideTrust({ ...base, ask: false, askTrust: async () => "allow" });
    expect(noAsk).toEqual({ allowed: new Set(), record: null, asked: false, skipped: [BUILD, SIBLING] });
    const noDialog = await decideTrust({ ...base });
    expect(noDialog.allowed.size).toBe(0);
    expect(noDialog.record).toBeNull();
  });

  it("기록이 덮으면 묻지 않고 그 답을 쓴다", async () => {
    const never = async () => {
      throw new Error("묻지 않아야 한다");
    };
    const allowed = await decideTrust({ ...base, record: { allow: true, exes: [BUILD.path, SIBLING.path] }, askTrust: never });
    expect([...allowed.allowed]).toEqual([BUILD.path, SIBLING.path]);
    expect(allowed.record).toBeNull();
    const denied = await decideTrust({ ...base, record: { allow: false, exes: [BUILD.path, SIBLING.path] }, askTrust: never });
    expect(denied.allowed.size).toBe(0);
    expect(denied.skipped).toEqual([BUILD, SIBLING]);
  });

  it("답 없이 닫으면 이번만 건너뛴다", async () => {
    const d = await decideTrust({ ...base, askTrust: async () => null });
    expect(d).toEqual({ allowed: new Set(), record: null, asked: true, skipped: [BUILD, SIBLING] });
  });
});
