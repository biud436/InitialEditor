import { IconItem } from '@components/atomics/IconItem';
import { Paragraph } from '@components/atomics/Paragraph';
import { Span } from '@components/atomics/Span';
import { Box } from '@components/atomics/Box';
import styled from 'styled-components';

interface ClosePanelProps {
    close: () => void;
}

const ButtonWrapper = styled(Span)`
    font-size: 1.2rem;
    color: white;
    cursor: pointer;
    display: flex;
    justify-content: center;
    align-items: center;

    i:hover {
        color: var(--dark-selection-color);
    }

    i:active {
        color: var(--dark-shadow-color);
    }
`;

export function ClosePanel({ close }: ClosePanelProps) {
    return (
        <Box
            className="tilesetWindow__control-box"
            style={{
                alignSelf: 'flex-end',
                position: 'absolute',
                top: '-0.2rem',
            }}
        >
            <Paragraph>
                <ButtonWrapper
                    style={{
                        fontSize: '1.2rem',
                        color: 'white',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        paddingLeft: 1,
                    }}
                >
                    <IconItem
                        className="far fa-window-close"
                        onClick={close}
                    ></IconItem>
                </ButtonWrapper>
            </Paragraph>
        </Box>
    );
}
