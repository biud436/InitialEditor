export declare const HelpMenuNameMap: readonly ["help-contents", "help-about"];
export type HelpMenuImpl = {
    name: string;
    children: {
        [key in typeof HelpMenuNameMap[number]]: {
            name: string;
            children: Partial<Record<string, any>>;
            action: (ev: any) => void;
        };
    };
};
export declare const HelpMenu: Partial<HelpMenuImpl>;
