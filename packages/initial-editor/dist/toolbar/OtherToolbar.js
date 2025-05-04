import App from "../app";
import { EmptySegment } from "./EmptySegment";
const OtherToolbar = [
    {
        name: "",
        children: "take-screenshot",
        action: (ev) => {
            document.querySelector("#take-screenshot").click();
        },
    },
    {
        name: "",
        children: "tools-resource-manager",
        action: (ev) => { },
    },
    {
        name: "",
        children: "tools-script-editor",
        action: (ev) => {
            if (App.GetInstance()) {
                App.GetInstance().emit("openWindow", {
                    path: "/scriptEditor",
                });
            }
        },
    },
    {
        name: "",
        children: "tools-sound-test",
        action: (ev) => { },
    },
    EmptySegment,
    {
        name: "",
        children: "tools-options",
        action: (ev) => {
            if (App.GetInstance()) {
                App.GetInstance().emit("openWindow", {
                    path: "/optionWindow",
                });
            }
        },
    },
    EmptySegment,
    {
        name: "",
        children: "game-playtest",
        action: (ev) => { },
    },
    EmptySegment,
    {
        name: "",
        children: "game-folder-open",
        action: (ev) => {
            alert("폴더 열기는 웹 버전에선 지원하지 않습니다.");
        },
    },
];
export { OtherToolbar };
//# sourceMappingURL=OtherToolbar.js.map