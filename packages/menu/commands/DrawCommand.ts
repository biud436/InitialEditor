import { MenuCommand } from "../../decorators/MenuCommand";
import { OnMenuClick } from "../../decorators/OnMenuClick";
import { PenType } from "../../tilemap";
import { IBaseMenuCommand } from "./IBaseMenuCommand";

export namespace DrawingCommand {
    @MenuCommand("draw", "draw-pencil", "펜 툴", ["ctrl", "1"])
    export class DrawPencilCommand implements IBaseMenuCommand {
        @OnMenuClick("draw-pencil")
        action(ev: any): void {
            window.app.emit("tilemap:drawingType", PenType.PENCIL);
        }
    }

    @MenuCommand("draw", "draw-rectangle", "정사각형", ["ctrl", "2"])
    export class DrawRectangleCommand implements IBaseMenuCommand {
        @OnMenuClick("draw-rectangle")
        action(ev: any): void {
            window.app.emit("tilemap:drawingType", PenType.RECTANGLE);
        }
    }

    @MenuCommand("draw", "draw-ellipse", "원형", ["ctrl", "3"])
    export class DrawEllipseCommand implements IBaseMenuCommand {
        @OnMenuClick("draw-ellipse")
        action(ev: any): void {
            window.app.emit("tilemap:drawingType", PenType.ELLIPSE);
        }
    }

    @MenuCommand("draw", "draw-flood-fill", "채우기", ["ctrl", "4"])
    export class DrawFloodFillCommand implements IBaseMenuCommand {
        @OnMenuClick("draw-flood-fill")
        action(ev: any): void {
            window.app.emit("tilemap:drawingType", PenType.FLOOD_FILL);
        }
    }

    @MenuCommand("draw", "draw-shadow-pen", "채우기", ["ctrl", "4"])
    export class DrawShadowPen implements IBaseMenuCommand {
        @OnMenuClick("draw-shadow-pen")
        action(ev: any): void {
            window.app.emit("tilemap:drawingType", PenType.SHADOW_PEN);
        }
    }
}
