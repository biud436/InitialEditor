import { EmptySegment } from "./EmptySegment";
import { WindowCreator } from "../WindowCreator";
import { shell } from "electron";
import * as fs from "fs";
import * as path from "path";

const OtherToolbar = [
    {
        name: "",
        children: "take-screenshot",
        action: (ev: any) => {
            $("#take-screenshot").trigger("click");
        },
    },
    {
        name: "",
        children: "tools-resource-manager",
        action: (ev: any) => {},
    },
    {
        name: "",
        children: "tools-script-eidtor",
        action: (ev: any) => {},
    },
    {
        name: "",
        children: "tools-sound-test",
        action: (ev: any) => {},
    },
    EmptySegment,
    {
        name: "",
        children: "tools-options",
        action: (ev: any) => {},
    },
    EmptySegment,
    {
        name: "",
        children: "game-playtest",
        action: (ev: any) => {},
    },
    EmptySegment,
    {
        name: "",
        children: "game-folder-open",
        action: (ev: any) => {
            const current = path.join(process.cwd().replace(/\\/g, "/"));
            window.alert(current);
            shell.showItemInFolder(current);
        },
    },
];

export { OtherToolbar };
