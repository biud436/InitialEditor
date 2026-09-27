// 엔진의 안드로이드 스테이징 규칙(tools/stage_rules.json)과 게임 탭의 스테이징 규칙(gameView/staging.ts)의 대조
// (docs/plans/e6-packaging.md 6.2). shared 가 참인 규칙의 예시는 게임 탭도 빼야 하고, 두 쪽이 다 올리는 예시는 게임 탭도 올린다.
// 엔진 저장소(INITIAL2D_DIR, 기본 ../Initial2D)에 규칙 파일이 없으면 건너뛴다.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isStagePath, STAGE_ROOT_FILES } from "../gameView/staging";

interface StageRule {
  id: string;
  shared: boolean;
  examples: string[];
}

interface StageRules {
  rootFiles: string[];
  keepExamples: string[];
  exclude: StageRule[];
}

const engineDir = path.resolve(process.env.INITIAL2D_DIR ?? path.join(__dirname, "..", "..", "..", "..", "..", "..", "Initial2D"));
const rulesPath = path.join(engineDir, "tools", "stage_rules.json");
const hasRules = existsSync(rulesPath);

describe.skipIf(!hasRules)(`안드로이드 규칙의 shared 줄이 게임 탭에도 있다 (${rulesPath})`, () => {
  const rules = hasRules ? (JSON.parse(readFileSync(rulesPath, "utf8")) as StageRules) : { rootFiles: [], keepExamples: [], exclude: [] };
  const shared = rules.exclude.filter((r) => r.shared);

  it("shared 규칙이 있고 저마다 예시가 있다", () => {
    expect(shared.map((r) => r.id)).toEqual(expect.arrayContaining(["dot-name", "zip", "psd", "rtp", "aldebaran-src"]));
    for (const r of shared) expect(r.examples.length, r.id).toBeGreaterThan(0);
  });

  for (const rule of shared) {
    it(`${rule.id}: 게임 탭도 뺀다`, () => {
      for (const example of rule.examples) expect(isStagePath(example), example).toBe(false);
    });
  }

  it("두 쪽이 다 올리는 예시는 게임 탭도 올린다 (안드로이드만 올리는 뿌리 파일은 빼고)", () => {
    const androidOnlyRoots = rules.rootFiles.filter((f) => !STAGE_ROOT_FILES.includes(f));
    const both = rules.keepExamples.filter((p) => !androidOnlyRoots.includes(p));
    expect(both.length).toBeGreaterThan(2);
    for (const example of both) expect(isStagePath(example), example).toBe(true);
  });
});
