import { useMemo, useState } from "react";
import { useClose as useClose } from "../../providers/window.providers";
import { BaseWindowFrame } from "./BaseWindowFrame";
import styled from "styled-components";
import { Division } from "@components/atomics/Wrapper";
import { ListContainer } from "@components/atomics/ListContainer";
import { Button } from "@components/atomics/Button";
import { Paragraph } from "@components/atomics/Paragraph";
import { Label } from "@components/atomics/Label";
import { Input } from "@components/atomics/Input";
import { Span } from "@components/atomics/Span";
import { IconItem } from "@components/atomics/IconItem";

export type Project = {
    path: FileList;
    author: string;
};

export type ReactWindowProps = { children: React.ReactNode };
export type HTMLInputEvent = React.ChangeEvent<HTMLInputElement>;
export interface WindowRect {
    width: number;
    height: number;
}

export default function NewWindow({ children }: ReactWindowProps) {
    const { close } = useClose();
    const [gameName, setGameName] = useState("");
    const [, setFileName] = useState("");

    const windowRect = useMemo(() => {
        return {
            width: 256,
            height: 256,
        };
    }, []) as WindowRect;

    const onChangeGameName = (e: HTMLInputEvent) => {
        setGameName(e.target.value);
    };

    const onChangeFileName = (e: HTMLInputEvent) => {
        setFileName(e.target.value);
    };

    return (
        <BaseWindowFrame props={windowRect}>
            <div className="newContainer">
                <div id="newWindow" window-name={"gameProperty"}>
                    <ul>
                        <li key="583334c93fe9fa509d811fc0b2928056_gameName">
                            <label htmlFor="name">{gameName}</label>
                            <input
                                type="text"
                                placeholder="name"
                                value={gameName}
                                onChange={onChangeGameName}
                            />
                        </li>
                        <li key="583334c93fe9fa509d811fc0b2928056_gameFile">
                            <label htmlFor="name">{"gameFile"}</label>
                            <input
                                type="file"
                                placeholder=""
                                multiple
                                accept="directory"
                                onChange={onChangeFileName}
                            />
                        </li>
                    </ul>
                    <div className="newWindow__control-box">
                        <p>
                            <span>
                                <i
                                    className="far fa-window-close"
                                    id="action-close"
                                    onClick={close}
                                ></i>
                            </span>
                        </p>
                    </div>
                    <div className="panel">
                        <button>
                            <i className="fas fa-upload"></i>
                            {"newGame"}
                        </button>
                    </div>
                </div>
            </div>
        </BaseWindowFrame>
    );
}
