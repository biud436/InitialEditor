import { WindowCreator } from "../WindowCreator";

const ToolMenu = {
    name: "도구",
    children: {
        "tools-database": {
            name: "데이터베이스",
            children: {},
            action: (ev: any) =>  {
                
            },                            
        },
        "tools-resource-manager": {
            name: "소재 관리자",
            children: {}, 
            action: (ev: any) =>  {
                
            },                            
        },
        "tools-script-eidtor": {
            name: "스크립트 에디터",
            children: {}, 
            action: (ev: any) =>  {
                
            },                      
        },
        "tools-sound-test": {
            name: "사운드 테스트",
            children: {}, 
        },
        "tools-options": {
            name: "옵션",
            children: {}, 
            action: function(ev: any) {
                WindowCreator.GrapWindow(ev);
            }
        },
    },
};

export {ToolMenu};