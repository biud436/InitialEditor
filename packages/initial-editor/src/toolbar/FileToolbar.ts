import App from "../app";
import { EmptySegment } from "./EmptySegment";
import { ToolbarBase } from "./interface/toolbar.dto";

const FileToolbar: ToolbarBase[] = [
    {
        name: "새 맵",
        children: "file-new",
        action: (ev: unknown) => {
            if (App.GetInstance()) {
                App.GetInstance().emit("openWindow", {
                    path: "/newMap",
                });
            }
        },
    },
    {
        name: "맵 열기",
        children: "file-open",
        action: (ev: unknown) => {
            if (App.GetInstance()) {
                App.GetInstance().emit("openWindow", {
                    path: "/openMap",
                });
            }
        },
    },
    {
        name: "맵 저장",
        children: "file-save",
        action: (ev: unknown) => {
            if (App.GetInstance()) {
                App.GetInstance().emit("saveMap");
            }
        },
    },
    {
        name: "파일 저장",
        children: "edit-undo",
        action: (ev: unknown) => {},
    },
    EmptySegment,
];

export { FileToolbar };
