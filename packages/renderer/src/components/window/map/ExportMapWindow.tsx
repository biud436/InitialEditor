import { useCallback, useState } from 'react';
import { useClose } from '@hooks/useClose';
import { useMapDocument } from '@hooks/useMapDocument';
import { useToast } from '@hooks/useToast';
import {
  DialogButton,
  DialogContent,
  DialogFooter,
  DialogFrame,
  DialogHint,
  FieldRow,
} from '../DialogFrame';

/**
 * 맵 내보내기 (Ctrl+E) — 맵 포맷 v1 로 프로젝트의 resources/maps/ 에 저장한다.
 * 맵이 쓰는 타일셋 이미지가 프로젝트에 없으면 함께 올린다 (엔진이 이미지를 못 찾으면 맵을 거부한다).
 */
export default function ExportMapWindow() {
  const { close } = useClose();
  const mapDocument = useMapDocument();
  const notify = useToast();
  const current = mapDocument.info();

  const [name, setName] = useState(current.name || 'map1');
  const [id, setId] = useState(String(current.id || 1));
  const [path, setPath] = useState(
    current.path || mapDocument.defaultPathFor(current.name || 'map1'),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onNameChange = useCallback(
    (value: string) => {
      // 아직 저장한 적이 없는 맵은 이름을 바꾸면 경로도 따라간다
      setPath(prev =>
        !current.path && prev === mapDocument.defaultPathFor(name)
          ? mapDocument.defaultPathFor(value)
          : prev,
      );
      setName(value);
    },
    [current.path, mapDocument, name],
  );

  const doExport = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await mapDocument.exportTo(path, {
        name: name.trim() || 'map1',
        id: Number(id) || 1,
      });
      const notes: string[] = [`${result.path} 저장 (${result.bytes} 바이트)`];
      if (result.uploadedTilesets.length > 0) {
        notes.push(`타일셋 ${result.uploadedTilesets.length}개를 프로젝트에 복사했습니다`);
      }
      if (result.droppedTiles > 0) {
        notes.push(`타일셋 밖 타일 ${result.droppedTiles}칸은 빈 칸으로 저장했습니다`);
      }
      notify(notes.join('\n'), result.droppedTiles > 0 ? 'warn' : 'info');
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [mapDocument, path, name, id, notify, close]);

  return (
    <DialogFrame id="exportMapDialog" title="맵 내보내기" width={520} onClose={close}>
      <DialogContent>
        <FieldRow>
          <span>맵 이름</span>
          <input value={name} onChange={e => onNameChange(e.target.value)} />
        </FieldRow>
        <FieldRow>
          <span>맵 ID</span>
          <input
            type="number"
            min={1}
            value={id}
            onChange={e => setId(e.target.value)}
          />
        </FieldRow>
        <FieldRow>
          <span>저장 경로</span>
          <input
            value={path}
            onChange={e => setPath(e.target.value)}
            spellCheck={false}
          />
        </FieldRow>
        <DialogHint $kind={error ? 'error' : undefined}>
          {error ??
            `${current.width}x${current.height} 맵을 포맷 v1 로 저장합니다. 경로는 프로젝트 루트 기준이며 resources/ 아래만 쓸 수 있습니다.`}
        </DialogHint>
      </DialogContent>
      <DialogFooter>
        <span className="dlg-spacer" />
        <DialogButton onClick={() => void doExport()} disabled={busy}>
          {busy ? '저장 중…' : '내보내기'}
        </DialogButton>
        <DialogButton onClick={close} disabled={busy}>
          취소
        </DialogButton>
      </DialogFooter>
    </DialogFrame>
  );
}
