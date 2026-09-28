// 맵 크기 바꾸기 (맵/크기 바꾸기). 대화상자(components/maps/ResizeMapDialog.tsx)가 새 크기와 기준점을 받고,
// 여기서 명령(MapDocument.resizeCommand: 모델과 확장 레이어의 칸)으로 넣는다. 되돌리기 한 단계다. 맵 밖으로 나간 오브젝트는 지우지 않고 알린다.

import type { LogStore } from "@initial-editor/core";
import { ANCHOR_LABELS, resizeSummary, validateMapSize, type MapDocument, type ResizeAnchor, type ResizeSource, type ResizeSummary } from "@initial-editor/ext-tilemap/model";

const LOG = "maps";

export interface ResizeRequest {
  width: number;
  height: number;
  anchor: ResizeAnchor;
}

/** 크기 바꾸기의 원본. events 는 지금 값이다 (확장 레이어 상태가 붙었으면 그 값) */
export function resizeSourceOf(doc: MapDocument): ResizeSource {
  const m = doc.model;
  const events = doc.sectionValue("events");
  return { width: m.width, height: m.height, tileWidth: m.tileWidth, tileHeight: m.tileHeight, objects: m.objects, events: Array.isArray(events) ? events : null };
}

/** 대화상자의 미리 보기 */
export function previewResize(doc: MapDocument, req: ResizeRequest): ResizeSummary {
  return resizeSummary(resizeSourceOf(doc), req, req.anchor, doc.schema);
}

/** 옮김 한 축의 글 (+2, -1, 0) */
function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

export function describeOffset(s: ResizeSummary): string {
  return `내용 이동 x ${signed(s.offset.dx)}, y ${signed(s.offset.dy)} (타일)`;
}

export interface ResizeHost {
  readonly log: LogStore;
  readonly toasts: { warn(text: string): unknown };
}

/** 크기를 바꾼다. 같은 크기이거나 쓸 수 없는 크기면 false */
export function applyResize(host: ResizeHost, doc: MapDocument, req: ResizeRequest): boolean {
  const m = doc.model;
  if (req.width === m.width && req.height === m.height) return false;
  const problem = validateMapSize(req.width, req.height);
  if (problem) {
    host.toasts.warn(problem);
    return false;
  }
  const from = `${m.width}x${m.height}`;
  const summary = previewResize(doc, req);
  doc.apply(doc.resizeCommand(req.width, req.height, req.anchor));
  const warnings = outsideWarnings(summary);
  const tail = warnings.map((w) => `, ${w}`).join("");
  host.log.info(LOG, `맵 크기 변경됨: ${doc.title} ${from} → ${req.width}x${req.height} 타일 (기준점 ${ANCHOR_LABELS[req.anchor]}, ${describeOffset(summary)}${tail})`);
  if (warnings.length > 0) host.toasts.warn(warnings.join(". "));
  if (summary.eventsOutside > 0) host.log.warn(LOG, `맵 밖으로 나간 이벤트 ${summary.eventsOutside}개`);
  return true;
}

/** 맵 밖으로 나간 오브젝트와 끝이 밖까지 가는 오브젝트의 알림 글 (지우지 않는다) */
export function outsideWarnings(s: ResizeSummary): string[] {
  const out: string[] = [];
  if (s.objectsOutside.length > 0) out.push(`맵 밖으로 나간 오브젝트 ${s.objectsOutside.length}개: ${s.objectsOutside.join(", ")}`);
  if (s.objectsPartlyOutside.length > 0) out.push(`영역이나 범위가 맵 밖으로 일부 나가는 오브젝트 ${s.objectsPartlyOutside.length}개: ${s.objectsPartlyOutside.join(", ")}`);
  return out;
}
