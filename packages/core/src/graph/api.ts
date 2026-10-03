// 엔진 API 노드: 엔진 API 명세(resources/api/initial2d-api.json)에서 그래프에 올리는 함수와 두 언어의 이름.
// 명세와 같은지는 api.test.ts 가 템플릿의 명세 사본과 대조한다.

export type ApiParamType = "number" | "integer" | "string" | "boolean" | "key" | "button";

export interface ApiParam {
  key: string;
  label: string;
  type: ApiParamType;
  default?: unknown;
  /** 상수 칸이 비었을 때 보이는 예 */
  placeholder?: string;
  /** 파일 경로 (검사가 빈 값과 폴더 경로를 오류로 본다) */
  file?: boolean;
  /** 이 상수가 빈 문자열이면 대신 넘길 다른 입력 (효과음의 이름이 비면 파일 경로) */
  emptyUses?: string;
}

export interface ApiNodeDef {
  /** 노드의 fn: "Input.IsKeyDown" (Lua 전역 함수는 명세의 모듈 이름을 앞에 붙인다: "Graphics.WindowWidth") */
  id: string;
  label: string;
  /** Lua 에서 부르는 이름 ("Input.IsKeyDown", 전역이면 "WindowWidth") */
  lua: string;
  /** Ruby 에서 부르는 이름 ("Input.key_down?") */
  ruby: string;
  /** Ruby 의 모양: getter 는 괄호 없이, setter 는 대입 */
  rubyKind: "getter" | "method" | "predicate" | "setter";
  params: ApiParam[];
  /** 있으면 값 노드, 없으면 실행 노드 */
  returns?: "number" | "integer" | "boolean" | "string";
}

const key: ApiParam = { key: "key", label: "키", type: "key", default: "SPACE" };
const button: ApiParam = { key: "button", label: "버튼", type: "button", default: "left" };
// 엔진은 파일을 읽어 이름(id)으로 기억하고 다시 부를 때 그 이름으로 찾는다. 이름을 비우면 파일 경로를 이름으로 쓴다.
// 반복은 SDL_mixer 의 값 그대로라 효과음은 추가 반복 횟수(0이면 한 번), 음악은 재생 횟수다
const audioArgs = (loop: ApiParam): ApiParam[] => [
  { key: "path", label: "파일 경로", type: "string", placeholder: "./resources/audio/flap.wav", file: true },
  { key: "id", label: "이름 (비우면 파일 경로)", type: "string", default: "", emptyUses: "path" },
  loop,
];
const soundArgs = audioArgs({ key: "loop", label: "추가 반복 (0이면 한 번, -1이면 무한)", type: "integer", default: 0 });
const musicArgs = audioArgs({ key: "loop", label: "재생 횟수 (-1이면 무한)", type: "integer", default: -1 });

