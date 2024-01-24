import { HelpAboutCommand } from "./commands/HelpAboutCommand";
import { HelpContentsCommand } from "./commands/HelpContentsCommand";

export const HelpMenuNameMap = <const>["help-contents", "help-about"];

export type HelpMenuImpl = {
    name: string;
    children: {
        [key in (typeof HelpMenuNameMap)[number]]: {
            name: string;
            children: Partial<Record<string, any>>;
            action: (ev: any) => void;
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
