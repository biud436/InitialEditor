import { EventEmitter } from "./EventEmitter";
export declare class ConfigService extends EventEmitter {
    private config;
    private readonly fileProvider;
    constructor();
    addTilesetImages(images: string[]): void;
}
