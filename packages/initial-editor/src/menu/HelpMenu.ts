import { HelpAboutCommand } from "./commands/HelpAboutCommand";
import { HelpContentsCommand } from "./commands/HelpContentsCommand";

export const HelpMenuNameMap = <const>["help-contents", "help-about"];

export type HelpMenuName = (typeof HelpMenuNameMap)[number];
export type HelpMenuChildren = Partial<Record<string, unknown>>;

export type HelpMenuImpl = {
    name: string;
    children: {
        [key in HelpMenuName]: {
            name: string;
            children: HelpMenuChildren;
            action: (ev: unknown) => void;
        };
    };
};

export const HelpMenu = <Partial<HelpMenuImpl>>{
    name: "도움말",
    children: {
        "help-contents": new HelpContentsCommand(),
        "help-about": new HelpAboutCommand(),
    },
};
