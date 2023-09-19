import { Button } from '@components/atomics/Button';
import { Box } from '@components/atomics/Box';
import { styled } from 'styled-components';

interface HorizontalStackProps {
    gap: string;
}

export const HorizontalStack = styled.div<HorizontalStackProps>`
    display: flex;
    flex-direction: row;
    gap: ${props => props.gap};
`;

interface ConfirmPanelProps {
    ok: () => void;
    close: () => void;
}

export function ConfirmPanel({ ok, close }: ConfirmPanelProps) {
    return (
        <Box className="tilesetWindow__panel">
            <HorizontalStack gap="0.5rem">
                <Button className="ok" onClick={ok}>
                    확인
                </Button>
                <Button className="cancel" onClick={close}>
                    취소
                </Button>
            </HorizontalStack>
        </Box>
    );
}
