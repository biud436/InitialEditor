import { useClose } from '@hooks/useClose';
import styled from 'styled-components';

const IconWrapper = styled.i`
    cursor: pointer;
`;

export function CloseButton() {
    const { close } = useClose();

    return <IconWrapper className="far fa-window-close" onClick={close} />;
}
