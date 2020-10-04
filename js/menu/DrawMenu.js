import { WindowCreator } from "../WindowCreator.js";

const DrawMenu = {
    name: "그리기",
    children: {
        "draw-pencil": {
            name: "펜",
            children: {},
            action: (ev) => {
                
            },                            
        },
        "draw-rectangle": {
            name: "정사각형",
            children: {}, 
            action: (ev) => {
                
            },                            
        },
        "draw-ellipse": {
            name: "직사각형",
            children: {}, 
            action: (ev) => {
                
            },                            
        },
        "draw-flood-fill": {
            name: "채우기",
            children: {}, 
            action: (ev) => {
                
            },                            
        },
        "draw-shadow pen": {
            name: "그림자",
            children: {}, 
            action: (ev) => {
                
            },                            
        },
    },
}

export {DrawMenu};