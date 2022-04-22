import { useReducer, useState } from "react";
import { BaseWindowFrame } from "./BaseWindowFrame";

type Project = {
    path: FileList;
    author: string;
};

type ReactWindowProps = { children: React.ReactNode };

function onFileChangeReducer(
    state: Project,
    action: { type: string; payload: any }
) {
    switch (action.type) {
        case "setPath":
            return { ...state, path: action.payload };
        case "setAuthor":
            return { ...state, author: action.payload };
        default:
            return state;
    }
}

export default function NewWindow({ children }: ReactWindowProps) {
    const close = () => {
        console.log("close");
    };

    return (
        <BaseWindowFrame props={{ width: 256, height: 256 }}>
            <div className="newContainer">
                <div id="newWindow" window-name="게임 속성">
                    <ul>
                        <li>
                            <label htmlFor="name">게임명 : </label>
                            <input
                                type="text"
                                placeholder="name"
                                v-model="title"
                            />
                        </li>
                        <li>
                            <label htmlFor="name">위치 : </label>
                            <input type="file" placeholder="" multiple />
                        </li>
                        <li>
                            <label htmlFor="name">작성자 명 : </label>
                            <input
                                type="text"
                                placeholder=""
                                v-model="project.author"
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
                            <i className="fas fa-upload"></i>프로젝트 생성
                        </button>
                    </div>
                </div>
            </div>
        </BaseWindowFrame>
    );
}
