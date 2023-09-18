import { EventEmitter } from "./EventEmitter";
export declare class ConfigService extends EventEmitter {
    private config;
    constructor();
    addTilesetImages(images: string[]): void;
}
