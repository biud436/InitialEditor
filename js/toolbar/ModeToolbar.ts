import {EmptySegment} from "./EmptySegment";
import { WindowCreator } from "../WindowCreator";

const ModeToolbar = [
    {
        name: "",
        children: "mode-map",
        action: (ev: any) =>  {
            
        },           
    },
    {
        name: "",
        children: "mode-event",
        action: (ev: any) =>  {
            
        },           
    },
    {
        name: "",
        children: "mode-region",
        action: (ev: any) =>  {
            
        },           
    },
    EmptySegment,
];

export {ModeToolbar};