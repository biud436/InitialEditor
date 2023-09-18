import { IBaseMenuEventHandler } from "./IBaseMenuEventHandler";
export declare class OpenFileEventHandler implements IBaseMenuEventHandler {
    name: string;
    children: {};
    shortcut: string[];
    action(ev: any): void;
}
