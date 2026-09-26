export declare const ToolMenuNameMap: readonly ["tools-database", "tools-resource-manager", "tools-script-editor", "tools-sound-test", "tools-options"];
export type ToolMenuImpl = {
    name: string;
    children: {
        [key in (typeof ToolMenuNameMap)[number]]: {
            name: string;
            children: Partial<Record<string, unknown>>;
            action: (ev: unknown) => void;
        };
    };
};
export declare const ToolMenu: Partial<ToolMenuImpl>;
