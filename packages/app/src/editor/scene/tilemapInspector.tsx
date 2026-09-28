// 타일맵 오브젝트의 인스펙터 (타일맵 확장이 등록한 타입에 coreTypes.tsx가 붙인다).
//   맵 파일: resources/maps/ 아래의 *.json에서 고른다 (프로젝트의 폴더 목록을 본다)
//   바닥 레이어 수(groundLayers): 게임에서 다른 오브젝트 아래에 그리는 레이어 수. 나머지는 위에 그린다
//   맵 열기: 그 맵을 맵 문서로 연다. 맵의 크기와 레이어 수를 옆에 보이고, 읽지 못하면 이유를 보인다
// 변경은 전부 씬 명령(setProp)이다. 맵 요약은 씬 뷰와 같은 맵 파일 캐시에서 읽고, 파일이 바뀌면 다시 읽는다.

import { dirname } from "@initial-editor/core";
import { readTilemapProps } from "@initial-editor/ext-tilemap";
import { MAPS_DIR, isMapPath, type MapData } from "@initial-editor/ext-tilemap/model";
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { useEditor } from "../EditorContext";
import type { ObjectInspectorProps } from "./coreTypes";
import { FieldRow, NumberField } from "@initial-editor/ui";

/** resources/maps 아래의 맵 파일 경로 (프로젝트의 폴더 캐시. 관찰 가능) */
function useMapFiles(): string[] {
  const editor = useEditor();
  const project = editor.project;
  useEffect(() => {
    if (!project.isOpen) return;
    void project.entries(MAPS_DIR).catch(() => {});
    // 폴더를 아직 못 읽었으면(없던 폴더) 그 안에 파일이 생길 때 다시 읽는다. 읽은 폴더는 프로젝트가 스스로 갱신한다
    return project.events.on("change", (e) => {
      if (dirname(e.path) === MAPS_DIR && !project.folders.has(MAPS_DIR)) void project.refresh(MAPS_DIR).catch(() => {});
    });
  }, [project]);
  const entries = project.folders.get(MAPS_DIR) ?? [];
  return entries.filter((e) => e.kind === "file" && isMapPath(e.path)).map((e) => e.path);
}

interface MapInfo {
  path: string;
  map: MapData | null;
  error: string | null;
}

/** 맵 파일의 내용 (씬 뷰의 맵 캐시). 파일이 바뀌면 다시 읽는다 */
function useMapInfo(path: string): MapInfo | null {
  const editor = useEditor();
  const maps = editor.sceneSupport.maps;
  const [version, setVersion] = useState(0);
  const [info, setInfo] = useState<MapInfo | null>(null);
  useEffect(() => {
    if (!path) return;
    return maps.events.on("changed", (changed) => {
      if (changed === path) setVersion((v) => v + 1);
    });
  }, [maps, path]);
  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    maps.load(path).then(
      (map) => {
        if (!cancelled) setInfo({ path, map, error: null });
      },
      (e: Error) => {
        if (!cancelled) setInfo({ path, map: null, error: e.message });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [maps, path, version]);
  return info && info.path === path ? info : null;
}

function mapSummary(map: MapData): string {
  return `${map.width}x${map.height} 칸, 타일 ${map.tileWidth}x${map.tileHeight}, 레이어 ${map.layers.length}`;
}

export const TilemapInspector = observer(function TilemapInspector({ document, object }: ObjectInspectorProps) {
  const editor = useEditor();
  const files = useMapFiles();
  const p = readTilemapProps(object.props);
  const info = useMapInfo(p.map);
  const set = (key: string, value: unknown, session?: string) => {
    if (!document.scene.find(object.id)) return;
    editor.sceneTools.apply(document, document.scene.setProp(object.id, key, value, session));
  };
  const options = p.map && !files.includes(p.map) ? [p.map, ...files] : files;
  const layers = info?.map?.layers.length ?? null;
  return (
    <div className="inspector-section" data-testid="inspector-tilemap">
      <FieldRow label="맵 파일" hint="resources/maps/ 아래의 맵 (엔진 맵 포맷 v2)">
        <select className="select field-select" value={p.map} onChange={(e) => set("map", e.target.value)} data-testid="prop-map" aria-label="맵 파일">
          <option value="">(없음)</option>
          {options.map((path) => (
            <option key={path} value={path}>
              {path}
            </option>
          ))}
        </select>
      </FieldRow>
      <FieldRow label="바닥 레이어 수" hint="게임에서 다른 오브젝트 아래에 그리는 레이어 수. 나머지는 위에 그린다">
        <NumberField
          value={p.groundLayers}
          onChange={(v, s) => set("groundLayers", v, s)}
          sessionPrefix={`prop:${object.id}:groundLayers`}
          min={0}
          integer
          testId="prop-groundLayers"
          ariaLabel="바닥 레이어 수"
        />
      </FieldRow>
      <FieldRow label="맵 문서">
        <button type="button" className="btn" disabled={!p.map} onClick={() => void editor.openPath(p.map)} data-testid="tilemap-open-map" title="맵 파일을 맵 뷰로 연다">
          맵 열기
        </button>
      </FieldRow>
      {p.map && (
        <div className="inspector-note muted" data-testid="tilemap-map-info">
          {info === null ? "읽는 중" : info.map ? mapSummary(info.map) : `읽지 못했다: ${info.error}`}
        </div>
      )}
      {layers !== null && p.groundLayers > layers && (
        <div className="inspector-note muted" data-testid="tilemap-ground-note">
          바닥 레이어 수가 맵의 레이어 수({layers})보다 많다. 게임은 레이어를 모두 아래에 그린다
        </div>
      )}
    </div>
  );
});
