export interface IBaseMenuCommand {
    name: string;
    children?: Record<string, any>;
    shortcut: string[];

    action(ev: any): void;
}
