export declare const ToolMenuNameMap: readonly ["tools-database", "tools-resource-manager", "tools-script-eidtor", "tools-sound-test", "tools-options"];
export declare type ToolMenuImpl = {
    name: string;
    children: {
        [key in typeof ToolMenuNameMap[number]]: {
            name: string;
            children: Partial<Record<string, any>>;
            action: (ev: any) => void;
        };
    };
};
export declare const ToolMenu: Partial<ToolMenuImpl>;
