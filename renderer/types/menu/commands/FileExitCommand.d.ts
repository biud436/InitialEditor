import { IBaseMenuCommand } from "./IBaseMenuCommand";
export declare class FileExitCommand implements IBaseMenuCommand {
    name: string;
    children: {};
    shortcut: string[];
    action(ev: any): void;
}
