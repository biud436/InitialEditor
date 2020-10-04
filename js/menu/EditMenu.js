import { WindowCreator } from "../WindowCreator.js";

const EditMenu = {
    name: "편집",
    children: {
        "edit-undo": {
            name: "취소",
            children: {},
        },
        "edit-cut": {
            name: "자르기",
            children: {}, 
        },
        "edit-copy": {
            name: "복사하기",
            children: {}, 
        },
        "edit-paste": {
            name: "붙여넣기",
            children: {}, 
        },
        "edit-delete": {
            name: "삭제하기",
            children: {}, 
        },
    },
};

export {EditMenu};