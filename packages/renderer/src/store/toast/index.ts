import { atom, RecoilState } from 'recoil';

export type ToastKind = 'info' | 'error' | 'warn';

export type ToastImpl = {
  id: number;
  kind: ToastKind;
  message: string;
} | null;

/**
 * 화면 오른쪽 아래에 잠깐 뜨는 알림. window.alert 과 달리 실행을 막지 않는다.
 * (브라우저 모달은 자동화와 편집 흐름을 모두 끊는다)
 */
export const ToastState = <RecoilState<ToastImpl>>atom({
  key: 'toastState',
  default: null,
});
