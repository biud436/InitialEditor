import { WindowCreator } from "../WindowCreator";
import { ElectronService } from "../ElectronService";

const GameMenu = {
    name: "게임",
    children: {
        "game-playtest": {
            name: "플레이 테스트",
            children: {},
            action: (ev: any) => {
                alert("플레이 테스트 기능을 지원하지 않습니다.");
            }
        },
        "game-fullscreen": {
            name: "전체 화면",
            children: {},
            action: (ev: any) => {}
        },
        "game-show-console": {
            name: "콘솔 표시",
            children: {},
            action: (ev: any) => {}
        },
        "game-folder-open": {
            name: "게임 폴더 열기",
            children: {},
            action: (ev: any) => {
                const service = new ElectronService();
                if (process.platform === "darwin") {
                    service.openFolder(__dirname);
                } else {
                    service.openFolder();
                }
            }
        }
    }
};

export { GameMenu };
