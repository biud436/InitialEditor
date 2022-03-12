import { useEffect, useState } from "react";
import styles from "./BaseWindowFrame.module.css";

export function BaseWindowFrame() {
    const [name, setName] = useState("");
    const [width, setWidth] = useState(0);
    const [height, setHeight] = useState(0);

    const [title, setTitle] = useState("");
    const [isActive, setIsActive] = useState(true);
    const [theme, setTheme] = useState({
        width: 256,
        height: 512,
    });

    useEffect(() => {});

    return <div className={styles.background}></div>;
}
