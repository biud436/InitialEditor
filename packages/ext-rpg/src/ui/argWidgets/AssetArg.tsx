// face, charset: 논리 이름(스키마 assets)이나 파일을 고르고, 시트 격자를 눌러 번호를 고른다.
// 격자는 FaceSet 4x4, CharSet 8명(서 있는 정면 프레임)이라 범위 밖 번호를 만들지 않는다.
// 논리 이름의 그림은 후보 중 프로젝트에 있는 첫 파일이다 (엔진 Assets.pick 과 같다).

import { useEffect, useMemo, useState } from "react";
import { assetIndex, charsetFrame, faceRect, resolveAssetFile, type Rect } from "../../model/assets";
import { bareProjectPath } from "../../model/game";
import { fileArgValue } from "../../model/events";
import { field, isJsonText, isPlainObject, jsonValueText, stringifyJsonLossless, type JsonObject } from "../../model/json";
import type { AssetKind, EventSchema } from "../../model/schema";
import { pickableFiles, type ArgWidgetProps, type ImageUrl } from "./context";

/** 그림 URL (동기든 비동기든) */
export function useImageUrl(imageUrl: ImageUrl | undefined, path: string | null): string | null {
  const [state, setState] = useState<{ path: string | null; url: string | null }>({ path: null, url: null });
  useEffect(() => {
    if (!imageUrl || !path) return;
    const r = imageUrl(path);
    if (r instanceof Promise) {
      let alive = true;
      r.then(
        (url) => alive && setState({ path, url: url ?? null }),
        () => alive && setState({ path, url: null }),
      );
      return () => {
        alive = false;
      };
    }
    setState({ path, url: r ?? null });
  }, [imageUrl, path]);
  return state.path === path ? state.url : null;
}

interface SheetGridProps {
  kind: AssetKind;
  schema: EventSchema;
  url: string | null;
  index: number;
  disabled?: boolean;
  onPick: (index: number) => void;
  testId: string;
}

/** 시트 한 장의 칸 격자 */
export function SheetGrid({ kind, schema, url, index, disabled, onPick, testId }: SheetGridProps) {
  const count = kind === "charset" ? schema.sheets.charset.perSheet : schema.sheets.face.perSheet;
  const cols = kind === "charset" ? schema.sheets.charset.sheetCols : schema.sheets.face.cols;
  const cells: Rect[] = Array.from({ length: count }, (_, i) => (kind === "charset" ? charsetFrame(schema, i) : faceRect(schema, i)));
  return (
    <div className={`rpg-sheet-grid is-${kind}`} style={{ gridTemplateColumns: `repeat(${cols}, auto)` }} data-testid={testId} role="group" aria-label={kind === "charset" ? "외형 번호" : "얼굴 번호"}>
      {cells.map((r, i) => (
        <button
          key={i}
          type="button"
          className={"rpg-sheet-cell" + (i === index ? " is-selected" : "")}
          aria-pressed={i === index}
          aria-label={`${i}번`}
          disabled={disabled}
          data-testid={`${testId}-${i}`}
          onClick={() => onPick(i)}
        >
          <span
            className="rpg-sheet-frame"
            style={{
              width: r.w,
              height: r.h,
              backgroundImage: url ? `url("${url}")` : undefined,
              backgroundPosition: `-${r.x}px -${r.y}px`,
            }}
          >
            {url ? null : i}
          </span>
        </button>
      ))}
    </div>
  );
}

type Mode = "set" | "file" | "";

function modeOf(v: unknown): Mode {
  if (field(v, "set") !== undefined) return "set";
  if (field(v, "file") !== undefined) return "file";
  return "";
}

/** 외형이나 얼굴 참조 하나 */
export function AssetArg({ spec, value, onChange, ctx, testId }: ArgWidgetProps) {
  const kind: AssetKind = spec.type === "charset" ? "charset" : "face";
  const sets = [...ctx.schema.assets[kind].keys()];
  const pngs = useMemo(() => pickableFiles(ctx.files, ["png"]), [ctx.files]);
  const exists = useMemo(() => {
    const s = new Set(ctx.files);
    return (p: string) => s.has(p);
  }, [ctx.files]);
  const present = value !== undefined;
  const resolved = present ? resolveAssetFile(ctx.schema, kind, value, exists) : null;
  const url = useImageUrl(ctx.imageUrl, resolved && exists(resolved) ? resolved : null);
  const mode = modeOf(value);
  const index = assetIndex(value);
  const base: JsonObject = isPlainObject(value) ? { ...value } : {};

  const setMode = (next: Mode) => {
    if (next === "") return onChange(undefined);
    const out: JsonObject = { ...base };
    delete out.set;
    delete out.file;
    if (next === "set") out.set = sets[0];
    else out.file = fileArgValue(resolved ?? pngs[0] ?? "");
    if (field(out, "index") === undefined) out.index = 0;
    onChange(out);
  };
  const setSet = (set: string) => onChange({ ...base, set });
  const setFile = (file: string) => onChange({ ...base, file: fileArgValue(file) });
  const setIndex = (i: number) => onChange({ ...base, index: i });

  const set = field(value, "set");
  const file = field(value, "file");
  const fileBare = isJsonText(file) ? bareProjectPath(file) : "";
  return (
    <div className="rpg-asset">
      <span className="rpg-arg-inline">
        <select className="input field-select rpg-arg-kind" value={mode} disabled={ctx.disabled} data-testid={`${testId}-mode`} aria-label={`${spec.label} 고르는 법`} onChange={(e) => setMode(e.target.value as Mode)}>
          <option value="">{spec.required ? "고르기" : "없음"}</option>
          <option value="set" disabled={sets.length === 0}>
            논리 이름
          </option>
          <option value="file" disabled={pngs.length === 0 && mode !== "file"}>
            파일
          </option>
        </select>
        {mode === "set" && (
          <select className="input field-select" value={jsonValueText(set)} disabled={ctx.disabled} data-testid={`${testId}-set`} aria-label={`${spec.label} 이름`} onChange={(e) => setSet(e.target.value)}>
            {!isJsonText(set) || !sets.includes(set) ? <option value={jsonValueText(set)}>{jsonValueText(set)} (모르는 이름)</option> : null}
            {sets.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
        {mode === "file" && (
          <select className="input field-select" value={fileBare} disabled={ctx.disabled} data-testid={`${testId}-file`} aria-label={`${spec.label} 파일`} onChange={(e) => setFile(e.target.value)}>
            {!pngs.includes(fileBare) && <option value={fileBare}>{fileBare || "(비었다)"} (프로젝트에 없음)</option>}
            {pngs.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        )}
      </span>
      {present && mode !== "" && <SheetGrid kind={kind} schema={ctx.schema} url={url} index={index} disabled={ctx.disabled} onPick={setIndex} testId={`${testId}-grid`} />}
      {present && resolved && !exists(resolved) && (
        <div className="rpg-arg-note is-warning" data-testid={`${testId}-missing`}>
          프로젝트에 없는 그림 {resolved}
        </div>
      )}
      {present && !isPlainObject(value) && <div className="rpg-arg-note is-warning">지금 값 {stringifyJsonLossless(value)} 는 객체가 아니다</div>}
    </div>
  );
}
