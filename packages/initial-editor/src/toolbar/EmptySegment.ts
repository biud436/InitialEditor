import { ToolbarBase } from "./interface/toolbar.dto";

/**
 * 비어있는 메뉴
 */
const EmptySegment: ToolbarBase = {
    name: "toolbar__empty-line--modifier",
    children: "empty-line",
    action: (ev: unknown) => {},
};

export { EmptySegment };
