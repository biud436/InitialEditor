// 엔진이 던진 것을 읽는 글로: WebAssembly.Exception 처럼 message 가 없는 값도 "undefined" 가 되지 않는다.

import { describe, expect, it } from "vitest";
import { errorText, isEngineError, isWasmException, plainErrorText } from "./errorText";

function wasmException(): unknown {
  const ns = WebAssembly as unknown as { Tag: new (t: { parameters: string[] }) => object; Exception: new (tag: object, payload: unknown[]) => object };
  return new ns.Exception(new ns.Tag({ parameters: [] }), []);
}

function trap(message: string): unknown {
  return new WebAssembly.RuntimeError(message);
}

describe("errorText", () => {
  it("WebAssembly.Exception 은 message 가 없어도 읽는 글이다", () => {
    const e = wasmException();
    expect((e as Error).message).toBeUndefined();
    expect(isWasmException(e)).toBe(true);
    const text = errorText(e);
    expect(text).toContain("C++ 예외");
    expect(text).not.toContain("undefined");
  });

  it("로더의 errorText 가 있으면 그것, 비었거나 던지면 다음 길", () => {
    const e = wasmException();
    expect(errorText(e, { errorText: () => "std::runtime_error: boom" })).toBe("std::runtime_error: boom");
    expect(errorText(e, { errorText: () => "" })).toContain("C++ 예외");
    expect(errorText(e, { errorText: () => "undefined" })).toContain("C++ 예외");
    // 로더가 C++ 태그가 아닌 예외를 String(e) 로 돌려준 것은 읽는 글이 아니다
    expect(errorText(e, { errorText: () => "[object WebAssembly.Exception]" })).toContain("C++ 예외");
    expect(errorText(e, { errorText: () => "[object Object]" })).not.toContain("[object");
    expect(
      errorText(e, {
        errorText: () => {
          throw new Error("x");
        },
      }),
    ).toContain("C++ 예외");
  });

  it("Emscripten 의 getExceptionMessage 가 있으면 타입과 메시지", () => {
    const e = wasmException();
    const module = { getExceptionMessage: () => ["std::out_of_range", "vector"] };
    expect(errorText(e, { module })).toBe("C++ 예외 std::out_of_range: vector");
  });

  it("값만 보고: Error, 트랩, 글, 숫자, 빈 값, 객체", () => {
    expect(plainErrorText(new Error("파일이 없다"))).toBe("파일이 없다");
    expect(plainErrorText(trap("unreachable"))).toBe("RuntimeError: unreachable");
    expect(plainErrorText("abort")).toBe("abort");
    expect(plainErrorText(12345)).toBe("엔진 예외 (값 12345)");
    expect(plainErrorText(undefined)).toContain("알 수 없는 오류");
    expect(plainErrorText(null)).toContain("알 수 없는 오류");
    expect(plainErrorText("")).toContain("알 수 없는 오류");
    expect(plainErrorText({ status: 1 })).toBe('{"status":1}');
    expect(plainErrorText({})).toBe("알 수 없는 오류");
    const noMessage = new Error();
    expect(plainErrorText(noMessage)).toBe("Error");
    for (const v of [undefined, null, "", {}, wasmException(), new Error(), Symbol("s")]) {
      const text = errorText(v);
      expect(typeof text).toBe("string");
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toBe("undefined");
    }
  });
});

describe("isEngineError", () => {
  it("wasm 의 예외와 트랩은 엔진이다", () => {
    expect(isEngineError(wasmException())).toBe(true);
    expect(isEngineError(trap("unreachable"))).toBe(true);
  });

  it("파일 이름이나 스택에 엔진 파일이 보이면 엔진이다", () => {
    expect(isEngineError(new Error("x"), "http://127.0.0.1:4173/engine/Initial2D.js")).toBe(true);
    const e = new Error("x");
    e.stack = "Error: x\n    at _main (http://127.0.0.1/engine/Initial2D.wasm:wasm-function[12]:0x1a)";
    expect(isEngineError(e)).toBe(true);
  });

  it("에디터의 오류와 Emscripten 의 unwind 는 아니다", () => {
    const e = new Error("editor bug");
    e.stack = "Error: editor bug\n    at http://127.0.0.1/assets/index-abc.js:1:2";
    expect(isEngineError(e, "http://127.0.0.1/assets/index-abc.js")).toBe(false);
    expect(isEngineError("unwind")).toBe(false);
    expect(isEngineError(undefined)).toBe(false);
  });
});
