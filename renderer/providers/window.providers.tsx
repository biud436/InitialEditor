import { createContext, useContext } from "react";
import { SetterOrUpdater, useRecoilState } from "recoil";
import NewWindow from "../components/window/NewWindow";
import OptionWindow from "../components/window/OptionWindow";
import { WindowState, WindowStateImpl, WindowType } from "../recoil/window";

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

    const getCurrentWindow = (currentWindow: WindowType) => {
        switch (currentWindow) {
            case "none":
                return <></>;
            case "newWindow":
                return (
                    <NewWindow>
                        <span></span>
                    </NewWindow>
                );
            case "optionWindow":
                return <OptionWindow></OptionWindow>;
        }
    };

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
