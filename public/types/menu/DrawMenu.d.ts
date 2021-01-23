export namespace DrawMenu {
    const name: string;
    const children: {
        "draw-pencil": {
            name: string;
            children: {};
            action: (ev: any) => void;
        };
        "draw-rectangle": {
            name: string;
            children: {};
            action: (ev: any) => void;
        };
        "draw-ellipse": {
            name: string;
            children: {};
            action: (ev: any) => void;
        };
        "draw-flood-fill": {
            name: string;
            children: {};
            action: (ev: any) => void;
        };
        "draw-shadow pen": {
            name: string;
            children: {};
            action: (ev: any) => void;
        };
    };
}
