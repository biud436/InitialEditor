export namespace FileMenu {
    const name: string;
    const children: {
        "file-new": {
            name: string;
            children: {};
            shortcut: string[];
            action: (ev: any) => void;
        };
        "file-open": {
            name: string;
            shortcut: string[];
            children: {};
        };
        "file-close": {
            name: string;
            children: {};
        };
        "file-save": {
            name: string;
            children: {};
        };
        "file-preferences": {
            name: string;
            children: {};
        };
        "file-export": {
            name: string;
            children: {};
        };
        "file-exit": {
            name: string;
            children: {};
        };
    };
}
