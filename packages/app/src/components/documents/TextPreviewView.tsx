// 텍스트 미리보기 (읽기 전용). Monaco 편집기는 E1.

import { observer } from "mobx-react-lite";
import type { TextPreviewDocument } from "../../editor/documents/TextPreviewDocument";
import "./TextPreviewView.css";

export const TextPreviewView = observer(function TextPreviewView({ doc }: { doc: TextPreviewDocument }) {
  const lines = doc.loaded ? doc.text.split("\n") : [];
  return (
    <div className="text-preview">
      <div className="doc-header">
        <span className="doc-header-path">{doc.path}</span>
        <span className="doc-header-spacer" />
        <span>{doc.loaded ? `${lines.length}줄` : "읽는 중"}</span>
        <span>읽기 전용 미리보기 (편집기는 E1)</span>
      </div>
      {doc.error ? (
        <div className="panel-hint">읽지 못했다: {doc.error}</div>
      ) : (
        <pre className="text-preview-body" data-testid="text-preview">
          {lines.map((line, i) => (
            <div className="text-line" key={i}>
              <span className="text-line-no">{i + 1}</span>
              <span className="text-line-text">{line}</span>
            </div>
          ))}
        </pre>
      )}
    </div>
  );
});
