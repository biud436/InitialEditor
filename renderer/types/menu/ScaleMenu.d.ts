export declare const ScaleMenuNameMap: readonly ["scale-1x", "scale-2x", "scale-4x", "scale-8x"];
export type ScaleMenuImpl = {
    name: string;
    children: {
        [key in typeof ScaleMenuNameMap[number]]: {
            name: string;
            children: Partial<Record<string, any>>;
            action: (ev: any) => void;
        };
    };
};
export declare const ScaleMenu: Partial<ScaleMenuImpl>;
