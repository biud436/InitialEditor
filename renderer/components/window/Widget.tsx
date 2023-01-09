import { WidgetProvider } from "../../providers/window.providers";
import { Division } from "@components/atomics/Wrapper";
import styled from "styled-components";
import classnames from "classnames";

type WidgetLayoutProps = {
    children?: React.ReactNode;
};

const WidgetWrapper = styled.div`
    .widget {
        z-index: 1;
        position: absolute;
        left: 0;
        top: 0;
    }
`;

export default function Widget({ children }: WidgetLayoutProps) {
    return (
        <WidgetWrapper>
            <Division className={classnames("widget")}>
                {children}
                <WidgetProvider />
            </Division>
        </WidgetWrapper>
    );
}
