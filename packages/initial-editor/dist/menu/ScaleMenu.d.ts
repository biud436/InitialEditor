export declare const ScaleMenuNameMap: readonly ["scale-1x", "scale-2x", "scale-4x", "scale-8x"];
export type ScaleMenuImpl = {
    name: string;
    children: {
        [key in (typeof ScaleMenuNameMap)[number]]: {
            name: string;
            children: Partial<Record<string, unknown>>;
            action: (ev: unknown) => void;
        };
    };
};
export declare const ScaleMenu: Partial<ScaleMenuImpl>;
