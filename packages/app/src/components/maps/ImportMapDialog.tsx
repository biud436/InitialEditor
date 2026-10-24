// 맵 가져오기 대화상자 (맵 > 맵 가져오기). 형식(확장이 등록한 맵 가져오기)과 폴더를 고르면 그 형식이 폴더를 읽어 가져올 항목을
// 내놓는다. 항목마다 이름, 크기, 쓸 파일, 가져올 수 없는 이유, 알림을 보이고, 고른 항목을 가져온다.
// 처음 고르는 항목: 가져올 수 있고 프로젝트에 같은 파일이 없는 것. 이미 있는 파일을 고르면 덮어쓴다고 보인다.
// 형식의 선택지(예: 글 인코딩)를 바꾸면 다시 읽고, 고른 항목은 그대로 둔다. 파일 쓰기는 editor/maps/importMaps.ts 가 한다.

import type { ImportSource, MapImporterSpec, MapImportPlan, MapImportResult } from "@initial-editor/ext-tilemap";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Editor } from "../../editor/Editor";
import { guidePage } from "../../editor/about";
import { runMapImport, sourceFromFiles } from "../../editor/maps/importMaps";
import { openLink } from "../../editor/openExternal";
import "./MapDialogs.css";

export interface ImportMapSource {
  importers(): readonly MapImporterSpec[];
  plan(importer: MapImporterSpec, source: ImportSource, options: Readonly<Record<string, string>>): Promise<MapImportPlan>;
  run(plan: MapImportPlan, ids: readonly string[], progress: (done: number, total: number) => void): Promise<MapImportResult>;
  openGuide?(page: string): void;
}

type PlanState = { status: "reading" } | { status: "ready"; plan: MapImportPlan } | { status: "error"; message: string };

/** 처음 고를 항목: 가져올 수 있고 아직 없는 것 */
export function defaultSelection(plan: MapImportPlan): Set<string> {
  return new Set(plan.items.filter((i) => i.problems.length === 0 && !i.exists).map((i) => i.id));
}

