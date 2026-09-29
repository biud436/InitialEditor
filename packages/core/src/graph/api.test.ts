import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { API_NODES, KEY_CODES } from "./api";

// 에디터가 번들한 엔진 API 명세 (scripts/sync-engine-templates.mjs 가 엔진에서 가져온다)
const SPEC = JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "app", "templates", "resources", "api", "initial2d-api.json"), "utf8")) as {
  modules: { name: string; lua: string | null; ruby: string | null; functions: { lua: string | null; ruby: string | null; params: { name: string }[]; returns: string; rubyKind?: string }[] }[];
  constants: { module: string; values: Record<string, number> }[];
};

describe("엔진 API 노드", () => {
  it("노드마다 명세에 같은 이름과 인자 수의 함수가 있다", () => {
    for (const node of API_NODES) {
      const [moduleName, fn] = node.id.split(".");
      const mod = SPEC.modules.find((m) => m.name === moduleName);
      expect(mod, node.id).toBeDefined();
      const f = mod!.functions.find((x) => x.lua === fn);
      expect(f, node.id).toBeDefined();
      expect(node.lua, node.id).toBe(mod!.lua ? `${mod!.lua}.${f!.lua}` : f!.lua);
      expect(node.ruby, node.id).toBe(`${mod!.ruby}.${f!.ruby}`);
      expect(node.params.length, node.id).toBe(f!.params.length);
      expect(node.rubyKind, node.id).toBe(f!.rubyKind);
      if (node.returns) expect(f!.returns, node.id).toBe(node.returns);
    }
  });

  it("키 코드는 명세의 Keys 상수 값이다", () => {
    const keys = SPEC.constants.find((c) => c.module === "Keys")!.values;
    for (const [name, code] of Object.entries(KEY_CODES)) expect(keys[name], name).toBe(code);
  });
});
