import { WindowCreator } from "../WindowCreator";
import * as electron from "electron";
import { ElectronService } from "../ElectronService";

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
            children: {},
            action: function(ev: any) {
                ElectronService.getInstance().showErrorMessageBox(
                    "알림",
                    "아직 지원하지 않는 기능입니다"
                );
            }
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
                const service = ElectronService.getInstance();
                service.quit();
            }
        }
    }
};

if (process.platform === "darwin") {
    electron.ipcRenderer.on("new-file", () => {
        FileMenu.children["file-new"].action(null);
    });
}

export { FileMenu };
