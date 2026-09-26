// 이미지 미리보기. 픽셀 아트라 image-rendering: pixelated 로 배율을 키운다.

import { observer } from "mobx-react-lite";
import type { ImagePreviewDocument } from "../../editor/documents/ImagePreviewDocument";
import "./ImagePreviewView.css";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export const ImagePreviewView = observer(function ImagePreviewView({ doc }: { doc: ImagePreviewDocument }) {
  return (
    <div className="image-preview">
      <div className="doc-header">
        <span className="doc-header-path">{doc.path}</span>
        <span className="doc-header-spacer" />
        <span data-testid="image-dimensions">{doc.width && doc.height ? `${doc.width} x ${doc.height}` : "..."}</span>
        <span>{formatBytes(doc.bytes)}</span>
        <button type="button" className="btn" onClick={() => doc.zoomOut()} aria-label="축소">
          -
        </button>
        <span className="image-zoom">{Math.round(doc.zoom * 100)}%</span>
        <button type="button" className="btn" onClick={() => doc.zoomIn()} aria-label="확대">
          +
        </button>
        <button type="button" className="btn" onClick={() => doc.setZoom(1)}>
          1:1
        </button>
      </div>
      <div className="image-preview-body">
        {doc.error ? (
          <div className="panel-hint">읽지 못했다: {doc.error}</div>
        ) : doc.url ? (
          <img
            className="image-preview-img"
            src={doc.url}
            alt={doc.title}
            draggable={false}
            style={doc.width ? { width: doc.width * doc.zoom, height: doc.height * doc.zoom } : undefined}
            onLoad={(e) => doc.setNaturalSize(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
            data-testid="image-preview"
          />
        ) : (
          <div className="panel-hint">읽는 중</div>
        )}
      </div>
    </div>
  );
});
