import App from "../App";
import {EmptySegment} from "./EmptySegment";
import * as $globals from '../globals';
import {ElectronService} from "../ElectronService";

const DrawToolbar = [
    {
        name: "",
        children: "draw-pencil",
        action: (ev: any) => {
            console.log(0);
            window.electronService.ipcMain.emit("tilemap", ["drawingType", 0]);
        },           
    },
    {
        name: "",
        children: "draw-rectangle",
        action: (ev: any) => {
            console.log(1);
            window.electronService.ipcMain.emit("tilemap", ["drawingType", 1]);
        },           
    },
    {
        name: "",
        children: "draw-ellipse",
        action: (ev: any) => {
            
        },           
    },
    {
        name: "",
        children: "draw-flood-fill",
        action: (ev: any) => {
            
        },           
    },
    {
        name: "",
        children: "draw-shadow-pen",
        action: (ev: any) => {
            
        },           
    },
    EmptySegment,
];

export {DrawToolbar};