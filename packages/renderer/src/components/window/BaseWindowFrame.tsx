import { useRef, useState } from 'react';
import Draggable from 'react-draggable';
import styled from 'styled-components';
import { Box } from '@components/atomics/Box';
import { Paragraph } from '@components/atomics/Paragraph';
import classNames from 'classnames';
import { getWindowCenterPosition } from '@libs/getWindowCenterPosition';

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
    const ref = useRef<HTMLDivElement>(null);

    return (
        <BaseWindowFrameWrapper
            style={{
                width: props.width + 'px',
                height: props.height + 'px',
            }}
        >
            <Draggable
                grid={[16, 16]}
                defaultPosition={getWindowCenterPosition(ref)}
            >
                <Box className={classNames(`background`)}>
                    <WindowFrameHeader theme={theme}>
                        <Paragraph></Paragraph>
                    </WindowFrameHeader>
                    <Box className={classNames('windowFrameBody')}>
                        <Box data-name="content" ref={ref}>
                            {children}
                        </Box>
                    </Box>
                </Box>
            </Draggable>
        </BaseWindowFrameWrapper>
    );
}
