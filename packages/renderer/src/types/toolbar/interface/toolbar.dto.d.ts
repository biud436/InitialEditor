export interface ToolbarBase {
    name: string;
    children: string;
    action: (ev: unknown) => void;
}
