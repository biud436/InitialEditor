import styled from 'styled-components';

export const ListContainer = styled.ul`
    li {
        display: flex;
        align-items: center;
        justify-content: center;

        cursor: pointer;

        border-radius: 4px;

        padding-left: 4px;
        padding-right: 4px;

        i {
            display: flex;

            justify-content: center;
            align-items: center;

            font-size: 16px;

            color: var(--dark-text-color);

            &:hover {
                color: var(--dark-shadow-color);
            }
        }
    }
`;
