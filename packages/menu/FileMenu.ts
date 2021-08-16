import { WindowCreator } from "../WindowCreator";

const FileMenu = {
    name: "파일",
    children: {
        "file-new": {
            name: "새로 만들기",
            children: {},
            shortcut: ["ctrl", "n"],
            action: function(ev: any) {
                if (window.app) {
                    window.app.emit("openWindow", {
                        path: "/newWindow"
                    });
                }
            }
        },
        "file-open": {
            name: "파일 열기",
            shortcut: ["ctrl", "o"],
            children: {}
        },
        "file-close": {
            name: "파일 닫기",
            children: {}
        },
        "file-save": {
            name: "파일 저장",
            children: {}
        },
        "file-preferences": {
            name: "환경 설정",
            children: {}
        },
        "file-export": {
            name: "내보내기",
            children: {}
        },
        "file-exit": {
            name: "프로그램 종료",
            children: {},
            action: function(ev: any) {
                const { ipcRenderer } = require("electron");
                ipcRenderer.send("exit");
            }
        }
    }
};

export { FileMenu };
