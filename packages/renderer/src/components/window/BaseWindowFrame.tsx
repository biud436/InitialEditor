import { useState } from 'react';
import Draggable from 'react-draggable';
import styled from 'styled-components';
import { Box } from '@components/atomics/Box';
import { Paragraph } from '@components/atomics/Paragraph';
import classNames from 'classnames';

const WindowFrameHeader = styled.div`
    width: ${props => props.theme.width + 'px'};
    height: ${props => props.theme.height + 'px'};
    position: relative;
    left: 50%;
    display: flex;
    align-self: center;
`;

export type ReactBaseWindowLayoutProps = {
    children: React.ReactNode;
    props: {
        width: number;
        height: number;
    };
};

const BaseWindowFrameWrapper = styled.div`
    .background {
        width: 100%;
        height: 100%;
        position: relative;
        left: 50%;
        display: flex;
        align-self: center;
    }

    .windowFrameBody {
        height: 2.5em;
        line-height: 2.5em;
    }
`;

export function BaseWindowFrame({
    children,
    props,
}: ReactBaseWindowLayoutProps) {
    const [theme] = useState({
        width: props.width,
        height: props.height,
    });

    return (
        <BaseWindowFrameWrapper>
            <Draggable grid={[16, 16]}>
                <Box className={classNames(`background`)}>
                    <WindowFrameHeader theme={theme}>
                        <Paragraph></Paragraph>
                    </WindowFrameHeader>
                    <Box className={classNames('windowFrameBody')}>
                        <Box data-name="content">{children}</Box>
                    </Box>
                </Box>
            </Draggable>
        </BaseWindowFrameWrapper>
    );
}
