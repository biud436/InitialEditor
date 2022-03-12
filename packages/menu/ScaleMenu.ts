import { WindowCreator } from "../WindowCreator";

const ScaleMenu = {
    name: "배율",
    children: {
        "scale-1x": {
            name: "실제 비율",
            children: {},
            action: (ev: any) =>  {
                
            },                            
        },
        "scale-2x": {
            name: "2배 축소",
            children: {}, 
            action: (ev: any) =>  {
                
            },                            
        },
        "scale-4x": {
            name: "4배 축소",
            children: {}, 
            action: (ev: any) =>  {
                
            },                            
        },
        "scale-8x": {
            name: "8배 축소",
            children: {}, 
            action: (ev: any) =>  {
                
            },                            
        },
    },
};

export {ScaleMenu};