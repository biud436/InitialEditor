import {EmptySegment} from "./EmptySegment";
import { WindowCreator } from "../WindowCreator";

const OtherToolbar = [
    {
        name: "",
        children: "take-screenshot",
        action: (ev: any) =>  {
            $("#take-screenshot").trigger("click");
        },           
    },
    {
        name: "",
        children: "tools-resource-manager",
        action: (ev: any) =>  {
            
        },           
    },
    {
        name: "",
        children: "tools-script-eidtor",
        action: (ev: any) =>  {
            
        },           
    },
    {
        name: "",
        children: "tools-sound-test",
        action: (ev: any) =>  {
            
        },           
    },
    EmptySegment,
    {
        name: "",
        children: "tools-options",
        action: (ev: any) =>  {
            
        },           
    },
    EmptySegment,
    {
        name: "",
        children: "game-playtest",
        action: (ev: any) =>  {
            
        },           
    },
    EmptySegment,
    {
        name: "",
        children: "game-folder-open",
        action: (ev: any) =>  {
            
        },           
    },
];

export {OtherToolbar};