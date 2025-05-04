var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import App from "../../../app";
import { MenuCommand } from "../../../decorators/MenuCommand";
import { OnMenuClick } from "../../../decorators/OnMenuClick";
import { PenType } from "../../../tilemap";
export var DrawingCommandCollection;
(function (DrawingCommandCollection) {
    let DrawPencilCommand = class DrawPencilCommand {
        action(ev) {
            App.GetInstance().emit("tilemap:drawingType", PenType.PENCIL);
        }
    };
    __decorate([
        OnMenuClick("draw-pencil"),
        __metadata("design:type", Function),
        __metadata("design:paramtypes", [Object]),
        __metadata("design:returntype", void 0)
    ], DrawPencilCommand.prototype, "action", null);
    DrawPencilCommand = __decorate([
        MenuCommand("draw", "draw-pencil", "펜 툴", ["ctrl", "1"])
    ], DrawPencilCommand);
    DrawingCommandCollection.DrawPencilCommand = DrawPencilCommand;
    let DrawRectangleCommand = class DrawRectangleCommand {
        action(ev) {
            App.GetInstance().emit("tilemap:drawingType", PenType.RECTANGLE);
        }
    };
    __decorate([
        OnMenuClick("draw-rectangle"),
        __metadata("design:type", Function),
        __metadata("design:paramtypes", [Object]),
        __metadata("design:returntype", void 0)
    ], DrawRectangleCommand.prototype, "action", null);
    DrawRectangleCommand = __decorate([
        MenuCommand("draw", "draw-rectangle", "정사각형", ["ctrl", "2"])
    ], DrawRectangleCommand);
    DrawingCommandCollection.DrawRectangleCommand = DrawRectangleCommand;
    let DrawEllipseCommand = class DrawEllipseCommand {
        action(ev) {
            App.GetInstance().emit("tilemap:drawingType", PenType.ELLIPSE);
        }
    };
    __decorate([
        OnMenuClick("draw-ellipse"),
        __metadata("design:type", Function),
        __metadata("design:paramtypes", [Object]),
        __metadata("design:returntype", void 0)
    ], DrawEllipseCommand.prototype, "action", null);
    DrawEllipseCommand = __decorate([
        MenuCommand("draw", "draw-ellipse", "원형", ["ctrl", "3"])
    ], DrawEllipseCommand);
    DrawingCommandCollection.DrawEllipseCommand = DrawEllipseCommand;
    let DrawFloodFillCommand = class DrawFloodFillCommand {
        action(ev) {
            App.GetInstance().emit("tilemap:drawingType", PenType.FLOOD_FILL);
        }
    };
    __decorate([
        OnMenuClick("draw-flood-fill"),
        __metadata("design:type", Function),
        __metadata("design:paramtypes", [Object]),
        __metadata("design:returntype", void 0)
    ], DrawFloodFillCommand.prototype, "action", null);
    DrawFloodFillCommand = __decorate([
        MenuCommand("draw", "draw-flood-fill", "채우기", ["ctrl", "4"])
    ], DrawFloodFillCommand);
    DrawingCommandCollection.DrawFloodFillCommand = DrawFloodFillCommand;
    let DrawShadowPen = class DrawShadowPen {
        action(ev) {
            App.GetInstance().emit("tilemap:drawingType", PenType.SHADOW_PEN);
        }
    };
    __decorate([
        OnMenuClick("draw-shadow-pen"),
        __metadata("design:type", Function),
        __metadata("design:paramtypes", [Object]),
        __metadata("design:returntype", void 0)
    ], DrawShadowPen.prototype, "action", null);
    DrawShadowPen = __decorate([
        MenuCommand("draw", "draw-shadow-pen", "채우기", ["ctrl", "5"])
    ], DrawShadowPen);
    DrawingCommandCollection.DrawShadowPen = DrawShadowPen;
})(DrawingCommandCollection || (DrawingCommandCollection = {}));
//# sourceMappingURL=DrawCommandCollection.js.map