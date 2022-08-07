import styled from "styled-components";

// export const Division = styled.div``;

export const Division = ({
    children,
    ...props
}: {
    children: React.ReactNode;
    className?: string;
}) => {
    return <div {...props}>{children}</div>;
};
