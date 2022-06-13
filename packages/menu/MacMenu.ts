import * as electron from "electron/main";
import { FileMenu } from "./FileMenu";

/**
 * @link https://www.electronjs.org/docs/latest/api/menu-item
 */
export namespace MacMenu {
    export function createSystemMenu() {
        const menu = new electron.Menu();

        const fileMenu = new electron.MenuItem({
            enabled: true,

            label: "File1",
            toolTip: "File1",
            submenu: (() => {
                const sub = new electron.Menu();
                sub.append(
                    new electron.MenuItem({
                        label: "New",
                        accelerator: "CmdOrCtrl+N",
                        click: () => {
                            console.log("New");
                        }
                    })
                );
                return sub;
            })()
        });

        menu.items.push(fileMenu);

        electron.Menu.setApplicationMenu(menu);
    }
}
