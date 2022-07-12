import electronServe from "electron-serve";
import { useMemo, useReducer, useState } from "react";
import { useRecoilState } from "recoil";
import { useClose as useClose } from "../../providers/window.providers";
import { WindowState } from "../../recoil/window";
import { BaseWindowFrame } from "./BaseWindowFrame";
import useTranslation from "next-translate/useTranslation";

type Project = {
    path: FileList;
    author: string;
};

type ReactWindowProps = { children: React.ReactNode };

export default function NewWindow({ children }: ReactWindowProps) {
    const { close } = useClose();
    const [gameName, setGameName] = useState("");
    const [, setFileName] = useState("");
    const { t } = useTranslation("common");

    const windowRect = useMemo(() => {
        return {
            width: 256,
            height: 256,
        };
    }, []) as { width: number; height: number };

    const onChangeGameName = (e: React.ChangeEvent<HTMLInputElement>) => {
        setGameName(e.target.value);
    };

    const onChangeFileName = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFileName(e.target.value);
    };

    return (
        <BaseWindowFrame props={windowRect}>
            <div className="newContainer">
                <div id="newWindow" window-name="게임 속성">
                    <ul>
                        <li>
                            <label htmlFor="name">{t("gameName")}</label>
                            <input
                                type="text"
                                placeholder="name"
                                value={gameName}
                                onChange={onChangeGameName}
                            />
                        </li>
                        <li>
                            <label htmlFor="name">{t("gameFile")}</label>
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
                            {t("newGame")}
                        </button>
                    </div>
                </div>
            </div>
        </BaseWindowFrame>
    );
}
