import styled from 'styled-components';

interface ButtonProps {
    borderRadius?: string;
}
export const Button = styled.button<ButtonProps>`
    padding: 0.3rem 0.3rem;
    border: 1px solid #5a5a5a;
    border-radius: ${props => props.borderRadius || '3px'};

    background-color: #5a5a5a;
    color: white;

    &:hover {
        background-color: #363636;
        color: #f1f1f1;
    }

    &:active {
        background-color: #363636;
        color: #dadada;
    }
`;
