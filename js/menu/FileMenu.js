import { WindowCreator } from "../WindowCreator.js";

const FileMenu = {
    name: "파일",
    children: {
        "file-new": {
            name: "새로 만들기",
            children: {},
            action: function(ev) {
                WindowCreator.GrapWindow(ev);
            }                    
        },
        "file-open": {
            name: "파일 열기",
            children: {}, 
        },
        "file-close": {
            name: "파일 닫기",
            children: {}, 
        },
        "file-save": {
            name: "파일 저장",
            children: {}, 
        },
        "file-preferences": {
            name: "환경 설정",
            children: {}, 
        },
        "file-export": {
            name: "내보내기",
            children: {}, 
        },
        "file-exit": {
            name: "프로그램 종료",
            children: {}, 
        },
    },
};

export {FileMenu};