// 테스트용 작은 API 명세. 진짜 파일(resources/api/initial2d-api.json)과 같은 모양이며 그 파일에 기대지 않는다.

export const SPEC_FIXTURE = {
  version: 1,
  modules: [
    {
      name: "Graphics",
      lua: null,
      ruby: "Graphics",
      doc: "그리기",
      functions: [
        { lua: "DrawText", ruby: "draw_text", params: [{ name: "x", type: "number" }, { name: "y", type: "number" }, { name: "text", type: "string" }], returns: "nil", doc: "글자를 그린다" },
        { lua: "WindowWidth", ruby: "width", params: [], returns: "number", doc: "창 너비", rubyKind: "getter" },
        { lua: "SetRenderScale", ruby: "render_scale=", params: [{ name: "n", type: "number" }], returns: "nil", rubyKind: "setter" },
        { lua: null, ruby: "env", params: [{ name: "name" }], returns: "string" },
        { lua: "LoadScript", ruby: null, params: [{ name: "path" }], returns: "nil" },
      ],
    },
    {
      name: "Input",
      lua: "Input",
      ruby: "Input",
      doc: "입력",
      functions: [
        { lua: "IsKeyDown", ruby: "key_down?", params: [{ name: "key", type: "key" }], returns: "boolean", doc: "눌렸다", rubyKind: "predicate" },
        { lua: null, ruby: "press?", params: [{ name: "key", type: "key" }], returns: "boolean", rubyKind: "predicate", alias: true },
        { lua: "GetMouseX", ruby: "mouse_x", params: [], returns: "number", rubyKind: "getter" },
      ],
    },
  ],
  classes: [
    {
      name: "Sprite",
      lua: "Sprite",
      ruby: "Sprite",
      doc: "스프라이트",
      constructors: [{ lua: "Sprite.Create", ruby: "Sprite.new", params: [{ name: "x" }, { name: "y" }], returns: "Sprite", doc: "만든다" }],
      methods: [
        { lua: "SetPosition", ruby: "set_position", params: [{ name: "x" }, { name: "y" }], returns: "nil", doc: "위치" },
        { lua: "GetVisible", ruby: "visible?", params: [], returns: "boolean" },
        { lua: "Draw", ruby: "draw", params: [], returns: "nil" },
      ],
    },
  ],
  constants: [{ module: "Keys", ruby: "Keys", doc: "키 이름", names: ["A", "SPACE", "F1"] }],
  sceneContract: [
    { name: "init", params: [] },
    { name: "update", params: [{ name: "elapsed_ms", type: "number" }] },
    { name: "render", params: [] },
    { name: "destroy", params: [] },
  ],
};
