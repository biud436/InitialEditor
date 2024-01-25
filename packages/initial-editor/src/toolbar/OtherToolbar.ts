import { EmptySegment } from "./EmptySegment";
import { ToolbarBase } from "./interface/toolbar.dto";

const OtherToolbar: ToolbarBase[] = [
    {
        name: "",
        children: "take-screenshot",
        action: (ev: any) => {
            (document.querySelector("#take-screenshot") as HTMLElement).click();
        },
    },
    {
        name: "",
        children: "tools-resource-manager",
        action: (ev: any) => {},
    },
    {
        name: "",
        children: "tools-script-editor",
        action: (ev: any) => {
            if (window.app) {
                window.app.emit("openWindow", {
                    path: "/scriptEditor",
                });
            }
        },
    },
    {
        name: "",
        children: "tools-sound-test",
        action: (ev: any) => {},
    },
    EmptySegment,
    {
        name: "",
        children: "tools-options",
        action: (ev: any) => {
            if (window.app) {
                window.app.emit("openWindow", {
                    path: "/optionWindow",
                });
            }
        },
    },
    EmptySegment,
    {
        name: "",
        children: "game-playtest",
        action: (ev: any) => {},
    },
    EmptySegment,
    {
        name: "",
        children: "game-folder-open",
        action: (ev: any) => {
            alert("폴더 열기는 웹 버전에선 지원하지 않습니다.");
        },
    },
];

export { OtherToolbar };
