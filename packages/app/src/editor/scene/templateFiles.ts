// 번들에 든 템플릿 파일 (packages/app/templates/, scripts/sync-engine-templates.mjs 가 엔진에서 복사한 것).
// 텍스트는 ?raw 로 문자열째 번들에 들어가고, 그림과 폰트와 소리는 ?url 로 자산이 되어 필요할 때 fetch 한다.
// 쓰는 쪽(projectTemplates.ts)은 TemplateSource 만 보므로 Node 테스트는 fs 로 읽는 소스를 넘긴다.

import manifestJson from "../../../templates/MANIFEST.json";
import type { TemplateManifest } from "./templateManifest";

export interface TemplateSource {
  text(path: string): string;
  binary(path: string): Promise<Uint8Array>;
}

export const templateManifest: TemplateManifest = manifestJson as TemplateManifest;

const PREFIX = "../../../templates/";

function strip(key: string): string {
  return key.startsWith(PREFIX) ? key.slice(PREFIX.length) : key;
}

const texts = import.meta.glob("../../../templates/**/*.{lua,rb,json}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const urls = import.meta.glob("../../../templates/**/*.{png,fnt,wav,ogg}", { query: "?url", import: "default", eager: true }) as Record<string, string>;

const textByPath = new Map(Object.entries(texts).map(([k, v]) => [strip(k), v]));
const urlByPath = new Map(Object.entries(urls).map(([k, v]) => [strip(k), v]));

export const bundledTemplateSource: TemplateSource = {
  text(path) {
    const t = textByPath.get(path);
    if (t === undefined) throw new Error(`번들에 없는 템플릿 파일: ${path}`);
    return t;
  },
  async binary(path) {
    const url = urlByPath.get(path);
    if (url === undefined) throw new Error(`번들에 없는 템플릿 파일: ${path}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`템플릿 파일 요청 실패: ${path} (HTTP ${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
  },
};
