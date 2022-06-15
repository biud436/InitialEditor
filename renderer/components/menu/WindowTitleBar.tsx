import { observer } from "mobx-react";
import { uiStore } from "../../store/UIStore";

export const WindowTitleBar = observer(() => {
    return <div className="drag-zon" window-name={uiStore.titleName}></div>;
});
