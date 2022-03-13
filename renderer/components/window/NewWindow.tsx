import { useState } from "react";
import { BaseWindowFrame } from "./BaseWindowFrame";

type Project = {
    path: FileList;
    author: string;
};

export function NewWindow(children?: React.ReactNode) {
    const [project, setProject] = useState<Project>({
        path: Array.from([])[0],
        author: "",
    });

    const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        project.path = e.target.files;
    };

    return (
        <BaseWindowFrame props={{ width: 256, height: 256 }}>
            <div className="newContainer">
                <div id="newWindow" window-name="게임 속성" ref="newWindow">
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
                            <input
                                type="file"
                                placeholder=""
                                multiple
                                onChange={onFileChange}
                            />
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
