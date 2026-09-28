// 맵 크기 바꾸기 대화상자 (맵/크기 바꾸기). 지금 크기, 새 폭과 높이(칸), 3x3 기준점을 받는다.
// 기준점은 옛 맵이 새 맵의 어느 쪽에 붙는지다 (왼쪽 위면 오른쪽과 아래가 늘거나 준다).
// 아래에 옮김 칸 수, 잘림, 맵 밖으로 나가는 오브젝트와 이벤트, 끝이나 순찰 범위가 밖까지 가는 오브젝트를 미리 보인다.
// 명령은 editor/maps/resize.ts가 넣는다.

import { ANCHOR_LABELS, RESIZE_ANCHORS, type MapDocument, type ResizeAnchor, type ResizeSummary } from "@initial-editor/ext-tilemap/model";
import { useState, type FormEvent } from "react";
import type { Editor } from "../../editor/Editor";
import { validateMapTiles } from "../../editor/maps/newMap";
import { describeOffset, previewResize, type ResizeRequest } from "../../editor/maps/resize";
import "./MapDialogs.css";

export interface ResizeFormProps {
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  preview: (req: ResizeRequest) => ResizeSummary;
  onSubmit: (req: ResizeRequest) => void;
  onCancel: () => void;
}

export function AnchorPicker({ value, onChange }: { value: ResizeAnchor; onChange: (a: ResizeAnchor) => void }) {
  return (
    <div className="map-anchor" role="radiogroup" aria-label="기준점" data-testid="resize-anchor">
      {RESIZE_ANCHORS.map((a) => {
        const on = a === value;
        return (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={ANCHOR_LABELS[a]}
            title={ANCHOR_LABELS[a]}
            className={"map-anchor-cell" + (on ? " is-on" : "")}
            data-anchor={a}
            data-testid="resize-anchor-cell"
            onClick={() => onChange(a)}
          >
            <span className="map-anchor-dot" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

export function ResizeMapForm({ width, height, tileWidth, tileHeight, preview, onSubmit, onCancel }: ResizeFormProps) {
  const [widthText, setWidthText] = useState(String(width));
  const [heightText, setHeightText] = useState(String(height));
  const [anchor, setAnchor] = useState<ResizeAnchor>("top-left");

  const widthError = validateMapTiles(widthText, "너비");
  const heightError = validateMapTiles(heightText, "높이");
  const error = widthError ?? heightError;
  const req: ResizeRequest | null = error ? null : { width: Number(widthText.trim()), height: Number(heightText.trim()), anchor };
  const same = !!req && req.width === width && req.height === height;
  const summary = req && !same ? preview(req) : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (req && !same) onSubmit(req);
  };

  return (
    <form onSubmit={submit} data-testid="resize-map-dialog">
      <div className="modal-body map-dialog">
        <div className="form-row">
          <label>현재 크기</label>
          <div className="map-dialog-now" data-testid="resize-current">
            {width}x{height} 타일 ({width * tileWidth}x{height * tileHeight} px)
          </div>
        </div>
        <div className="form-row">
          <label htmlFor="resize-width">새 크기 (타일)</label>
          <div className="map-dialog-pair">
            <input id="resize-width" className="input" inputMode="numeric" value={widthText} onChange={(e) => setWidthText(e.target.value)} aria-label="새 너비 (타일)" data-autofocus autoFocus onFocus={(e) => e.target.select()} data-testid="resize-width" />
            <span className="muted">x</span>
            <input className="input" inputMode="numeric" value={heightText} onChange={(e) => setHeightText(e.target.value)} aria-label="새 높이 (타일)" data-testid="resize-height" />
          </div>
          {req ? (
            <div className="form-help">
              {req.width * tileWidth}x{req.height * tileHeight} px
            </div>
          ) : null}
        </div>
        <div className="form-row">
          <label>기준점</label>
          <AnchorPicker value={anchor} onChange={setAnchor} />
          <div className="form-help">기존 맵 내용을 고정할 위치입니다. 반대쪽이 늘어나거나 잘립니다.</div>
        </div>
        {summary ? (
          <div className="map-dialog-summary" data-testid="resize-summary" data-dx={summary.offset.dx} data-dy={summary.offset.dy}>
            {describeOffset(summary)}
            {summary.clips ? ", 줄어드는 쪽의 타일이 잘립니다" : ""}
            {summary.objectsOutside.length > 0 ? (
              <div className="map-dialog-warning" data-testid="resize-outside" data-count={summary.objectsOutside.length}>
                맵 밖으로 나가는 오브젝트 {summary.objectsOutside.length}개 (삭제하지 않습니다): {summary.objectsOutside.join(", ")}
              </div>
            ) : null}
            {summary.objectsPartlyOutside.length > 0 ? (
              <div className="map-dialog-warning" data-testid="resize-partly" data-count={summary.objectsPartlyOutside.length}>
                영역이나 범위가 맵 밖으로 일부 나가는 오브젝트 {summary.objectsPartlyOutside.length}개: {summary.objectsPartlyOutside.join(", ")}
              </div>
            ) : null}
            {summary.eventsOutside > 0 ? <div className="map-dialog-warning">맵 밖으로 나가는 이벤트 {summary.eventsOutside}개</div> : null}
          </div>
        ) : null}
        {error ? (
          <div className="modal-error" data-testid="resize-problem">
            {error}
          </div>
        ) : null}
        {same ? <div className="map-dialog-summary">현재 크기와 같음</div> : null}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onCancel}>
          취소
        </button>
        <button type="submit" className="btn btn-primary" disabled={!req || same} data-testid="resize-ok">
          바꾸기
        </button>
      </div>
    </form>
  );
}

/** 대화상자를 띄우고 새 크기와 기준점을 돌려준다. 취소면 null */
export function openResizeMapDialog(editor: Editor, doc: MapDocument): Promise<ResizeRequest | null> {
  return new Promise((resolve) => {
    let result: ResizeRequest | null = null;
    const m = doc.model;
    void editor.modals
      .custom({
        title: `크기 바꾸기: ${doc.title}`,
        width: 500,
        render: (close) => (
          <ResizeMapForm
            width={m.width}
            height={m.height}
            tileWidth={m.tileWidth}
            tileHeight={m.tileHeight}
            preview={(req) => previewResize(doc, req)}
            onSubmit={(req) => {
              result = req;
              close();
            }}
            onCancel={close}
          />
        ),
      })
      .then(() => resolve(result));
  });
}
