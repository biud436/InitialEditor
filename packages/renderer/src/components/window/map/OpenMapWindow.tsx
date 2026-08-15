import { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import { useClose } from '@hooks/useClose';
import { useMapDocument } from '@hooks/useMapDocument';
import { useToast } from '@hooks/useToast';
import {
  DialogButton,
  DialogContent,
  DialogFooter,
  DialogFrame,
  DialogHint,
} from '../DialogFrame';

/** 맵 열기 (Ctrl+O) — 프로젝트의 resources/maps/*.json 목록에서 고른다 */
export default function OpenMapWindow() {
  const { close } = useClose();
  const mapDocument = useMapDocument();
  const notify = useToast();

  const [maps, setMaps] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const list = await mapDocument.listMaps();
      setMaps(list);
      setSelected(prev => (prev && list.includes(prev) ? prev : (list[0] ?? null)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [mapDocument]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const open = useCallback(
    async (path: string) => {
      setBusy(true);
      setError(null);
      try {
        const result = await mapDocument.open(path);
        const notes = [`${result.path} 열림 (${result.width}x${result.height})`];
        if (result.unknownTilesets.length > 0) {
          notes.push(
            `에디터에 없는 타일셋: ${result.unknownTilesets.join(', ')} — 해당 타일은 비었습니다`,
          );
        }
        if (result.droppedLayers > 0) {
          notes.push(`레이어 ${result.droppedLayers}개는 에디터 레이어 수를 넘어 버렸습니다`);
        }
        if (result.unrepresentableTiles > 0) {
          notes.push(
            `${result.unrepresentableTiles}칸은 첫 타일셋의 첫 타일이라 에디터에서 빈 칸이 됩니다 (0은 빈 칸 표시)`,
          );
        }
        notify(notes.join('\n'), notes.length > 1 ? 'warn' : 'info');
        close();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [mapDocument, notify, close],
  );

  return (
    <DialogFrame id="openMapDialog" title="맵 열기" width={520} height={420} onClose={close}>
      <DialogContent>
        <MapList>
          {maps.map(path => (
            <MapItem
              key={path}
              $active={path === selected}
              onClick={() => setSelected(path)}
              onDoubleClick={() => void open(path)}
              title={path}
            >
              {path.replace(/^resources\/maps\//, '')}
            </MapItem>
          ))}
          {maps.length === 0 && !busy && (
            <DialogHint>
              resources/maps/ 에 맵 파일이 없습니다. 맵을 그린 뒤 내보내기(Ctrl+E)로 만드세요.
            </DialogHint>
          )}
        </MapList>
        <DialogHint $kind={error ? 'error' : undefined}>
          {error ?? '더블클릭하거나 열기를 누르면 편집 중인 맵을 대체합니다.'}
        </DialogHint>
      </DialogContent>
      <DialogFooter>
        <DialogButton onClick={() => void refresh()} disabled={busy}>
          새로고침
        </DialogButton>
        <span className="dlg-spacer" />
        <DialogButton
          onClick={() => selected && void open(selected)}
          disabled={busy || !selected}
        >
          {busy ? '작업 중…' : '열기'}
        </DialogButton>
        <DialogButton onClick={close} disabled={busy}>
          취소
        </DialogButton>
      </DialogFooter>
    </DialogFrame>
  );
}

const MapList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  flex: 1;
  min-height: 8rem;
  overflow-y: auto;
  border: 1px solid var(--dark-border-color);
`;

const MapItem = styled.li<{ $active: boolean }>`
  padding: 0.3rem 0.6rem;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: ${p => (p.$active ? 'var(--dark-selection-color)' : 'transparent')};
  color: ${p => (p.$active ? 'white' : 'inherit')};
  &:hover {
    background: var(--dark-selection-color);
  }
`;
