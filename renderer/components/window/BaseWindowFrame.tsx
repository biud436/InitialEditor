import { ReactSVG, useEffect, useState } from "react";
import styles from "./BaseWindowFrame.module.css";
import Draggable from "react-draggable";
import styled from "styled-components";
import { useRouter } from "next/dist/client/router";

const WindowFrameHeader = styled.div`
    width: ${(props) => props.theme.width + "px"};
    height: ${(props) => props.theme.width + "px"};
    position: relative;
    left: 50%;
    display: flex;
    align-self: center;
    background-color: #252526;
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
    const [name, setName] = useState("");

    const [title, setTitle] = useState("");
    const [isActive, setIsActive] = useState(true);
    const [theme, setTheme] = useState({
        width: props.width,
        height: props.height,
    });

    const router = useRouter();

    const goToHome = () => {
        router.push("/");
    };

    useEffect(() => {});

    return (
        <Draggable grid={[16, 16]}>
            <div className={styles.background}>
                <WindowFrameHeader theme={theme}>
                    <p>
                        <span>
                            <i
                                className="far fa-window-close"
                                onClick={goToHome}
                            />
                        </span>
                    </p>
                    부모 창의 헤더
                </WindowFrameHeader>
                <div className="window-frame-body">
                    <div data-name="content">{children}</div>
                </div>
            </div>
            {/* <style jsx>
                {`
                    .background {
                        width: 100%;
                        height: 100%;
                        position: relative;
                        left: 50%;
                        display: flex;
                        align-self: center;
                        background-color: #252526;
                    }
                `}
            </style> */}
        </Draggable>
    );
}

//
