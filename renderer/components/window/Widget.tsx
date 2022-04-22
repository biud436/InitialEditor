import { useRecoilState } from "recoil";
import { WindowState, WindowType } from "../../recoil/window";
import styles from "./Widget.module.css";
import NewWindow from "./NewWindow";
import { useRef, useState } from "react";

type WidgetLayoutProps = {
    children?: React.ReactNode;
};

function getCurrentWindow(currentWindow: WindowType) {
    switch (currentWindow) {
        case "none":
            return <></>;
        case "newWindow":
            return (
                <NewWindow>
                    <span></span>
                </NewWindow>
            );
        case "tilesetWindow":
            return <div>Tileset Window</div>;
    }
}

export default function Widget({ children }: WidgetLayoutProps) {
    const [panel, setPanel] = useRecoilState(WindowState);
    const currentWindow = panel.currentWindow;

    return (
        <div className={styles.widget}>
            {children}
            {getCurrentWindow(currentWindow)}
        </div>
    );
}
