declare const KoreanMenu: {
    file: Partial<import("./FileMenu").FileMenuImpl>;
    edit: Partial<import("./EditMenu").EditMenuImpl>;
    mode: Partial<import("./ModeMenu").ModeMenuImpl>;
    draw: Partial<import("./DrawMenu").DrawMenuImpl>;
    scale: Partial<import("./ScaleMenu").ScaleMenuImpl>;
    tools: Partial<import("./ToolMenu").ToolMenuImpl>;
    game: Partial<import("./GameMenu").GameMenuImpl>;
    help: Partial<import("./HelpMenu").HelpMenuImpl>;
    $font: {
        size: string;
    };
};
export { KoreanMenu };
