import { ReactNode, useCallback, useMemo } from 'react';
import Draggable from 'react-draggable';
import styled from 'styled-components';

export interface DialogFrameProps {
  /**
   * 창 요소의 id. 전역 CSS 에 `div[id*='Window']::before` 규칙이 있어 id 에 "Window" 가
   * 들어가면 제목줄 위에 빈 막대가 덧그려진다. 새 창은 "...Dialog" 로 짓는다.
   */
  id: string;
  title: string;
  width: number;
  height?: number;
  onClose: () => void;
  children: ReactNode;
}

/**
 * 드래그 가능한 창 프레임. 제목줄만 손잡이이고, 창 안에서 시작한 마우스 입력은
 * 에디터 코어(window 수준 mousedown 으로 맵에 타일을 칠한다)로 새지 않게 막는다.
 */
export function DialogFrame({
  id,
  title,
  width,
  height,
  onClose,
  children,
}: DialogFrameProps) {
  const defaultPosition = useMemo(
    () => ({
      x: Math.max(0, Math.floor((window.innerWidth - width) / 2)),
      y: Math.max(0, Math.floor((window.innerHeight - (height ?? 320)) / 2)),
    }),
    [width, height],
  );
  const stopMouseDown = useCallback(
    (ev: React.MouseEvent) => ev.stopPropagation(),
    [],
  );

  return (
    <Draggable grid={[16, 16]} handle=".dlg-title" defaultPosition={defaultPosition}>
      <Frame id={id} style={{ width, height }}>
        <TitleBar className="dlg-title">
          <span>{title}</span>
          <TitleButton onClick={onClose} title="닫기">
            <i className="far fa-window-close" />
          </TitleButton>
        </TitleBar>
        <Body onMouseDown={stopMouseDown}>{children}</Body>
      </Frame>
    </Draggable>
  );
}

const Frame = styled.div`
  display: flex;
  flex-direction: column;
  background-color: var(--dark-title-color);
  color: var(--dark-text-color);
  border: 1px solid var(--dark-border-color);
  box-shadow: 2px 2px 6px var(--dark-shadow-color);
  box-sizing: border-box;
  font-family: menu;
  font-size: 0.9rem;
  overflow: hidden;
`;

const TitleBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 2rem;
  padding: 0 0.6rem;
  cursor: move;
  user-select: none;
  background: linear-gradient(
    to bottom,
    var(--dark-title-color) 0%,
    var(--dark-shadow-color) 100%
  );
  border-bottom: 1px solid var(--dark-border-color);
`;

const TitleButton = styled.button`
  background: transparent;
  border: none;
  color: var(--dark-text-color);
  cursor: pointer;
  font-size: 1rem;
  &:hover {
    color: white;
  }
`;

const Body = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
`;

/** 대화상자 공용 부품 */
export const DialogContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.8rem;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
`;

export const FieldRow = styled.label`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  span {
    width: 6rem;
    flex-shrink: 0;
  }
  input {
    flex: 1;
    min-width: 0;
    padding: 0.25rem 0.4rem;
    background-color: var(--dark-input-background-color);
    color: var(--dark-input-text-color);
    border: 1px solid var(--dark-border-color);
  }
  input[type='number'] {
    max-width: 7rem;
  }
`;

export const DialogFooter = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.8rem;
  border-top: 1px solid var(--dark-border-color);
  .dlg-spacer {
    flex: 1;
  }
`;

export const DialogButton = styled.button`
  background-color: var(--dark-title-color);
  color: var(--dark-text-color);
  border: 1px solid var(--dark-border-color);
  padding: 0.25rem 0.8rem;
  cursor: pointer;
  &:hover:not(:disabled) {
    background-color: var(--dark-selection-color);
    color: white;
  }
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

export const DialogHint = styled.p<{ $kind?: 'info' | 'error' | 'warn' }>`
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.5;
  white-space: pre-wrap;
  color: ${p =>
    p.$kind === 'error' ? '#ff8a80' : p.$kind === 'warn' ? '#ffd54f' : 'inherit'};
  opacity: ${p => (p.$kind ? 1 : 0.8)};
`;
