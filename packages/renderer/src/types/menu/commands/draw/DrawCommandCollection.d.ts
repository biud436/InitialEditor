import { IBaseMenuCommand } from "../IBaseMenuCommand";
export declare namespace DrawingCommandCollection {
    class DrawPencilCommand implements IBaseMenuCommand {
        action(ev: any): void;
    }
    class DrawRectangleCommand implements IBaseMenuCommand {
        action(ev: any): void;
    }
    class DrawEllipseCommand implements IBaseMenuCommand {
        action(ev: any): void;
    }
    class DrawFloodFillCommand implements IBaseMenuCommand {
        action(ev: any): void;
    }
    class DrawShadowPen implements IBaseMenuCommand {
        action(ev: any): void;
    }
}
