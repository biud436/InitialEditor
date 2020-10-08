import {EmptySegment} from "./EmptySegment";
import { WindowCreator } from "../WindowCreator";

const OtherToolbar = [
    {
        name: "",
        children: "take-screenshot",
        action: (ev) => {
            
        },           
    },
    {
        name: "",
        children: "tools-resource-manager",
        action: (ev) => {
            
        },           
    },
    {
        name: "",
        children: "tools-script-eidtor",
        action: (ev) => {
            
        },           
    },
    {
        name: "",
        children: "tools-sound-test",
        action: (ev) => {
            
        },           
    },
    EmptySegment,
    {
        name: "",
        children: "tools-options",
        action: (ev) => {
            
        },           
    },
    EmptySegment,
    {
        name: "",
        children: "game-playtest",
        action: (ev) => {
            
        },           
    },
    EmptySegment,
    {
        name: "",
        children: "game-folder-open",
        action: (ev) => {
            
        },           
    },
];

export {OtherToolbar};