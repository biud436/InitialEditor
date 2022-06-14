import { useRecoilState } from "recoil";
import { WindowState, WindowType } from "../../recoil/window";
import styles from "./Widget.module.css";
import NewWindow from "./NewWindow";
import { useRef, useState } from "react";
import OptionWindow from "./OptionWindow";
import { WidgetProvider } from "../../providers/window.providers";

type WidgetLayoutProps = {
    children?: React.ReactNode;
};

export default function Widget({ children }: WidgetLayoutProps) {
    return (
        <div className={styles.widget}>
            {children}
            <WidgetProvider />
        </div>
    );
}