export const API_NODES: readonly ApiNodeDef[] = [
  { id: "Graphics.WindowWidth", label: "화면 너비", lua: "WindowWidth", ruby: "Graphics.width", rubyKind: "getter", params: [], returns: "integer" },
  { id: "Graphics.WindowHeight", label: "화면 높이", lua: "WindowHeight", ruby: "Graphics.height", rubyKind: "getter", params: [], returns: "integer" },
  { id: "Graphics.GetTextWidth", label: "텍스트 너비", lua: "GetTextWidth", ruby: "Graphics.text_width", rubyKind: "method", params: [{ key: "text", label: "텍스트", type: "string", default: "" }], returns: "number" },
  {
    id: "Graphics.DrawText",
    label: "텍스트 그리기",
    lua: "DrawText",
    ruby: "Graphics.draw_text",
    rubyKind: "method",
    params: [
      { key: "x", label: "x", type: "number", default: 0 },
      { key: "y", label: "y", type: "number", default: 0 },
      { key: "text", label: "텍스트", type: "string", default: "" },
    ],
  },
  { id: "Input.IsKeyDown", label: "키 누름 (이번 틱)", lua: "Input.IsKeyDown", ruby: "Input.key_down?", rubyKind: "predicate", params: [key], returns: "boolean" },
  { id: "Input.IsKeyUp", label: "키 해제 (이번 틱)", lua: "Input.IsKeyUp", ruby: "Input.key_up?", rubyKind: "predicate", params: [key], returns: "boolean" },
  { id: "Input.IsKeyPress", label: "키 누르고 있음", lua: "Input.IsKeyPress", ruby: "Input.key_press?", rubyKind: "predicate", params: [key], returns: "boolean" },
  { id: "Input.IsAnyKeyDown", label: "아무 키 누름 (이번 틱)", lua: "Input.IsAnyKeyDown", ruby: "Input.any_key_down?", rubyKind: "predicate", params: [], returns: "boolean" },
  { id: "Input.IsMouseDown", label: "마우스 버튼 누름 (이번 틱)", lua: "Input.IsMouseDown", ruby: "Input.mouse_down?", rubyKind: "predicate", params: [button], returns: "boolean" },
  { id: "Input.IsMouseUp", label: "마우스 버튼 해제 (이번 틱)", lua: "Input.IsMouseUp", ruby: "Input.mouse_up?", rubyKind: "predicate", params: [button], returns: "boolean" },
  { id: "Input.IsMousePress", label: "마우스 버튼 누르고 있음", lua: "Input.IsMousePress", ruby: "Input.mouse_press?", rubyKind: "predicate", params: [button], returns: "boolean" },
  { id: "Input.GetMouseX", label: "마우스 x", lua: "Input.GetMouseX", ruby: "Input.mouse_x", rubyKind: "getter", params: [], returns: "number" },
  { id: "Input.GetMouseY", label: "마우스 y", lua: "Input.GetMouseY", ruby: "Input.mouse_y", rubyKind: "getter", params: [], returns: "number" },
  { id: "Audio.PlaySound", label: "효과음 재생", lua: "Audio.PlaySound", ruby: "Audio.play_sound", rubyKind: "method", params: soundArgs },
  { id: "Audio.PlayMusic", label: "배경 음악 재생", lua: "Audio.PlayMusic", ruby: "Audio.play_music", rubyKind: "method", params: musicArgs },
  { id: "Audio.StopMusic", label: "배경 음악 정지", lua: "Audio.StopMusic", ruby: "Audio.stop_music", rubyKind: "method", params: [] },
  { id: "Audio.PauseMusic", label: "배경 음악 일시 정지", lua: "Audio.PauseMusic", ruby: "Audio.pause_music", rubyKind: "method", params: [] },
  { id: "Audio.ResumeMusic", label: "배경 음악 재개", lua: "Audio.ResumeMusic", ruby: "Audio.resume_music", rubyKind: "method", params: [] },
  { id: "Audio.FadeOutMusic", label: "배경 음악 페이드 아웃", lua: "Audio.FadeOutMusic", ruby: "Audio.fade_out_music", rubyKind: "method", params: [{ key: "ms", label: "시간 (ms)", type: "integer", default: 1000 }] },
  { id: "Audio.SetVolume", label: "배경 음악 볼륨", lua: "Audio.SetVolume", ruby: "Audio.volume=", rubyKind: "setter", params: [{ key: "volume", label: "볼륨 (0 ~ 255)", type: "integer", default: 255 }] },
  { id: "Audio.IsPlayingMusic", label: "배경 음악 재생 중", lua: "Audio.IsPlayingMusic", ruby: "Audio.playing_music?", rubyKind: "predicate", params: [], returns: "boolean" },
  { id: "System.GameExit", label: "게임 종료", lua: "GameExit", ruby: "System.exit", rubyKind: "method", params: [] },
];

export function apiNode(id: string): ApiNodeDef | undefined {
  return API_NODES.find((a) => a.id === id);
}

/** 키 이름 (엔진 Keys 상수)과 가상 키 코드. Lua 는 코드, Ruby 는 이름의 소문자 Symbol 로 쓴다 */
export const KEY_CODES: Readonly<Record<string, number>> = {
  BACKSPACE: 8, TAB: 9, ENTER: 13, SHIFT: 16, CTRL: 17, ALT: 18, PAUSE: 19, ESCAPE: 27, SPACE: 32,
  PAGE_UP: 33, PAGE_DOWN: 34, END: 35, HOME: 36, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, INSERT: 45, DELETE: 46,
  DIGIT0: 48, DIGIT1: 49, DIGIT2: 50, DIGIT3: 51, DIGIT4: 52, DIGIT5: 53, DIGIT6: 54, DIGIT7: 55, DIGIT8: 56, DIGIT9: 57,
  A: 65, B: 66, C: 67, D: 68, E: 69, F: 70, G: 71, H: 72, I: 73, J: 74, K: 75, L: 76, M: 77,
  N: 78, O: 79, P: 80, Q: 81, R: 82, S: 83, T: 84, U: 85, V: 86, W: 87, X: 88, Y: 89, Z: 90,
  F1: 112, F2: 113, F3: 114, F4: 115, F5: 116, F6: 117, F7: 118, F8: 119, F9: 120, F10: 121, F11: 122, F12: 123,
};

/** 마우스 버튼 이름과 번호 (엔진: 0 왼쪽, 1 오른쪽, 2 가운데) */
export const MOUSE_BUTTONS: Readonly<Record<string, number>> = { left: 0, right: 1, middle: 2 };
