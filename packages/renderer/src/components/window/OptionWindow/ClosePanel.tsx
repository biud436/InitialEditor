import { IconItem } from '@components/atomics/IconItem';
import { Paragraph } from '@components/atomics/Paragraph';
import { Span } from '@components/atomics/Span';
import { Box } from '@components/atomics/Box';

interface ClosePanelProps {
    close: () => void;
}

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
                <Span>
                    <IconItem
                        className="far fa-window-close"
                        onClick={close}
                    ></IconItem>
                </Span>
            </Paragraph>
        </Box>
    );
}
