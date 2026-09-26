import { IBaseMenuEventHandler } from "./IBaseMenuEventHandler";
export declare class NewFileEventHandler implements IBaseMenuEventHandler {
    name: string;
    children?: Record<string, any>;
    shortcut: string[];
    constructor();
    action(ev: any): void;
}
