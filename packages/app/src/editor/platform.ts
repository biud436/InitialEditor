import type { Platform } from "@initial-editor/core";

/** navigator 에서 플랫폼을 고른다. mac 이면 Ctrl 이 Cmd 다 */
export function detectPlatform(nav: { platform?: string; userAgent?: string } = navigator): Platform {
  const text = `${nav.platform ?? ""} ${nav.userAgent ?? ""}`;
  if (/Mac|iPhone|iPad|iPod/i.test(text)) return "mac";
  if (/Win/i.test(text)) return "win";
  return "linux";
}
