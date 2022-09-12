import { IBaseMenuCommand as IBaseMenuCommand } from "./IBaseMenuCommand";
export declare class NewFileCommand implements IBaseMenuCommand {
    name: string;
    children?: Record<string, any>;
    shortcut: string[];
    action(ev: any): void;
}
