import { makeAutoObservable } from "mobx";

export type TileMarkerState = "pending" | "ready" | "error";

export class TileMarkerStore {
    state: TileMarkerState = "pending";

    constructor() {
        makeAutoObservable(this);
    }

    createElement() {
        this.state = "ready";
    }

    removeElement() {
        this.state = "pending";
    }
}

export const tileMarker = new TileMarkerStore();
