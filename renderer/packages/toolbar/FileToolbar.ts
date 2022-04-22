import { EmptySegment } from "./EmptySegment";
import { WindowCreator } from "../WindowCreator";
import { ToolbarBase } from "./interface/toolbar.dto";
import { useRecoilState } from "recoil";
import { WindowState } from "../../recoil/window";

const FileToolbar: ToolbarBase[] = [
    {
        name: "파일 만들기",
        children: "file-new",
        action: (ev: any) => {
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
        action: (ev: any) => {
            WindowCreator.GrapWindow(ev);
        },
    },
    {
        name: "파일 저장",
        children: "file-save",
        action: (ev: any) => {
            WindowCreator.GrapWindow(ev);
        },
    },
    {
        name: "파일 저장",
        children: "edit-undo",
        action: (ev: any) => {
            WindowCreator.GrapWindow(ev);
        },
    },
    EmptySegment,
];

export { FileToolbar };
