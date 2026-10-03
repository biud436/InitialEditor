// LuaLS 가 workspace/configuration 으로 묻는 설정 (docs/plans/language-server.md 5절).
// 규칙의 원본은 엔진 템플릿의 .luarc.json(resources/templates/luarc.json, tools/gen_api_stubs.py 가 쓴다)이다.
// 프로젝트에 .luarc.json 이 있으면 LuaLS 는 그 파일을 이 답보다 먼저 쓰므로, 이 답은 그 파일이 없는 프로젝트를 위한 것이다.

import luarcText from "../../../../templates/resources/templates/luarc.json?raw";

/** 엔진 API 스텁이 프로젝트 안에 있는 자리 */
export const PROJECT_STUB = "resources/api/initial2d.lua";
export const PROJECT_LUARC = ".luarc.json";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** "runtime.version": "Lua 5.3" 같은 점 이름 키를 겹친 객체로 */
export function nestDotted(flat: Record<string, Json>): Record<string, Json> {
  const out: Record<string, Json> = {};
  for (const [key, value] of Object.entries(flat)) {
    if (key.startsWith("$")) continue;
    const parts = key.split(".");
    let node = out;
    for (const part of parts.slice(0, -1)) {
      const next = node[part];
      if (!next || typeof next !== "object" || Array.isArray(next)) node[part] = {};
      node = node[part] as Record<string, Json>;
    }
    node[parts[parts.length - 1]] = value;
  }
  return out;
}

/** 템플릿 .luarc.json 의 규칙 (점 이름 그대로) */
export const TEMPLATE_LUARC: Record<string, Json> = JSON.parse(luarcText) as Record<string, Json>;

/**
 * 설정의 "Lua" 갈래. library 는 스텁의 절대 경로들이다 (템플릿의 상대 경로 대신 쓴다).
 * 다른 엔진용 라이브러리를 찾지 않고(checkThirdParty), 원격 보고와 인레이 힌트를 끈다
 */
export function luaSection(library: string[]): Record<string, Json> {
  const flat: Record<string, Json> = { ...TEMPLATE_LUARC, "workspace.library": library, "workspace.checkThirdParty": false, "telemetry.enable": false, "hint.enable": false };
  return nestDotted(flat);
}

/** 서버가 묻는 갈래마다의 답. 모르는 갈래는 null (서버의 기본값) */
export function configurationFor(section: string, library: string[]): unknown {
  switch (section) {
    case "Lua":
      return luaSection(library);
    case "files.associations":
    case "files.exclude":
      return {};
    case "editor.semanticHighlighting.enabled":
      return false;
    case "editor.acceptSuggestionOnEnter":
      return "on";
    default:
      return null;
  }
}
