// 빌드 도장 __APP_COMMIT__ 을 고른다 (docs/plans/e6-packaging.md 9절). vite.config.ts 가 빌드할 때 부른다.
// GitHub Actions 의 GITHUB_SHA > Cloudflare Pages 의 CF_PAGES_COMMIT_SHA > git rev-parse > "dev". 앞 일곱 자리.

export const COMMIT_ENV_KEYS = ["GITHUB_SHA", "CF_PAGES_COMMIT_SHA"] as const;

export function resolveAppCommit(env: Record<string, string | undefined>, git: () => string | null): string {
  for (const key of COMMIT_ENV_KEYS) {
    const value = env[key]?.trim();
    if (value) return value.slice(0, 7);
  }
  let head: string | null = null;
  try {
    head = git()?.trim() || null;
  } catch {
    head = null;
  }
  return head ? head.slice(0, 7) : "dev";
}
