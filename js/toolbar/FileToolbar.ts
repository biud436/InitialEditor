import {EmptySegment} from "./EmptySegment";
import { WindowCreator } from "../WindowCreator";

const FileToolbar = [
    {
        name: "파일 만들기",
        children: "file-new",
        action: (ev: any) => {
            WindowCreator.GrapWindow(ev);
        },           
    },
    {
        name: "파일 열기",
        children: "file-open",
        action: (ev: any) =>  {
            WindowCreator.GrapWindow(ev);
        },           
    },
    {
        name: "파일 저장",
        children: "file-save",
        action: (ev: any) =>  {
            WindowCreator.GrapWindow(ev);
        },           
    },
    {
        name: "파일 저장",
        children: "edit-undo",
        action: (ev: any) =>  {
            WindowCreator.GrapWindow(ev);
        },           
    },
    EmptySegment,
];

export {FileToolbar};