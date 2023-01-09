import { LuaEditor } from "@components/window/LuaEditor";
import { createContext, useCallback, useContext } from "react";
import { SetterOrUpdater, useRecoilState } from "recoil";
import NewWindow from "../components/window/NewWindow";
import OptionWindow from "../components/window/OptionWindow";
import { WindowState, WindowType } from "../recoil/window";

export const WindowContext = createContext<{
    close: () => void;
}>(null!);

export const WidgetProvider = () => {
    const [panel, setPanel] = useRecoilState(WindowState);

    const close = () => {
        setPanel({
            currentWindow: "none",
        });
    };

    const getCurrentWindow = useCallback((currentWindow: WindowType) => {
        switch (currentWindow) {
            case "none":
                return <></>;
            case "newWindow":
                return <NewWindow />;
            case "optionWindow":
                return <OptionWindow />;
            case "scriptEditor":
                return <LuaEditor />;
        }
    }, []);

    return (
        <WindowContext.Provider value={{ close }}>
            {getCurrentWindow(panel.currentWindow)}
        </WindowContext.Provider>
    );
};

/**
 * 창을 닫을 수 있습니다.
 */
export const useClose = () => {
    return useContext(WindowContext);
};
