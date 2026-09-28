// 프로젝트 찾기 패널 (E1 마일스톤 5). 질의와 대소문자와 정규식 토글, 파일별로 묶인 결과. 줄을 누르면 그 파일 그 줄로.
// 상태는 editor.scripting.find (FindStore) 에 있어 패널을 닫았다 열어도 결과가 남는다.

import { observer } from "mobx-react-lite";
import { useEffect, useRef, type FormEvent } from "react";
import { useEditor } from "../../editor/EditorContext";
import type { FindMatch } from "../../editor/scripting/find";
import "./FindPanel.css";

const CONTEXT_BEFORE = 40;
const CONTEXT_AFTER = 80;

/** 긴 줄은 맞은 자리 앞뒤만 보인다 */
function snippet(m: FindMatch): { before: string; hit: string; after: string } {
  const start = m.column - 1;
  const from = Math.max(0, start - CONTEXT_BEFORE);
  const to = Math.min(m.text.length, start + m.length + CONTEXT_AFTER);
  return {
    before: (from > 0 ? "…" : "") + m.text.slice(from, start),
    hit: m.text.slice(start, start + m.length),
    after: m.text.slice(start + m.length, to) + (to < m.text.length ? "…" : ""),
  };
}

export const FindPanel = observer(function FindPanel() {
  const editor = useEditor();
  const find = editor.scripting.find;
  const open = editor.project.isOpen;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (find.focusRequest > 0) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [find.focusRequest]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void find.search();
  };
  const goTo = (path: string, m: FindMatch) => {
    void editor.scripting.openScript(path, m.line, m.column);
  };

  let summary = "";
  if (find.running) summary = `찾는 중 (${find.scanned}개 파일)`;
  else if (find.lastQuery) summary = `파일 ${find.results.length}개, 일치 ${find.matchCount}개`;

  return (
    <div className="find-panel" data-testid="find-panel">
      <form className="find-toolbar" onSubmit={submit}>
        <input
          ref={inputRef}
          className="input find-input"
          placeholder="scripts/ 와 resources/ 에서 찾기 (Enter)"
          value={find.query}
          onChange={(e) => find.setQuery(e.target.value)}
          disabled={!open}
          aria-label="찾을 문자열"
          data-testid="find-input"
        />
        <label className="find-toggle" title="대소문자 구분">
          <input type="checkbox" checked={find.caseSensitive} onChange={(e) => find.setCaseSensitive(e.target.checked)} disabled={!open} data-testid="find-case" /> Aa
        </label>
        <label className="find-toggle" title="정규식">
          <input type="checkbox" checked={find.regex} onChange={(e) => find.setRegex(e.target.checked)} disabled={!open} data-testid="find-regex" /> .*
        </label>
        <button type="submit" className="btn" disabled={!open || find.query === ""} data-testid="find-run">
          찾기
        </button>
        {find.running && (
          <button type="button" className="btn" onClick={() => find.cancel()}>
            중지
          </button>
        )}
        <span className="muted find-summary" data-testid="find-summary">
          {summary}
        </span>
      </form>
      {find.error && <div className="find-error">{find.error}</div>}
      <div className="find-results" data-testid="find-results">
        {!open && <div className="panel-hint">열린 프로젝트 없음. 검색 범위: scripts/, resources/의 텍스트 파일</div>}
        {open && !find.running && find.lastQuery !== "" && find.results.length === 0 && !find.error && <div className="panel-hint">"{find.lastQuery}" 검색 결과 없음</div>}
        {find.results.map((file) => (
          <section key={file.path} className="find-file" data-testid="find-file" data-path={file.path}>
            <button type="button" className="find-file-head" onClick={() => goTo(file.path, file.matches[0])}>
              <span className="find-file-path">{file.path}</span>
              <span className="find-file-count">{file.matches.length}</span>
            </button>
            {file.matches.map((m, i) => {
              const s = snippet(m);
              return (
                <button type="button" key={`${m.line}:${m.column}:${i}`} className="find-match" onClick={() => goTo(file.path, m)} data-testid="find-match" data-line={m.line}>
                  <span className="find-match-pos">
                    {m.line}:{m.column}
                  </span>
                  <span className="find-match-text">
                    {s.before}
                    <mark className="find-match-hit">{s.hit}</mark>
                    {s.after}
                  </span>
                </button>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
});
