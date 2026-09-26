import { useEffect } from 'react';
import { useRecoilState } from 'recoil';
import styled from 'styled-components';
import { ToastState } from '@store/toast';

const HIDE_AFTER_MS = 5000;

export function Toast() {
  const [toast, setToast] = useRecoilState(ToastState);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), HIDE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [toast, setToast]);

  if (!toast) return null;

  return (
    <Wrapper
      $kind={toast.kind}
      role="status"
      data-testid="toast"
      onClick={() => setToast(null)}
      title="클릭하면 닫힙니다"
    >
      {toast.message}
    </Wrapper>
  );
}

const Wrapper = styled.div<{ $kind: 'info' | 'error' | 'warn' }>`
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 10001;
  max-width: 32rem;
  padding: 0.6rem 0.9rem;
  font-family: menu;
  font-size: 0.9rem;
  line-height: 1.4;
  color: #f5f5f5;
  cursor: pointer;
  white-space: pre-wrap;
  border: 1px solid var(--dark-border-color);
  box-shadow: 2px 2px 6px var(--dark-shadow-color);
  background: ${p =>
    p.$kind === 'error' ? '#7a2f2f' : p.$kind === 'warn' ? '#6b5a1e' : '#3c3c3c'};
`;
