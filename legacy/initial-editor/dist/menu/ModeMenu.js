import { ModeEventCommand } from "./commands/mode/ModeEventCommand";
import { ModeMapCommand } from "./commands/mode/ModeMapCommand";
import { ModeRegionCommand } from "./commands/mode/ModeRegionCommand";
export const ModeMenuNameMap = ["mode-map", "mode-event", "mode-region"];
export const ModeMenu = {
    name: "모드",
    children: {
        "mode-map": new ModeMapCommand(),
        "mode-event": new ModeEventCommand(),
        "mode-region": new ModeRegionCommand(),
    },
};
//# sourceMappingURL=ModeMenu.js.map