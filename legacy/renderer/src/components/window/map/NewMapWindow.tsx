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

const MAX_SIDE = 512;

/** 새 맵 만들기 (Ctrl+N) — 크기를 자유롭게 정할 수 있다 */
export default function NewMapWindow() {
  const { close } = useClose();
  const mapDocument = useMapDocument();
  const notify = useToast();
  const current = mapDocument.info();

  const [name, setName] = useState(current.name || 'map1');
  const [id, setId] = useState(String(current.id || 1));
  const [width, setWidth] = useState(String(current.width));
  const [height, setHeight] = useState(String(current.height));
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(() => {
    const w = Number(width);
    const h = Number(height);
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1) {
      setError('가로와 세로는 1 이상의 정수여야 합니다.');
      return;
    }
    if (w > MAX_SIDE || h > MAX_SIDE) {
      setError(`가로와 세로는 ${MAX_SIDE} 이하로 정하세요.`);
      return;
    }
    try {
      const info = mapDocument.newMap({
        name: name.trim() || 'map1',
        id: Number(id) || 1,
        width: w,
        height: h,
      });
      notify(`새 맵 "${info.name}" (${info.width}x${info.height})`);
      close();
    } catch (e) {
      setError((e as Error).message);
    }
  }, [width, height, name, id, mapDocument, notify, close]);

  return (
    <DialogFrame id="newMapDialog" title="새 맵" width={380} onClose={close}>
      <DialogContent>
        <FieldRow>
          <span>맵 이름</span>
          <input value={name} onChange={e => setName(e.target.value)} />
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
          <span>가로 (타일)</span>
          <input
            type="number"
            min={1}
            max={MAX_SIDE}
            value={width}
            onChange={e => setWidth(e.target.value)}
          />
        </FieldRow>
        <FieldRow>
          <span>세로 (타일)</span>
          <input
            type="number"
            min={1}
            max={MAX_SIDE}
            value={height}
            onChange={e => setHeight(e.target.value)}
          />
        </FieldRow>
        <DialogHint $kind={error ? 'error' : undefined}>
          {error ??
            '지금 편집 중인 맵은 사라집니다. 저장하려면 먼저 Ctrl+S 또는 내보내기(Ctrl+E)를 하세요.'}
        </DialogHint>
      </DialogContent>
      <DialogFooter>
        <span className="dlg-spacer" />
        <DialogButton onClick={create}>만들기</DialogButton>
        <DialogButton onClick={close}>취소</DialogButton>
      </DialogFooter>
    </DialogFrame>
  );
}
