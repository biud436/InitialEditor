// 새 맵 대화상자 (맵/새 맵). 이름, 폭과 높이(칸), 타일 크기, 타일셋 그림, 레이어 이름, 통행을 받는다.
// 그림 목록과 맵 목록은 열 때 읽고, 그림을 고르면 PNG 머리로 크기를 읽어 열 수를 보인다.
// 타일셋 그림이 없으면 만들지 않는다 (엔진이 타일셋 없는 맵을 읽지 않는다). 파일 쓰기는 editor/maps/newMap.ts가 한다.

import { useEffect, useState, type FormEvent } from "react";
import type { Editor } from "../../editor/Editor";
import {
  DEFAULT_LAYER_NAMES,
  DEFAULT_MAP_HEIGHT,
  DEFAULT_MAP_WIDTH,
  DEFAULT_TILE_SIZE,
  listMapPaths,
  listTilesetImages,
  mapPathFor,
  parseLayerNames,
  readImageSize,
  tilesetColumns,
  validateMapName,
  validateMapTiles,
  validateTileSize,
  type ImageSize,
  type NewMapSpec,
} from "../../editor/maps/newMap";
import "./MapDialogs.css";

export interface NewMapSource {
  listImages(): Promise<string[]>;
  listMaps(): Promise<string[]>;
  imageSize(path: string): Promise<ImageSize>;
}

type SizeState = { path: string; size: ImageSize | null; error: string | null };

export const NEW_MAP_NO_TILESET = "타일셋 그림(PNG)이 있어야 만든다. resources 아래에 그림을 먼저 넣는다";

/** 처음 고를 타일셋: tiles 폴더의 것이 있으면 그것, 없으면 첫 그림 */
export function defaultTileset(images: readonly string[]): string {
  return images.find((p) => p.includes("/tiles/")) ?? images[0] ?? "";
}

