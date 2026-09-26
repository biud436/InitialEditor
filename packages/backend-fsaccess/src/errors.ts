// DOMException 이름을 BackendError 코드로 바꾼다. 가짜와 브라우저가 같은 이름을 던진다
// (NotFoundError, TypeMismatchError, InvalidModificationError, NotAllowedError ...).

import { BackendError, normalizeRel, PathError } from "@initial-editor/core";

export function errorName(e: unknown): string {
  if (e && typeof e === "object" && "name" in e) return String((e as { name: unknown }).name);
  return "";
}

function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

export function toBackendError(e: unknown, rel?: string): BackendError {
  if (e instanceof BackendError) return e;
  const where = rel === undefined ? "" : `: ${rel === "" ? "/" : rel}`;
  switch (errorName(e)) {
    case "NotFoundError":
      return new BackendError(`없다${where}`, "not_found", rel);
    case "TypeMismatchError":
      return new BackendError(`파일과 폴더의 종류가 맞지 않는다${where}`, "io", rel);
    case "InvalidModificationError":
      return new BackendError(`바꿀 수 없다${where} (${errorMessage(e)})`, "io", rel);
    case "NoModificationAllowedError":
      return new BackendError(`다른 곳에서 쓰는 중이라 바꿀 수 없다${where}`, "io", rel);
    case "NotAllowedError":
    case "SecurityError":
      return new BackendError(`폴더 권한이 없다${where}. 시작 화면에서 다시 열기를 누른다`, "io", rel);
    case "QuotaExceededError":
      return new BackendError(`브라우저 저장 공간이 모자란다${where}`, "io", rel);
    default:
      return new BackendError(`${errorMessage(e)}${where}`, "io", rel);
  }
}

/** 상대 경로를 정규화한다. 루트 밖이면 outside_root */
export function cleanRel(input: string): string {
  try {
    return normalizeRel(input);
  } catch (e) {
    if (e instanceof PathError) throw new BackendError(e.message, "outside_root", input);
    throw e;
  }
}
