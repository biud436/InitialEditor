// CSS 토큰(tokens.css)을 Monaco 테마로 옮기는 순수 함수 (02-scope-and-screens.md 6절 "토큰이 닿아야 하는 곳").
// 색 리터럴은 여기 없다. 값은 getComputedStyle 로 읽은 토큰에서만 오고, 토큰이 비어 있으면 그 항목을 빼서
// Monaco 의 기본 테마(vs, vs-dark)가 채우게 둔다. DOM 을 받지 않으므로 Node 로 테스트한다 (themeColors.test.ts).

export const THEME_TOKEN_NAMES = [
  "bg-base",
  "bg-panel",
  "bg-elevated",
  "bg-input",
  "bg-hover",
  "bg-selection",
  "fg",
  "fg-muted",
  "fg-disabled",
  "accent",
  "danger",
  "warning",
  "success",
  "border",
  "focus-ring",
] as const;

export type ThemeTokenName = (typeof THEME_TOKEN_NAMES)[number];
export type ThemeTokens = Partial<Record<ThemeTokenName, string>>;

export interface StyleReader {
  getPropertyValue(name: string): string;
}

/** getComputedStyle(document.documentElement) 에서 토큰을 읽는다. 빈 값은 뺀다 */
export function readThemeTokens(style: StyleReader): ThemeTokens {
  const out: ThemeTokens = {};
  for (const name of THEME_TOKEN_NAMES) {
    const value = style.getPropertyValue(`--${name}`).trim();
    if (value) out[name] = value;
  }
  return out;
}

function hex2(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
}

/**
 * CSS 색을 Monaco 가 받는 "#rrggbb" 또는 "#rrggbbaa" 로. 짧은 hex(#rgb, #rgba), 긴 hex, 그리고 rgb 와 rgba 함수 꼴을 받고
 * 그 밖(이름 색, var())은 null.
 */
export function toHex(css: string): string | null {
  const value = css.trim().toLowerCase();
  if (value.startsWith("#")) {
    const digits = value.slice(1);
    if (!/^[0-9a-f]+$/.test(digits)) return null;
    if (digits.length === 3 || digits.length === 4) {
      return "#" + [...digits].map((d) => d + d).join("");
    }
    if (digits.length === 6 || digits.length === 8) return "#" + digits;
    return null;
  }
  const m = /^rgba?\(\s*([^)]+)\)$/.exec(value);
  if (!m) return null;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  const channel = (p: string) => (p.endsWith("%") ? (parseFloat(p) / 100) * 255 : parseFloat(p));
  const rgb = parts.slice(0, 3).map(channel);
  if (rgb.some((n) => Number.isNaN(n))) return null;
  let out = "#" + rgb.map(hex2).join("");
  if (parts.length === 4) {
    const a = parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
    if (Number.isNaN(a)) return null;
    out += hex2(a * 255);
  }
  return out;
}

/** 불투명한 색에 알파를 얹는다 (0..1). 이미 알파가 있으면 바꾼다 */
export function withAlpha(css: string, alpha: number): string | null {
  const hex = toHex(css);
  if (!hex) return null;
  return hex.slice(0, 7) + hex2(alpha * 255);
}

export interface MonacoThemeRule {
  token: string;
  foreground?: string;
  fontStyle?: string;
}

export interface MonacoThemeData {
  base: "vs" | "vs-dark";
  inherit: true;
  rules: MonacoThemeRule[];
  colors: Record<string, string>;
}

