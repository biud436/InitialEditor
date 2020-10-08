import {EmptySegment} from "./EmptySegment";
import { WindowCreator } from "../WindowCreator";

const ModeToolbar = [
    {
        name: "",
        children: "mode-map",
        action: (ev) => {
            
        },           
    },
    {
        name: "",
        children: "mode-event",
        action: (ev) => {
            
        },           
    },
    {
        name: "",
        children: "mode-region",
        action: (ev) => {
            
        },           
    },
    EmptySegment,
];

export {ModeToolbar};