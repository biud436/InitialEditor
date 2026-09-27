// 새 스크립트 템플릿 (docs/plans/e1-scripting.md 마일스톤 1). 엔진이 부르는 씬 계약 함수(Lua Initialize, Update,
// Render, Destroy, Ruby init, update, render, destroy)를 가진 진입점과, 씬이 오브젝트에 붙여 (obj, scene) 을 넘기는
// 컴포넌트(함수 이름은 언어 중립 이름 init, update, render, destroy) 두 가지. 순수 함수라 Node 로 테스트한다.

import type { SceneHook } from "./apiSpec";
import { EMPTY_SPEC, hookName } from "./apiSpec";

export type TemplateLanguage = "lua" | "ruby";
export type TemplateKind = "scene" | "component";

export interface TemplateOptions {
  language: TemplateLanguage;
  kind: TemplateKind;
  /** 파일 이름 (확장자 없이). 컴포넌트는 이것을 PascalCase 로 바꿔 테이블과 클래스 이름으로 쓴다 */
  name: string;
  /** 씬 계약 (명세에서). 없으면 엔진 기본 네 함수 */
  hooks?: SceneHook[];
}

export const TEMPLATE_LABELS: Record<TemplateKind, string> = {
  scene: "씬 (진입점, 계약 네 함수)",
  component: "컴포넌트 (오브젝트에 붙는 모듈)",
};

export const LANGUAGE_LABELS: Record<TemplateLanguage, string> = { lua: "Lua", ruby: "Ruby (mruby)" };

export const SCRIPT_DIRS: Record<TemplateLanguage, string> = { lua: "scripts/lua", ruby: "scripts/ruby" };
export const SCRIPT_EXT: Record<TemplateLanguage, string> = { lua: "lua", ruby: "rb" };

/** "player_ship" 이나 "player-ship" 이나 "games/flappy" 를 "PlayerShip", "Flappy" 로 */
export function pascalCase(name: string): string {
  const last = name.split("/").filter(Boolean).pop() ?? name;
  const words = last.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const joined = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
  if (!joined) return "Component";
  return /^[A-Za-z_]/.test(joined) ? joined : `_${joined}`;
}

function hooksOf(options: TemplateOptions): SceneHook[] {
  const hooks = options.hooks && options.hooks.length ? options.hooks : EMPTY_SPEC.sceneContract;
  return hooks;
}

export function scriptTemplate(options: TemplateOptions): string {
  const hooks = hooksOf(options);
  if (options.language === "lua") return options.kind === "scene" ? luaScene(options.name, hooks) : luaComponent(pascalCase(options.name), hooks);
  return options.kind === "scene" ? rubyScene(options.name, hooks) : rubyComponent(pascalCase(options.name), hooks);
}

/** 진입점에 쓸 씬 함수: 그 언어의 엔진 이름이 있는 것만 */
function sceneHooks(hooks: SceneHook[], lang: TemplateLanguage): Array<{ name: string; hook: SceneHook }> {
  return hooks.flatMap((hook) => {
    const name = hookName(hook, lang);
    return name ? [{ name, hook }] : [];
  });
}

function luaScene(name: string, hooks: SceneHook[]): string {
  const list = sceneHooks(hooks, "lua");
  const body = list.map(({ name: fn, hook }) => `function ${fn}(${hook.params.map((p) => p.name).join(", ")})\nend\n`).join("\n");
  const required = list.filter(({ hook }) => hook.luaRequired).map(({ name: fn }) => fn);
  const rule = required.length ? `\n-- 필수 함수 (엔진이 정의 여부를 확인하지 않고 호출): ${required.join(", ")}` : "";
  return `-- ${name}: 엔진이 호출하는 씬 계약 전역 함수 (${list.map((h) => h.name).join(", ")}).${rule}\n\n${body}`;
}

function luaComponent(table: string, hooks: SceneHook[]): string {
  const body = hooks
    .map((h) => {
      const params = ["obj", "scene", ...h.params.map((p) => p.name)].join(", ");
      return `function ${table}.${h.name}(${params})\nend\n`;
    })
    .join("\n");
  return `-- ${table} 컴포넌트. 씬이 오브젝트(obj)에 붙여 계약 함수를 부른다.\n\nlocal ${table} = {}\n\n${body}\nreturn ${table}\n`;
}

function rubyScene(name: string, hooks: SceneHook[]): string {
  const list = sceneHooks(hooks, "ruby");
  const body = list
    .map(({ name: fn, hook }) => {
      const params = hook.params.map((p) => p.name).join(", ");
      return `def ${fn}${params ? `(${params})` : ""}\nend\n`;
    })
    .join("\n");
  return `# ${name}: 엔진이 호출하는 씬 계약 메서드 (${list.map((h) => h.name).join(", ")}). 정의된 것만 호출.\n\n${body}`;
}

function rubyComponent(klass: string, hooks: SceneHook[]): string {
  const body = hooks
    .map((h) => {
      const params = ["obj", "scene", ...h.params.map((p) => p.name)].join(", ");
      return `  def ${h.name}(${params})\n  end\n`;
    })
    .join("\n");
  return `# ${klass} 컴포넌트. 씬이 오브젝트(obj)에 붙여 계약 메서드를 부른다.\n\nclass ${klass}\n${body}end\n`;
}

/** 파일 이름 검사: 비어 있지 않고, 확장자 없이, `..` 없이, 하위 폴더는 허용 */
export function validateScriptName(value: string): string | null {
  const v = value.trim();
  if (!v) return "이름을 적는다";
  if (/\\/.test(v)) return "폴더 구분은 / 로 적는다";
  if (v.split("/").some((seg) => seg === "" || seg === "." || seg === "..")) return "경로 조각이 비었거나 . 이나 .. 이다";
  if (/\.(lua|rb)$/i.test(v)) return "확장자는 붙이지 않는다 (언어에 따라 붙는다)";
  if (!/^[A-Za-z0-9_\-./]+$/.test(v)) return "영문, 숫자, _, -, / 만 쓴다";
  return null;
}

/** 이름과 언어로 저장 경로를 만든다: scripts/lua/games/flappy.lua */
export function scriptPathFor(language: TemplateLanguage, name: string): string {
  const clean = name.trim().replace(/^\/+|\/+$/g, "");
  return `${SCRIPT_DIRS[language]}/${clean}.${SCRIPT_EXT[language]}`;
}
