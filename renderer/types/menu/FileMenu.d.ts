export declare const FileMenuNameMap: readonly ["file-new", "file-open", "file-close", "file-save", "file-preferences", "file-exit"];
export declare type FileMenuImpl = {
    name: string;
    children: {
        [key in typeof FileMenuNameMap[number]]: {
            name: string;
            children: Partial<Record<string, any>>;
            shortcut?: string[];
            action?: (ev: any) => void | Function;
        };
    };
};
export declare const FileMenu: Partial<FileMenuImpl>;
