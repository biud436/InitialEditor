// 새 스크립트 템플릿 (docs/plans/e1-scripting.md 마일스톤 1). 엔진이 부르는 씬 계약 함수(Lua Initialize, Update,
// Render, Destroy, Ruby init, update, render, destroy)를 가진 진입점과, 씬이 오브젝트에 붙여 (obj, scene) 을 넘기는
// 컴포넌트(함수 이름은 언어 중립 이름 init, update, render, destroy) 두 가지. 컴포넌트는 매개변수(params)도 받는다:
// Lua 는 훅의 마지막 인자, Ruby 는 initialize 의 인자. 순수 함수라 Node 로 테스트한다.

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
  scene: "씬 스크립트 (진입점, 씬 계약 함수)",
  component: "컴포넌트 (오브젝트에 추가하는 스크립트)",
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

/** 생성하는 컴포넌트의 머리 주석 둘째 줄: params 가 무엇인가 */
const PARAMS_NOTE = (comment: string) => `${comment} params 는 매개변수 선언(scripts/<논리 이름>.json)의 기본값에 씬 오브젝트의 값을 덮은 것이다.`; // terms-ok: 생성하는 스크립트의 주석은 문장형

function luaComponent(table: string, hooks: SceneHook[]): string {
  const body = hooks
    .map((h) => {
      const params = ["obj", "scene", ...h.params.map((p) => p.name), "params"].join(", ");
      return `function ${table}.${h.name}(${params})\nend\n`;
    })
    .join("\n");
  return `-- ${table} 컴포넌트. 씬이 이 컴포넌트가 추가된 오브젝트(obj)마다 계약 함수를 호출한다.\n${PARAMS_NOTE("--")}\n\nlocal ${table} = {}\n\n${body}\nreturn ${table}\n`; // terms-ok: 생성하는 스크립트의 주석은 문장형
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
  const init = `  def initialize(params = {})\n    @params = params\n  end\n`;
  return `# ${klass} 컴포넌트. 씬이 이 컴포넌트가 추가된 오브젝트(obj)마다 계약 메서드를 호출한다.\n${PARAMS_NOTE("#")}\n\nclass ${klass}\n${init}\n${body}end\n`; // terms-ok: 생성하는 스크립트의 주석은 문장형
}

/** 파일 이름 검사: 비어 있지 않고, 확장자 없이, `..` 없이, 하위 폴더는 허용 */
export function validateScriptName(value: string): string | null {
  const v = value.trim();
  if (!v) return "이름 비어 있음";
  if (/\\/.test(v)) return "폴더 구분자는 / 만 허용 (\\ 불가)";
  if (v.split("/").some((seg) => seg === "" || seg === "." || seg === "..")) return "비어 있거나 점(.) 또는 두 점(..)인 경로 구성 요소가 있습니다";
  if (/\.(lua|rb)$/i.test(v)) return "확장자 불필요 (언어에 따라 .lua 또는 .rb 자동 추가)";
  if (!/^[A-Za-z0-9_\-./]+$/.test(v)) return "영문, 숫자, _, -, / 만 허용";
  return null;
}

/** 이름과 언어로 저장 경로를 만든다: scripts/lua/games/flappy.lua */
export function scriptPathFor(language: TemplateLanguage, name: string): string {
  const clean = name.trim().replace(/^\/+|\/+$/g, "");
  return `${SCRIPT_DIRS[language]}/${clean}.${SCRIPT_EXT[language]}`;
}
