import { WindowCreator } from "../WindowCreator.js";

const GameMenu = {
    name: "게임",
    children: {
        "game-playtest": {
            name: "플레이 테스트",
            children: {},
            action: (ev) => {
                alert("플레이 테스트 기능을 지원하지 않습니다.");
            },                      
        },
        "game-fullscreen": {
            name: "전체 화면",
            children: {}, 
            action: (ev) => {
                
            },                     
        },
        "game-show-console": {
            name: "콘솔 표시",
            children: {}, 
            action: (ev) => {
            },                       
        },
        "game-folder-open": {
            name: "게임 폴더 열기",
            children: {}, 
            action: (ev) => {
                const cp = require('child_process');
                const cwd = process.cwd();
                cp.execSync(`start ${cwd}`, {
                    encoding: "utf8"
                });
            },                      
        },
    },
};

export {GameMenu};