export declare const ModeMenuNameMap: readonly ["mode-map", "mode-event", "mode-region"];
export type ModeMenuImpl = {
    name: string;
    children: {
        [key in (typeof ModeMenuNameMap)[number]]: {
            name: string;
            children: Partial<Record<string, unknown>>;
            action?: (ev: unknown) => void;
        };
    };
};
export declare const ModeMenu: Partial<ModeMenuImpl>;
