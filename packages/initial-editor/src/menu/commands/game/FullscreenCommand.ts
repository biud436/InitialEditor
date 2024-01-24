import { MenuCommand, OnMenuClick } from "../../../decorators";
import { IBaseMenuCommand } from "../IBaseMenuCommand";

function enterFullscreen() {
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
        elem.requestFullscreen();
    }
}
function exitFullscreen() {
    if (document.exitFullscreen) {
        document.exitFullscreen();
    }
}
function toggleFullscreen() {
    if (document.fullscreenElement) {
        exitFullscreen();
    } else {
        enterFullscreen();
    }
}

@MenuCommand("game", "game-fullscreen", "전체 화면", ["f11"])
export class FullscreenCommand implements IBaseMenuCommand {
    @OnMenuClick("game-fullscreen")
    action(ev: any) {
        toggleFullscreen();
    }
}
