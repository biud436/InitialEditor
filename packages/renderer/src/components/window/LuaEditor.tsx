import { useMemo } from 'react';
import styled from 'styled-components';
import { BaseWindowFrame } from './BaseWindowFrame';
import React from 'react';
import { useClose } from '@hooks/useClose';

const CodeEditor = React.lazy(() => import('../CodeEditor'));
interface WindowRect {
    width: number;
    height: number;
}

const ButtonWrapper = styled.div`
    .closeButton {
        padding: 1em;
        background-color: #e2e2e2;
        border: 1px solid #e2e2e2;
        border-radius: 0.2;
    }
`;

export function LuaEditor() {
    const { close } = useClose();
    const windowRect = useMemo(() => {
        return {
            width: 400,
            height: 450,
        };
    }, []) as WindowRect;

    return (
        <BaseWindowFrame props={windowRect}>
            <CodeEditor />
            <ButtonWrapper>
                <button onClick={close}>닫기</button>
            </ButtonWrapper>
        </BaseWindowFrame>
    );
}
