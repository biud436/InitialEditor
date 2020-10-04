import { WindowCreator } from "../WindowCreator.js";

const ModeMenu = {
    name: "모드",
    children: {
        "mode-map": {
            name: "맵",
            children: {},                    
        },
        "mode-event": {
            name: "이벤트",
            children: {}, 
        },
        "mode-region": {
            name: "지역",
            children: {}, 
        },
    },
};

export {ModeMenu};