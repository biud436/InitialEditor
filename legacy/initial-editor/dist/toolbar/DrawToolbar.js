import App from "../app";
import { EmptySegment } from "./EmptySegment";
const DrawToolbar = [
    {
        name: "",
        children: "draw-pencil",
        action: (ev) => {
            App.GetInstance().emit("tilemap:drawingType", 0);
        },
    },
    {
        name: "",
        children: "draw-rectangle",
        action: (ev) => {
            App.GetInstance().emit("tilemap:drawingType", 1);
        },
    },
    {
        name: "",
        children: "draw-ellipse",
        action: (ev) => {
            App.GetInstance().emit("tilemap:drawingType", 2);
        },
    },
    {
        name: "",
        children: "draw-flood-fill",
        action: (ev) => {
            App.GetInstance().emit("tilemap:drawingType", 3);
        },
    },
    {
        name: "",
        children: "draw-shadow-pen",
        action: (ev) => { },
    },
    EmptySegment,
];
export { DrawToolbar };
//# sourceMappingURL=DrawToolbar.js.map