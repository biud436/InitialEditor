import { IBaseMenuCommand as IBaseMenuCommand } from "./IBaseMenuCommand";
export declare class OpenFileCommand implements IBaseMenuCommand {
    name: string;
    children: {};
    shortcut: string[];
    action(ev: any): void;
}
