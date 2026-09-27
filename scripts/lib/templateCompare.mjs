// 템플릿 사본(packages/app/templates)을 엔진 체크아웃이나 풀어 둔 템플릿 묶음과 견준다 (docs/plans/e6-packaging.md 4.1 절).
// templates.test.ts 가 쓴다.
//
// 엔진 git 이 추적하는 파일은 바이트(sha256)로 견준다. 생성물(MANIFEST 의 generated, 플래피 그림 넷)은 엔진의
// tools/generate_placeholder_assets.py 가 Pillow 로 만든 PNG 라, 같은 커밋이라도 Pillow 판(CI 는 고정하지 않는다)에 따라
// 압축한 바이트가 다르다. 그래서 PNG 인 생성물은 풀어 낸 픽셀(너비, 높이, RGBA 전부)로 견준다. PNG 가 아닌 생성물은 바이트로.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { samePngPixels } from "./png.mjs";

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

/** 이 항목을 픽셀로 견주는가 */
export function comparesByPixels(entry) {
  return entry.generated === true && entry.path.toLowerCase().endsWith(".png");
}

/**
 * 사본 한 파일(copyDir/entry.path)과 다른 곳의 같은 파일(otherFile)이 같은가.
 * @returns {{ same: boolean, by: "bytes" | "pixels", detail: string }}
 */
export function compareEntry(entry, copyDir, otherFile) {
  const other = fs.readFileSync(otherFile);
  if (!comparesByPixels(entry)) {
    const got = sha256(other);
    return { same: got === entry.sha256, by: "bytes", detail: got === entry.sha256 ? "" : `sha256 ${got.slice(0, 12)} (사본 ${String(entry.sha256).slice(0, 12)})` };
  }
  try {
    const r = samePngPixels(fs.readFileSync(path.join(copyDir, entry.path)), other);
    return { same: r.same, by: "pixels", detail: r.same ? "" : r.detail };
  } catch (e) {
    return { same: false, by: "pixels", detail: `PNG 를 읽지 못했다: ${e.message}` };
  }
}

/**
 * MANIFEST 의 파일 전부를 otherDir 과 견준다. allowMissing(entry) 가 참이면 otherDir 에 없어도 된다.
 * @returns {{ missing: string[], differ: Array<{ path: string, by: string, detail: string }>, compared: { bytes: number, pixels: number } }}
 */
export function compareTemplateCopy(manifest, copyDir, otherDir, { allowMissing = () => false } = {}) {
  const missing = [];
  const differ = [];
  const compared = { bytes: 0, pixels: 0 };
  for (const entry of manifest.files) {
    const other = path.join(otherDir, entry.path);
    if (!fs.existsSync(other)) {
      if (!allowMissing(entry)) missing.push(entry.path);
      continue;
    }
    const r = compareEntry(entry, copyDir, other);
    compared[r.by]++;
    if (!r.same) differ.push({ path: entry.path, by: r.by, detail: r.detail });
  }
  return { missing, differ, compared };
}
