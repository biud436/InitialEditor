import { useCallback } from 'react';
import { useSetRecoilState } from 'recoil';
import { ToastKind, ToastState } from '@store/toast';

let nextId = 1;

/** 짧은 알림을 띄운다. 같은 메시지를 다시 띄우면 표시 시간이 갱신된다. */
export function useToast() {
  const setToast = useSetRecoilState(ToastState);

  return useCallback(
    (message: string, kind: ToastKind = 'info') => {
      setToast({ id: nextId++, kind, message });
    },
    [setToast],
  );
}
