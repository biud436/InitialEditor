import { ipcRenderer } from "electron";

export function setResolution(width: number, height: number) {
    ipcRenderer.send("set-resolution", width, height);
}
