// 테스트용 작은 API 명세. 진짜 파일(resources/api/initial2d-api.json)과 같은 모양이며 그 파일에 기대지 않는다.
// SPEC_FIXTURE 는 두 언어 공통 키, LANG_SPEC_FIXTURE 는 언어별 키(luaParams, rubyReturns, default 등)를 쓴다.

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
      luaStyle: "handle",
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
    { name: "init", lua: "Initialize", ruby: "init", params: [], doc: "처음 한 번", luaRequired: true },
    { name: "update", lua: "Update", ruby: "update", params: [{ name: "elapsed_ms", type: "number" }], doc: "고정 스텝마다", luaRequired: true },
    { name: "render", lua: "Render", ruby: "render", params: [], doc: "매 프레임", luaRequired: true },
    { name: "destroy", lua: "Destroy", ruby: "destroy", params: [], doc: "끝날 때", luaRequired: true },
  ],
};

const LOOP_DOC = "true 무한 반복, false 한 번";

/** 언어별 키를 쓰는 명세 (항목은 진짜 명세 항목의 축약) */
export const LANG_SPEC_FIXTURE = {
  version: 1,
  engine: "Initial2D",
  generatedFrom: "테스트 픽스처",
  types: ["number", "integer", "string", "boolean", "table", "any", "nil", "symbol", "Tilemap"],
  modules: [
    {
      name: "Graphics",
      lua: null,
      ruby: "Graphics",
      doc: "그리기",
      functions: [
        {
          lua: "draw_set_color",
          ruby: "set_color",
          params: [{ name: "r", type: "integer" }, { name: "g", type: "integer" }, { name: "b", type: "integer" }, { name: "a", type: "integer", optional: true, default: 255 }],
          luaParams: [{ name: "r", type: "integer" }, { name: "g", type: "integer" }, { name: "b", type: "integer" }, { name: "a", type: "integer" }],
          returns: "nil",
          luaReturns: "number",
          doc: "점의 색",
          rubyKind: "method",
        },
        { lua: "DrawText", ruby: "draw_text", params: [{ name: "x", type: "number" }, { name: "y", type: "number" }, { name: "text", type: "string" }], returns: "number", rubyReturns: "integer", doc: "글자를 그린다", rubyKind: "method" },
        { lua: "draw_text", ruby: null, params: [{ name: "x", type: "number" }, { name: "y", type: "number" }, { name: "text", type: "string" }], returns: "number", doc: "DrawText 의 별명", alias: true, aliasOf: "DrawText" },
      ],
    },
    {
      name: "System",
      lua: null,
      ruby: "System",
      doc: "시스템",
      functions: [
        { lua: "GetCurrentDirectory", ruby: "current_directory", params: [], luaParams: [{ name: "slash", type: "any", optional: true, doc: "주면 / 구분자" }], returns: "string", doc: "작업 디렉터리", rubyKind: "getter" },
        { lua: "MessageBox", ruby: "message_box", params: [{ name: "text", type: "string" }, { name: "caption", type: "string", optional: true, default: "", doc: "제목" }], returns: "nil", doc: "메시지 상자", rubyKind: "method" },
      ],
    },
    {
      name: "Kernel",
      lua: null,
      ruby: "Kernel",
      doc: "전역",
      functions: [{ lua: "print", ruby: null, params: [{ name: "...", type: "any", variadic: true }], returns: "nil", doc: "찍는다" }],
    },
    {
      name: "Input",
      lua: "Input",
      ruby: "Input",
      doc: "입력",
      functions: [
        { lua: "IsKeyDown", ruby: "key_down?", params: [{ name: "key", type: "integer", rubyType: "integer|symbol", doc: "가상 키 코드" }], returns: "boolean", doc: "눌렸다", rubyKind: "predicate" },
        { lua: null, ruby: "trigger?", params: [{ name: "key", type: "integer", rubyType: "integer|symbol" }], returns: "boolean", doc: "key_down? 의 별명", rubyKind: "predicate", alias: true, aliasOf: "key_down?" },
        { lua: "GetTouch", ruby: "touch", params: [{ name: "index", type: "integer" }], returns: "array|nil", luaReturns: ["integer|nil", "number", "number", "string"], doc: "손가락 하나", rubyKind: "method" },
        { lua: null, ruby: "touches", params: [], returns: "array[]", doc: "손가락 전부", rubyKind: "getter", prelude: true },
      ],
    },
    {
      name: "Audio",
      lua: "Audio",
      ruby: "Audio",
      doc: "소리",
      functions: [
        {
          lua: "PlayMusic",
          ruby: "play_music",
          params: [{ name: "path", type: "string" }, { name: "id", type: "string" }, { name: "loop", type: "boolean|integer", doc: LOOP_DOC }],
          rubyParams: [{ name: "path", type: "string" }, { name: "id", type: "string" }, { name: "loop", type: "boolean|integer", optional: true, default: true, doc: LOOP_DOC }],
          returns: "nil",
          rubyReturns: "boolean",
          doc: "배경 음악",
          rubyKind: "method",
        },
      ],
    },
  ],
  classes: [
    {
      name: "Tilemap",
      lua: "Tilemap",
      ruby: "Tilemap",
      doc: "맵",
      luaStyle: "handle",
      constructors: [{ lua: "Tilemap.Load", ruby: "Tilemap.load", params: [{ name: "path", type: "string" }], returns: "Tilemap|nil", luaReturns: ["Tilemap|nil", "string|nil"], doc: "맵을 읽는다", prelude: true }],
      methods: [
        {
          lua: "Draw",
          ruby: "draw",
          params: [{ name: "layer_from", type: "integer" }, { name: "layer_to", type: "integer" }, { name: "cam_x", type: "integer", optional: true, default: 0, doc: "월드 픽셀" }],
          returns: "nil",
          rubyReturns: "Tilemap",
          doc: "레이어를 그린다",
          rubyKind: "method",
        },
        { lua: "SetRect", ruby: "set_rect", params: [{ name: "x", type: "integer" }, { name: "y", type: "integer" }], overloads: [[{ name: "rect", type: "table", doc: "x, y 를 가진 표" }]], returns: "nil", rubyReturns: "Tilemap", doc: "사각형", rubyKind: "method" },
      ],
    },
    {
      name: "Plain",
      lua: "Plain",
      ruby: "Plain",
      doc: "핸들 방식이 아닌 클래스",
      constructors: [],
      methods: [{ lua: "Reset", ruby: "reset", params: [], returns: "nil", doc: "되돌린다", rubyKind: "method" }],
    },
  ],
  constants: [{ module: "Keys", lua: null, ruby: "Keys", doc: "키", names: ["SPACE", "F1"], values: { SPACE: 32, F1: 112 } }],
  sceneContract: [
    { name: "init", lua: "Initialize", ruby: "init", params: [], doc: "처음 한 번", luaRequired: true },
    { name: "update", lua: "Update", ruby: "update", params: [{ name: "elapsed_ms", type: "number" }], doc: "고정 스텝마다", luaRequired: true },
    { name: "render", lua: "Render", ruby: "render", params: [], doc: "매 프레임", luaRequired: true },
    { name: "destroy", lua: "Destroy", ruby: "destroy", params: [], doc: "끝날 때", luaRequired: true },
    { name: "lua_only", lua: "LuaOnly", ruby: null, params: [], doc: "Lua 에만 있는 함수" },
  ],
};
