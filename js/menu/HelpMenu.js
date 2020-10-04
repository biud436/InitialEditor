import { WindowCreator } from "../WindowCreator.js";

const HelpMenu = {
    name: "도움말",
    children: {
        "help-contents": {
            name: "도움말",
            children: {},
            action: (ev) => {
                alert("도움말이 아직 없습니다.");
            },
        },
        "help-about": {
            name: "버전 정보",
            children: {}, 
            action: (ev) => {
                
            },                    
        },
    },
};

export {HelpMenu};