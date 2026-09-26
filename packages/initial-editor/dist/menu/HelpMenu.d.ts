export declare const HelpMenuNameMap: readonly ["help-contents", "help-about"];
export type HelpMenuName = (typeof HelpMenuNameMap)[number];
export type HelpMenuChildren = Partial<Record<string, unknown>>;
export type HelpMenuImpl = {
    name: string;
    children: {
        [key in HelpMenuName]: {
            name: string;
            children: HelpMenuChildren;
            action: (ev: unknown) => void;
        };
    };
};
export declare const HelpMenu: Partial<HelpMenuImpl>;