export function NewMapForm({ source, onSubmit, onCancel }: { source: NewMapSource; onSubmit: (spec: NewMapSpec) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [widthText, setWidthText] = useState(String(DEFAULT_MAP_WIDTH));
  const [heightText, setHeightText] = useState(String(DEFAULT_MAP_HEIGHT));
  const [tileText, setTileText] = useState(String(DEFAULT_TILE_SIZE));
  const [layersText, setLayersText] = useState(DEFAULT_LAYER_NAMES.join(", "));
  const [collision, setCollision] = useState(true);
  const [image, setImage] = useState("");
  const [lists, setLists] = useState<{ images: string[]; maps: string[] } | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [sizeState, setSizeState] = useState<SizeState | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([source.listImages(), source.listMaps()]).then(
      ([images, maps]) => {
        if (!live) return;
        setLists({ images, maps });
        setImage(defaultTileset(images));
      },
      (e: Error) => {
        if (!live) return;
        setLists({ images: [], maps: [] });
        setListError(`파일 목록을 읽지 못했다: ${e.message}`);
      },
    );
    return () => {
      live = false;
    };
  }, [source]);

  useEffect(() => {
    if (!image) return;
    let live = true;
    source.imageSize(image).then(
      (size) => live && setSizeState({ path: image, size, error: null }),
      (e: Error) => live && setSizeState({ path: image, size: null, error: e.message }),
    );
    return () => {
      live = false;
    };
  }, [image, source]);

  const images = lists?.images ?? [];
  const nameError = validateMapName(name, lists?.maps ?? []);
  const widthError = validateMapTiles(widthText, "폭은");
  const heightError = validateMapTiles(heightText, "높이는");
  const tileError = validateTileSize(tileText);
  const layers = parseLayerNames(layersText);
  const tileSize = tileError ? 0 : Number(tileText.trim());
  const size = sizeState && sizeState.path === image ? sizeState : null;
  const columns = size?.size && tileSize > 0 ? tilesetColumns(size.size.width, tileSize) : 0;
  const rows = size?.size && tileSize > 0 ? Math.floor(size.size.height / tileSize) : 0;

  let tilesetError: string | null = null;
  if (lists && images.length === 0) tilesetError = NEW_MAP_NO_TILESET;
  else if (image && size?.error) tilesetError = `그림을 읽지 못했다: ${size.error}`;
  else if (image && size?.size && tileSize > 0 && (columns < 1 || rows < 1)) tilesetError = `그림(${size.size.width}x${size.size.height})이 타일 크기보다 작다`;
  // 목록과 그림 크기를 읽는 동안은 만들기를 막지만 오류로 보이지는 않는다
  const loading = !lists || (!!image && !size);
  const problems = [nameError, widthError, heightError, tileError, tilesetError, layers.error].filter((p): p is string => !!p);
  const shownProblem = problems.find((p) => !(p === nameError && name.trim() === ""));
  const canSubmit = !loading && problems.length === 0 && image !== "";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      name: name.trim(),
      width: Number(widthText.trim()),
      height: Number(heightText.trim()),
      tileSize,
      tileset: { image, columns },
      layers: layers.names,
      collision,
    });
  };

  const spare = size?.size && tileSize > 0 ? size.size.width - columns * tileSize : 0;
  return (
    <form onSubmit={submit} data-testid="new-map-dialog">
      <div className="modal-body map-dialog">
        <div className="form-row">
          <label htmlFor="new-map-name">이름</label>
          <input id="new-map-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="stage1" data-autofocus autoFocus data-testid="new-map-name" />
          <div className="form-help" data-testid="new-map-path">
            {name.trim() && !nameError ? `${mapPathFor(name.trim())}으로 만든다` : "resources/maps/<이름>.json으로 만든다"}
          </div>
        </div>
        <div className="form-row">
          <label htmlFor="new-map-width">크기 (칸)</label>
          <div className="map-dialog-pair">
            <input id="new-map-width" className="input" inputMode="numeric" value={widthText} onChange={(e) => setWidthText(e.target.value)} aria-label="폭 (칸)" data-testid="new-map-width" />
            <span className="muted">x</span>
            <input className="input" inputMode="numeric" value={heightText} onChange={(e) => setHeightText(e.target.value)} aria-label="높이 (칸)" data-testid="new-map-height" />
          </div>
        </div>
        <div className="form-row">
          <label htmlFor="new-map-tile">타일 크기 (px)</label>
          <input id="new-map-tile" className="input map-dialog-short" inputMode="numeric" value={tileText} onChange={(e) => setTileText(e.target.value)} data-testid="new-map-tile" />
        </div>
        <div className="form-row">
          <label htmlFor="new-map-tileset">타일셋</label>
          {images.length > 0 ? (
            <select id="new-map-tileset" className="select" value={image} onChange={(e) => setImage(e.target.value)} data-testid="new-map-tileset">
              {images.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          ) : (
            <div className="muted" data-testid="new-map-no-images">
              {lists ? "resources 아래에 PNG가 없다" : "그림 목록을 읽는 중"}
            </div>
          )}
          {image && size?.size && tileSize > 0 ? (
            <div className="form-help" data-testid="new-map-columns" data-columns={columns}>
              {size.size.width}x{size.size.height} px, {columns}열 {rows}행{spare > 0 ? ` (오른쪽 ${spare}px는 쓰지 않는다)` : ""}
            </div>
          ) : null}
        </div>
        <div className="form-row">
          <label htmlFor="new-map-layers">레이어</label>
          <input id="new-map-layers" className="input" value={layersText} onChange={(e) => setLayersText(e.target.value)} data-testid="new-map-layers" />
          <div className="form-help">쉼표로 가른다. 앞의 것이 아래에 그려진다</div>
        </div>
        <div className="form-row">
          <label htmlFor="new-map-collision">통행</label>
          <label className="checkbox">
            <input id="new-map-collision" type="checkbox" checked={collision} onChange={(e) => setCollision(e.target.checked)} data-testid="new-map-collision" /> 통행 레이어를 만든다 (전부 지나감)
          </label>
        </div>
        {listError ? <div className="modal-error">{listError}</div> : null}
        {shownProblem ? (
          <div className="modal-error" data-testid="new-map-problem">
            {shownProblem}
          </div>
        ) : null}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onCancel}>
          취소
        </button>
        <button type="submit" className="btn btn-primary" disabled={!canSubmit} data-testid="new-map-ok">
          만들기
        </button>
      </div>
    </form>
  );
}

export function newMapSource(editor: Editor): NewMapSource {
  return {
    listImages: () => listTilesetImages(editor.backend),
    listMaps: () => listMapPaths(editor.backend),
    imageSize: (path) => readImageSize(editor.backend, path),
  };
}

/** 대화상자를 띄우고 받은 것을 돌려준다. 취소면 null */
export function openNewMapDialog(editor: Editor, source: NewMapSource = newMapSource(editor)): Promise<NewMapSpec | null> {
  return new Promise((resolve) => {
    let result: NewMapSpec | null = null;
    void editor.modals
      .custom({
        title: "새 맵",
        width: 540,
        render: (close) => (
          <NewMapForm
            source={source}
            onSubmit={(spec) => {
              result = spec;
              close();
            }}
            onCancel={close}
          />
        ),
      })
      .then(() => resolve(result));
  });
}
