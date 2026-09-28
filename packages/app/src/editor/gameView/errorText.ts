// 웹 엔진이 던진 것을 사람이 읽는 글로 바꾼다. WebAssembly.Exception 처럼 message 가 없는 값도 있어서
// (e as Error).message 를 그대로 쓰면 "undefined" 가 보인다. 결과는 늘 빈 글이 아니다.
// DOM 을 모른다 (실행기가 Node 테스트에서도 쓴다).

/** 로더 인스턴스 중 오류 글에 쓰는 부분. errorText 는 로더 계약을 따르는 빌드에만 있다 */
export interface ErrorTextSource {
  errorText?: (e: unknown) => string;
  module?: { getExceptionMessage?: unknown } | null;
}

const UNKNOWN = "알 수 없는 오류";

type WasmNamespace = { Exception?: new (...args: never[]) => object; RuntimeError?: new (...args: never[]) => object };

function wasm(): WasmNamespace | null {
  return typeof WebAssembly === "undefined" ? null : (WebAssembly as unknown as WasmNamespace);
}

/** C++ 예외가 wasm 밖으로 나온 값인가 (WebAssembly.Exception) */
export function isWasmException(e: unknown): boolean {
  const ns = wasm();
  if (ns?.Exception && e instanceof ns.Exception) return true;
  return !!e && typeof e === "object" && (e as object).constructor?.name === "Exception" && String(e) === "[object WebAssembly.Exception]";
}

/** Emscripten 의 getExceptionMessage([타입, 메시지]) 를 쓸 수 있으면 "타입: 메시지" */
function emscriptenMessage(e: unknown, source: ErrorTextSource | null | undefined): string | null {
  const helper = source?.module?.getExceptionMessage;
  if (typeof helper !== "function" || !isWasmException(e)) return null;
  try {
    const result = (helper as (e: unknown) => unknown)(e);
    if (Array.isArray(result)) {
      const [type, message] = result.map((s) => (typeof s === "string" ? s.trim() : ""));
      const text = [type, message].filter((s) => s.length > 0).join(": ");
      return text.length > 0 ? `C++ 예외 ${text}` : null;
    }
    return typeof result === "string" && result.trim() ? result.trim() : null;
  } catch {
    return null;
  }
}

/** 로더 없이 값만 보고 만든 글 */
export function plainErrorText(e: unknown): string {
  if (e === null || e === undefined) return `${UNKNOWN} (값 없음)`;
  if (typeof e === "string") return e.trim() || `${UNKNOWN} (빈 문자열)`;
  if (typeof e === "number" || typeof e === "bigint") return `엔진 예외 (값 ${String(e)})`;
  if (typeof e !== "object") return String(e);
  if (isWasmException(e)) return "C++ 예외 (WebAssembly.Exception, 메시지 읽기 불가)";
  const { name, message } = e as { name?: unknown; message?: unknown };
  if (typeof message === "string" && message.trim()) {
    const label = typeof name === "string" && name && name !== "Error" ? `${name}: ` : "";
    return `${label}${message.trim()}`;
  }
  if (typeof name === "string" && name.trim()) return name.trim();
  const text = String(e);
  if (text && text !== "[object Object]") return text;
  try {
    const json = JSON.stringify(e);
    if (json && json !== "{}") return json;
  } catch {
    // 순환 참조
  }
  return UNKNOWN;
}

/** 로더의 글이 값의 기본 문자열("[object WebAssembly.Exception]" 같은 것)이나 "undefined" 가 아니다 */
function isReadable(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && t !== "undefined" && !/^\[object [^\]]*\]$/.test(t);
}

/**
 * 던져진 것을 읽는 글로. 로더 인스턴스가 있으면 그 errorText, 다음은 Emscripten 의 예외 메시지 도우미,
 * 마지막은 값만 보고. 어느 것도 undefined 나 빈 글을 돌려주지 않는다.
 */
export function errorText(e: unknown, source?: ErrorTextSource | null): string {
  if (source && typeof source.errorText === "function") {
    try {
      const text = source.errorText(e);
      if (typeof text === "string" && isReadable(text)) return text.trim();
    } catch {
      // 아래로 넘어간다
    }
  }
  return emscriptenMessage(e, source) ?? plainErrorText(e);
}

// 웹 엔진 파일의 이름 (public/engine/) 과 wasm 함수 프레임
const ENGINE_STACK = /Initial2D\.(?:js|wasm)|initial2d-loader\.js|wasm-function\[|\.wasm:/;

/**
 * window 까지 올라온 오류(error 이벤트의 error 나 unhandledrejection 의 reason)가 웹 엔진에서 왔는가.
 * wasm 의 예외와 트랩은 늘 엔진이고, 그 밖은 파일 이름이나 스택에 엔진 파일이 보일 때다.
 * Emscripten 이 루프를 빠져나갈 때 던지는 "unwind" 는 오류가 아니다.
 */
export function isEngineError(e: unknown, filename?: string | null): boolean {
  if (e === "unwind") return false;
  const ns = wasm();
  if (isWasmException(e)) return true;
  if (ns?.RuntimeError && e instanceof ns.RuntimeError) return true;
  if (filename && ENGINE_STACK.test(filename)) return true;
  const stack = e && typeof e === "object" ? (e as { stack?: unknown }).stack : undefined;
  return typeof stack === "string" && ENGINE_STACK.test(stack);
}
