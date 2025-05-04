import App from "../app";
import { EmptySegment } from "./EmptySegment";
import { ToolbarBase } from "./interface/toolbar.dto";

const DrawToolbar: ToolbarBase[] = [
    {
        name: "",
        children: "draw-pencil",
        action: (ev: unknown) => {
            App.GetInstance().emit("tilemap:drawingType", 0);
        },
    },
    {
        name: "",
        children: "draw-rectangle",
        action: (ev: unknown) => {
            App.GetInstance().emit("tilemap:drawingType", 1);
        },
    },
    {
        name: "",
        children: "draw-ellipse",
        action: (ev: unknown) => {
            App.GetInstance().emit("tilemap:drawingType", 2);
        },
    },
    {
        name: "",
        children: "draw-flood-fill",
        action: (ev: unknown) => {
            App.GetInstance().emit("tilemap:drawingType", 3);
        },
    },
    {
        name: "",
        children: "draw-shadow-pen",
        action: (ev: unknown) => {},
    },
    EmptySegment,
];

export { DrawToolbar };
