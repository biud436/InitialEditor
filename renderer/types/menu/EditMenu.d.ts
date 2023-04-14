export declare const EditMenuNameMap: readonly ["edit-undo", "edit-cut", "edit-copy", "edit-paste", "edit-delete"];
export type EditMenuImpl = {
    name: string;
    children: {
        [key in typeof EditMenuNameMap[number]]: {
            name: string;
            children: Partial<Record<string, any>>;
            action: (ev: any) => void;
        };
    };
};
export declare const EditMenu: Partial<EditMenuImpl>;
