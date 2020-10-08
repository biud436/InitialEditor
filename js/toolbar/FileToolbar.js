import {EmptySegment} from "./EmptySegment";
import { WindowCreator } from "../WindowCreator";

const FileToolbar = [
    {
        name: "파일 만들기",
        children: "file-new",
        action: (ev) => {
            WindowCreator.GrapWindow(ev);
        },           
    },
    {
        name: "파일 열기",
        children: "file-open",
        action: (ev) => {
            WindowCreator.GrapWindow(ev);
        },           
    },
    {
        name: "파일 저장",
        children: "file-save",
        action: (ev) => {
            WindowCreator.GrapWindow(ev);
        },           
    },
    {
        name: "파일 저장",
        children: "edit-undo",
        action: (ev) => {
            WindowCreator.GrapWindow(ev);
        },           
    },
    EmptySegment,
];

export {FileToolbar};