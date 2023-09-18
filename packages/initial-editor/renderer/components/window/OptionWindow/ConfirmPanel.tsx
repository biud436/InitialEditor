import { Button } from "@components/atomics/Button";
import { Division } from "@components/atomics/Wrapper";
import { styled } from "styled-components";

interface HorizontalStackProps {
    gap: string;
}

export const HorizontalStack = styled.div<HorizontalStackProps>`
    display: flex;
    flex-direction: row;
    gap: ${(props) => props.gap};
`;

export function ConfirmPanel({
    ok,
    close,
}: {
    ok: () => void;
    close: () => void;
}) {
    return (
        <Division className="tilesetWindow__panel">
            <HorizontalStack gap="0.5rem">
                <Button className="ok" onClick={ok}>
                    확인
                </Button>
                <Button className="cancel" onClick={close}>
                    취소
                </Button>
            </HorizontalStack>
        </Division>
    );
}
