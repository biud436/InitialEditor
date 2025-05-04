import App from "../app";
import { EmptySegment } from "./EmptySegment";
const FileToolbar = [
    {
        name: "파일 만들기",
        children: "file-new",
        action: (ev) => {
            if (App.GetInstance()) {
                App.GetInstance().emit("openWindow", {
                    path: "/newWindow",
                });
            }
        },
    },
    {
        name: "파일 열기",
        children: "file-open",
        action: (ev) => { },
    },
    {
        name: "파일 저장",
        children: "file-save",
        action: (ev) => { },
    },
    {
        name: "파일 저장",
        children: "edit-undo",
        action: (ev) => { },
    },
    EmptySegment,
];
export { FileToolbar };
//# sourceMappingURL=FileToolbar.js.map