// 빌드 도장 (buildCommit.ts): 환경 변수의 순서, git, 없으면 "dev".

import { describe, expect, it } from "vitest";
import { resolveAppCommit } from "./buildCommit";

const SHA_A = "abc1234def5678abc1234def5678abc1234def56";
const SHA_B = "0123456789abcdef0123456789abcdef01234567";

describe("resolveAppCommit", () => {
  it("GITHUB_SHA 가 CF_PAGES_COMMIT_SHA 와 git 보다 먼저다. 앞 일곱 자리", () => {
    let asked = 0;
    const git = () => {
      asked++;
      return "fffffff";
    };
    expect(resolveAppCommit({ GITHUB_SHA: SHA_A, CF_PAGES_COMMIT_SHA: SHA_B }, git)).toBe("abc1234");
    expect(resolveAppCommit({ CF_PAGES_COMMIT_SHA: SHA_B }, git)).toBe("0123456");
    expect(asked).toBe(0);
  });

  it("환경 변수가 비었으면 git, git 도 없거나 실패하면 dev", () => {
    expect(resolveAppCommit({ GITHUB_SHA: " ", CF_PAGES_COMMIT_SHA: "" }, () => "b7cb745\n")).toBe("b7cb745");
    expect(resolveAppCommit({}, () => null)).toBe("dev");
    expect(resolveAppCommit({}, () => "")).toBe("dev");
    expect(
      resolveAppCommit({}, () => {
        throw new Error("not a git repository");
      }),
    ).toBe("dev");
  });
});
