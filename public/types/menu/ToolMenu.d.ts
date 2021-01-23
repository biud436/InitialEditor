export namespace ToolMenu {
    const name: string;
    const children: {
        "tools-database": {
            name: string;
            children: {};
            action: (ev: any) => void;
        };
        "tools-resource-manager": {
            name: string;
            children: {};
            action: (ev: any) => void;
        };
        "tools-script-eidtor": {
            name: string;
            children: {};
            action: (ev: any) => void;
        };
        "tools-sound-test": {
            name: string;
            children: {};
        };
        "tools-options": {
            name: string;
            children: {};
            action: (ev: any) => void;
        };
    };
}
