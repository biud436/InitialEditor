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
      return new BackendError(`파일이나 폴더 없음${where}`, "not_found", rel);
    case "TypeMismatchError":
      return new BackendError(`파일과 폴더 종류 불일치${where}`, "io", rel);
    case "InvalidModificationError":
      return new BackendError(`수정 불가${where} (${errorMessage(e)})`, "io", rel);
    case "NoModificationAllowedError":
      return new BackendError(`다른 탭이나 프로그램에서 사용 중이라 수정 불가${where}`, "io", rel);
    case "NotAllowedError":
    case "SecurityError":
      return new BackendError(`폴더 접근 권한 없음${where}. 시작 화면에서 다시 열기를 클릭하면 권한 요청`, "io", rel);
    case "QuotaExceededError":
      return new BackendError(`브라우저 저장 공간 부족${where}`, "io", rel);
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
