import { ReactSVG, useEffect, useState } from "react";
import styles from "./BaseWindowFrame.module.css";
import Draggable from "react-draggable";
import styled from "styled-components";
import { useRecoilState } from "recoil";
import { WindowState } from "../../recoil/window";
import { Division } from "@components/atomics/Wrapper";
import { Paragraph } from "@components/atomics/Paragraph";

const WindowFrameHeader = styled.div`
    width: ${(props) => props.theme.width + "px"};
    height: ${(props) => props.theme.height + "px"};
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

export function BaseWindowFrame({
    children,
    props,
}: ReactBaseWindowLayoutProps) {
    const [panel, setPanel] = useRecoilState(WindowState);

    const close = () => {
        setPanel({
            currentWindow: "none",
        });
    };

    const [name, setName] = useState("");
    const [title, setTitle] = useState("");
    const [isActive, setIsActive] = useState(true);
    const [theme, setTheme] = useState({
        width: props.width,
        height: props.height,
    });

    return (
        <Draggable grid={[16, 16]}>
            <Division className={styles.background}>
                <WindowFrameHeader theme={theme}>
                    <Paragraph></Paragraph>
                </WindowFrameHeader>
                <Division className={styles.windowFrameBody}>
                    <Division data-name="content">{children}</Division>
                </Division>
            </Division>
        </Draggable>
    );
}
