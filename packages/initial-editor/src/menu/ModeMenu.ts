import { ModeEventCommand } from "./commands/mode/ModeEventCommand";
import { ModeMapCommand } from "./commands/mode/ModeMapCommand";
import { ModeRegionCommand } from "./commands/mode/ModeRegionCommand";

export const ModeMenuNameMap = <const>["mode-map", "mode-event", "mode-region"];

export type ModeMenuImpl = {
    name: string;
    children: {
        [key in (typeof ModeMenuNameMap)[number]]: {
            name: string;
            children: Partial<Record<string, any>>;
            action?: (ev: any) => void;
        };
    };
};

export const ModeMenu = <Partial<ModeMenuImpl>>{
    name: "모드",
    children: {
        "mode-map": new ModeMapCommand(),
        "mode-event": new ModeEventCommand(),
        "mode-region": new ModeRegionCommand(),
    },
};
