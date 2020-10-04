import { WindowCreator } from "../WindowCreator.js";

const ToolMenu = {
    name: "도구",
    children: {
        "tools-database": {
            name: "데이터베이스",
            children: {},
            action: (ev) => {
                
            },                            
        },
        "tools-resource-manager": {
            name: "소재 관리자",
            children: {}, 
            action: (ev) => {
                
            },                            
        },
        "tools-script-eidtor": {
            name: "스크립트 에디터",
            children: {}, 
            action: (ev) => {
                
            },                      
        },
        "tools-sound-test": {
            name: "사운드 테스트",
            children: {}, 
        },
        "tools-options": {
            name: "옵션",
            children: {}, 
            action: function(ev) {
                WindowCreator.GrapWindow(ev);
            }
        },
    },
};

export {ToolMenu};