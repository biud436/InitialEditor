import { EmptySegment } from "./EmptySegment";
import { ToolbarBase } from "./interface/toolbar.dto";

const FileToolbar: ToolbarBase[] = [
    {
        name: "파일 만들기",
        children: "file-new",
        action: (ev: unknown) => {
            if (window.app) {
                window.app.emit("openWindow", {
                    path: "/newWindow",
                });
            }
        },
    },
    {
        name: "파일 열기",
        children: "file-open",
        action: (ev: unknown) => {},
    },
    {
        name: "파일 저장",
        children: "file-save",
        action: (ev: unknown) => {},
    },
    {
        name: "파일 저장",
        children: "edit-undo",
        action: (ev: unknown) => {},
    },
    EmptySegment,
];

export { FileToolbar };
