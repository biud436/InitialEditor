export interface ToolbarBase {
    name: string;
    children: string;
    action: (ev: any) => void;
}
