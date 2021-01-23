export namespace HelpMenu {
    const name: string;
    const children: {
        "help-contents": {
            name: string;
            children: {};
            action: (ev: any) => void;
        };
        "help-about": {
            name: string;
            children: {};
            action: (ev: any) => void;
        };
    };
}