export function ImportMapForm({ source, onDone, onCancel }: { source: ImportMapSource; onDone: (result: MapImportResult) => void; onCancel: () => void }) {
  const importers = source.importers();
  const [importerId, setImporterId] = useState(importers[0]?.id ?? "");
  const importer = importers.find((i) => i.id === importerId) ?? null;
  const [folder, setFolder] = useState<ImportSource | null>(null);
  const [optionValues, setOptionValues] = useState<Record<string, string>>({});
  const [state, setState] = useState<PlanState | null>(null);
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const options = Object.fromEntries((importer?.options ?? []).map((o) => [o.id, optionValues[`${importerId}.${o.id}`] ?? o.default]));
  const optionsKey = JSON.stringify(options);

  useEffect(() => {
    if (!importer || !folder) return;
    if (!importer.accepts(folder)) {
      setState({ status: "error", message: `${importer.label} 폴더가 아닙니다. ${importer.description ?? ""}`.trim() });
      return;
    }
    let live = true;
    setState({ status: "reading" });
    source.plan(importer, folder, JSON.parse(optionsKey) as Record<string, string>).then(
      (plan) => {
        if (!live) return;
        setState({ status: "ready", plan });
        setSelected((prev) => prev ?? defaultSelection(plan));
      },
      (e: Error) => live && setState({ status: "error", message: `폴더 읽기 실패: ${e.message}` }),
    );
    return () => {
      live = false;
    };
  }, [importer, folder, optionsKey, source]);

  const pickFolder = (files: FileList | null) => {
    const picked = files ? sourceFromFiles(files) : null;
    if (!picked) return;
    setFolder(picked);
    setSelected(null);
    setRunError(null);
  };

  const plan = state?.status === "ready" ? state.plan : null;
  const items = plan?.items ?? [];
  const importable = items.filter((i) => i.problems.length === 0);
  const chosen = items.filter((i) => i.problems.length === 0 && selected?.has(i.id));
  const allChosen = importable.length > 0 && chosen.length === importable.length;
  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev ?? []);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const canSubmit = !!plan && chosen.length > 0 && !running;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!plan || !canSubmit) return;
    setRunError(null);
    setRunning({ done: 0, total: chosen.length });
    source
      .run(
        plan,
        chosen.map((i) => i.id),
        (done, total) => setRunning({ done, total }),
      )
      .then(
        (result) => onDone(result),
        (err: Error) => {
          setRunning(null);
          setRunError(`가져오기 실패: ${err.message}`);
        },
      );
  };

  const directory = { webkitdirectory: "", directory: "" } as Record<string, string>;
  return (
    <form onSubmit={submit} data-testid="import-map-dialog">
      <div className="modal-body map-dialog">
        <div className="form-row">
          <label htmlFor="import-map-kind">형식</label>
          {importers.length > 1 ? (
            <select id="import-map-kind" className="select" value={importerId} onChange={(e) => setImporterId(e.target.value)} disabled={!!running} data-testid="import-map-kind">
              {importers.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label}
                </option>
              ))}
            </select>
          ) : (
            <div id="import-map-kind" data-testid="import-map-kind">
              {importer?.label ?? "가져올 수 있는 형식 없음"}
            </div>
          )}
          {importer?.description ? <div className="form-help">{importer.description}</div> : null}
          {importer?.guides && source.openGuide ? (
            <div className="form-help map-dialog-guides" data-testid="import-map-guides">
              {importer.guides.map((g) => (
                <button key={g.page} type="button" className="link-button" onClick={() => source.openGuide?.(g.page)}>
                  {g.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="form-row">
          <label htmlFor="import-map-folder">폴더</label>
          <div className="map-dialog-pair">
            <button id="import-map-folder" type="button" className="btn" onClick={() => input.current?.click()} disabled={!importer || !!running} data-autofocus autoFocus data-testid="import-map-folder">
              폴더 선택
            </button>
            <span className="muted" data-testid="import-map-folder-name">
              {folder ? `${folder.name || "선택한 폴더"} (파일 ${folder.paths.length}개)` : "선택한 폴더 없음"}
            </span>
          </div>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            {...directory}
            onChange={(e) => {
              pickFolder(e.target.files);
              e.target.value = "";
            }}
            data-testid="import-map-folder-input"
          />
        </div>
        {importer && folder
          ? (importer.options ?? []).map((o) => (
              <div className="form-row" key={o.id}>
                <label htmlFor={`import-map-option-${o.id}`}>{o.label}</label>
                <select
                  id={`import-map-option-${o.id}`}
                  className="select map-dialog-medium"
                  value={options[o.id]}
                  disabled={!!running}
                  onChange={(e) => setOptionValues((v) => ({ ...v, [`${importerId}.${o.id}`]: e.target.value }))}
                  data-testid={`import-map-option-${o.id}`}
                >
                  {o.choices.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            ))
          : null}
        {state?.status === "reading" ? <div className="muted">폴더 불러오는 중</div> : null}
        {state?.status === "error" ? (
          <div className="modal-error" data-testid="import-map-error">
            {state.message}
          </div>
        ) : null}
        {plan ? (
          <div className="map-import" data-testid="import-map-plan">
            <div className="map-import-head">
              <b data-testid="import-map-title">{plan.title}</b>
              {plan.notes.map((n) => (
                <span key={n} className="muted" data-testid="import-map-note">
                  {n}
                </span>
              ))}
            </div>
            {items.length > 0 ? (
              <>
                <label className="checkbox map-import-all">
                  <input type="checkbox" checked={allChosen} disabled={importable.length === 0 || !!running} onChange={(e) => setSelected(new Set(e.target.checked ? importable.map((i) => i.id) : []))} data-testid="import-map-all" />
                  <span data-testid="import-map-count">
                    맵 {items.length}개 가운데 {chosen.length}개 선택
                  </span>
                </label>
                <ul className="map-import-list" data-testid="import-map-items">
                  {items.map((item) => {
                    const blocked = item.problems.length > 0;
                    const on = !blocked && !!selected?.has(item.id);
                    return (
                      <li key={item.id} className={"map-import-item" + (blocked ? " is-blocked" : "")} data-testid="import-map-item" data-id={item.id}>
                        <input type="checkbox" checked={on} disabled={blocked || !!running} onChange={(e) => toggle(item.id, e.target.checked)} aria-label={item.label} />
                        <div className="map-import-text">
                          <div>
                            <b>{item.label}</b> <span className="muted">{item.detail}</span>
                          </div>
                          <div className="map-import-target">
                            {item.target}
                            {item.exists ? <span className={on ? "map-import-overwrite" : "muted"}>{on ? " 이미 있는 파일을 덮어씁니다" : " 이미 있는 파일"}</span> : null}
                          </div>
                          {item.problems.map((p) => (
                            <div key={p} className="map-import-problem">
                              {p}
                            </div>
                          ))}
                          {item.notes.map((n) => (
                            <div key={n} className="map-import-note">
                              {n}
                            </div>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : null}
          </div>
        ) : null}
        {runError ? (
          <div className="modal-error" data-testid="import-map-run-error">
            {runError}
          </div>
        ) : null}
      </div>
      <div className="modal-actions">
        {running ? (
          <span className="muted map-import-progress" data-testid="import-map-progress">
            가져오는 중 ({running.done}/{running.total})
          </span>
        ) : null}
        <button type="button" className="btn" onClick={onCancel} disabled={!!running}>
          취소
        </button>
        <button type="submit" className="btn btn-primary" disabled={!canSubmit} data-testid="import-map-ok">
          {chosen.length > 0 ? `맵 ${chosen.length}개 가져오기` : "가져오기"}
        </button>
      </div>
    </form>
  );
}

export function importMapSource(editor: Editor): ImportMapSource {
  return {
    importers: () => editor.tilemap?.mapImporters ?? [],
    plan: (importer, folder, options) => importer.plan(folder, options, editor.backend),
    run: (plan, ids, progress) => runMapImport(editor, plan, ids, progress),
    openGuide: (page) => void openLink(editor, guidePage(page)),
  };
}

/** 대화상자를 띄운다. 가져왔으면 결과, 취소면 null. 가져오는 중에 Esc 로 닫아도 가져오기가 끝난 뒤 그 결과를 돌려준다 */
export function openImportMapDialog(editor: Editor, source: ImportMapSource = importMapSource(editor)): Promise<MapImportResult | null> {
  let pending: Promise<MapImportResult> | null = null;
  const tracked: ImportMapSource = { ...source, run: (...args) => (pending = source.run(...args)) };
  return new Promise((resolve) => {
    let result: MapImportResult | null = null;
    void editor.modals
      .custom({
        title: "맵 가져오기",
        width: 620,
        render: (close) => (
          <ImportMapForm
            source={tracked}
            onDone={(r) => {
              result = r;
              close();
            }}
            onCancel={close}
          />
        ),
      })
      .then(async () => {
        if (!result && pending) result = await (pending as Promise<MapImportResult>).catch(() => null);
        resolve(result);
      });
  });
}
