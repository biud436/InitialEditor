import "reflect-metadata";
export declare const FileMenuNameMap: readonly ["file-new", "file-open", "file-close", "file-save", "file-preferences", "file-exit"];
export type FileMenuImpl = {
    name: string;
    children: {
        [key in (typeof FileMenuNameMap)[number]]: {
            name?: string;
            children?: Partial<Record<string, unknown>>;
            shortcut?: string[];
            action?: (ev: unknown) => void | Function;
        };
    };
};
export declare const FileMenu: Partial<FileMenuImpl>;
