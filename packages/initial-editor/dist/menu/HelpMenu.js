import { HelpAboutCommand } from "./commands/HelpAboutCommand";
import { HelpContentsCommand } from "./commands/HelpContentsCommand";
export const HelpMenuNameMap = ["help-contents", "help-about"];
export const HelpMenu = {
    name: "도움말",
    children: {
        "help-contents": new HelpContentsCommand(),
        "help-about": new HelpAboutCommand(),
    },
};
//# sourceMappingURL=HelpMenu.js.map