/** 토큰 한 벌로 Monaco 테마 데이터를 짓는다. 없는 토큰의 항목은 빠진다 */
export function buildMonacoTheme(base: "vs" | "vs-dark", tokens: ThemeTokens): MonacoThemeData {
  const color = (name: ThemeTokenName): string | undefined => {
    const raw = tokens[name];
    return raw ? (toHex(raw) ?? undefined) : undefined;
  };
  const alpha = (name: ThemeTokenName, a: number): string | undefined => {
    const raw = tokens[name];
    return raw ? (withAlpha(raw, a) ?? undefined) : undefined;
  };
  const colors: Record<string, string | undefined> = {
    "editor.background": color("bg-panel"),
    "editor.foreground": color("fg"),
    "editorGutter.background": color("bg-panel"),
    "editorLineNumber.foreground": color("fg-disabled"),
    "editorLineNumber.activeForeground": color("fg-muted"),
    "editorCursor.foreground": color("accent"),
    "editor.selectionBackground": color("bg-selection"),
    "editor.inactiveSelectionBackground": alpha("bg-selection", 0.6),
    "editor.selectionHighlightBackground": alpha("accent", 0.2),
    "editor.wordHighlightBackground": alpha("accent", 0.2),
    "editor.wordHighlightStrongBackground": alpha("accent", 0.3),
    "editor.lineHighlightBackground": alpha("bg-hover", 0.35),
    "editor.lineHighlightBorder": alpha("bg-hover", 0),
    "editor.findMatchBackground": alpha("warning", 0.55),
    "editor.findMatchHighlightBackground": alpha("warning", 0.25),
    "editorBracketMatch.background": alpha("accent", 0.2),
    "editorBracketMatch.border": color("accent"),
    "editorIndentGuide.background": color("border"),
    "editorIndentGuide.background1": color("border"),
    "editorIndentGuide.activeBackground": color("fg-disabled"),
    "editorIndentGuide.activeBackground1": color("fg-disabled"),
    "editorWhitespace.foreground": color("border"),
    "editorWidget.background": color("bg-elevated"),
    "editorWidget.border": color("border"),
    "editorWidget.foreground": color("fg"),
    "editorSuggestWidget.background": color("bg-elevated"),
    "editorSuggestWidget.border": color("border"),
    "editorSuggestWidget.foreground": color("fg"),
    "editorSuggestWidget.selectedBackground": color("bg-selection"),
    "editorSuggestWidget.selectedForeground": color("fg"),
    "editorSuggestWidget.highlightForeground": color("accent"),
    "editorSuggestWidget.focusHighlightForeground": color("accent"),
    "editorHoverWidget.background": color("bg-elevated"),
    "editorHoverWidget.border": color("border"),
    "editorHoverWidget.foreground": color("fg"),
    "editorError.foreground": color("danger"),
    "editorWarning.foreground": color("warning"),
    "editorInfo.foreground": color("accent"),
    "editorOverviewRuler.border": color("border"),
    "scrollbarSlider.background": alpha("fg-disabled", 0.35),
    "scrollbarSlider.hoverBackground": alpha("fg-disabled", 0.55),
    "scrollbarSlider.activeBackground": alpha("fg-disabled", 0.7),
    "minimap.background": color("bg-panel"),
    "input.background": color("bg-input"),
    "input.foreground": color("fg"),
    "input.border": color("border"),
    "input.placeholderForeground": color("fg-disabled"),
    "inputOption.activeBorder": color("accent"),
    "inputOption.activeBackground": alpha("accent", 0.3),
    "focusBorder": color("focus-ring"),
    "list.hoverBackground": color("bg-hover"),
    "list.activeSelectionBackground": color("bg-selection"),
    "list.focusBackground": color("bg-selection"),
    "menu.background": color("bg-elevated"),
    "menu.foreground": color("fg"),
    "menu.selectionBackground": color("bg-selection"),
    "menu.border": color("border"),
    "quickInput.background": color("bg-elevated"),
    "quickInput.foreground": color("fg"),
    "widget.shadow": alpha("bg-base", 0.5),
  };
  const fg = (name: ThemeTokenName): string | undefined => color(name)?.slice(1, 7);
  const ruleList: Array<[string, string | undefined, string?]> = [
    ["keyword", fg("accent")],
    ["keyword.json", fg("accent")],
    ["comment", fg("fg-muted"), "italic"],
    ["string", fg("success")],
    ["string.escape", fg("warning")],
    ["string.key.json", fg("accent")],
    ["string.value.json", fg("success")],
    ["number", fg("warning")],
    ["number.json", fg("warning")],
    ["delimiter", fg("fg-muted")],
    ["operator", fg("fg-muted")],
    ["type", fg("fg")],
    ["identifier", fg("fg")],
    ["variable", fg("fg")],
    ["tag", fg("accent")],
    ["attribute.name", fg("warning")],
  ];
  const rules: MonacoThemeRule[] = [];
  for (const [token, foreground, fontStyle] of ruleList) {
    if (!foreground) continue;
    const rule: MonacoThemeRule = { token, foreground };
    if (fontStyle) rule.fontStyle = fontStyle;
    rules.push(rule);
  }
  const defined: Record<string, string> = {};
  for (const [key, value] of Object.entries(colors)) if (value) defined[key] = value;
  return { base, inherit: true, rules, colors: defined };
}
