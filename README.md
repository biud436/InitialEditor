![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)
![Electron.js](https://img.shields.io/badge/Electron-191970?style=for-the-badge&logo=Electron&logoColor=white)
![Next JS](https://img.shields.io/badge/Next-black?style=for-the-badge&logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)
![Styled Components](https://img.shields.io/badge/styled--components-DB7093?style=for-the-badge&logo=styled-components&logoColor=white)

# Introduction

This project allows you to edit multi dimensional tile map on my own game engine. it is worked fine on any platforms such as Linux Desktop, OSX, Windows and so on.

## Tilemap

![IMG](./editor.png)

## Child Window

<img width="1392" alt="image" src="https://user-images.githubusercontent.com/13586185/189561657-2fb02462-0f7e-47ab-bc35-dab68e3a395f.png">

# Usage

## Menu Commands

This stuff is written in a TypeScript. if you want to make a new menu command into the editor, you can add a new command into the `packages/menu/commands` directory, this editor can collect a decorator called `@OnMenuClick('menu-command-key')` and can execute a mapped action to its decorator.

```ts
import { MenuCommand } from "../../decorators/MenuCommand";
import { OnMenuClick } from "../../decorators/OnMenuClick";
import { IBaseMenuCommand } from "./IBaseMenuCommand";

@MenuCommand("file", "file-new", "새로 만들기", ["ctrl", "n"])
export class NewFileCommand implements IBaseMenuCommand {
    @OnMenuClick("file-new")
    action(ev: any) {
        if (window.app) {
            window.app.emit("openWindow", {
                path: "/newWindow",
            });
        }
    }
}
```

To write a new menu command, you must import an interface named `IBaseMenuCommand` that starts with 'I' like as C# and so on. this interface has a name, children, shortcut properties, and action method. the action method is a function that can be executed when the menu command is clicked.

# Environment

| Platform Type |    Status     |
| :-----------: | :-----------: |
|   Electron    | Stable (100%) |

## How to setup

In case of platform such as `OSX`, try these steps. First up, you must install node in your system.

```sh
brew install node
node -v
cd ~/Documents
git clone https://github.com/biud436/InitialEditor.git
cd InitialEidtor
sudo yarn install
```

In case of platform such as `Windows 10`, try to download the Node.js LTS version in your system manually. and next, if you exist the program called `git` in environment variable named `PATH` of your system, you must just call the command such as `git clone https://github.com/biud436/InitialEditor.git` in desired directory. and next try to below step.

```bat
git clone https://github.com/biud436/InitialEditor.git
cd InitialEidtor
yarn install
```

## How to start on Windows 10

~~It is pretty easy. Open the Visual Studio Code and press key called `F5` on platform such as Windows 10. if you can't start the program, you must see the previous step.~~

## How to start on Mac OSX (Apple Silicon M1)

you have to run the shell script file such as `build.sh` and execute the command such as `npm run start` ~~or `fn + F5`~~

```sh
yarn dev
```

## How to upstream from remote github repository

To upstream from the remote repository, you must call below command.

```bash
git remote add upstream https://github.com/biud436/InitialEditor.git
git fetch upstream
git checkout next
git merge upstream/next
```

# License

This tool is under the MIT License.

---

But some icon and javascript and stylesheets and images included at this tool have their own licenses.

-   Font Awesome Free - https://fontawesome.com/license/free
-   FSM Tile (2k_town05.png) - http://refmap-l.blog.jp/archives/8632768.html
-   FSM Tile (2k_town05-01.png) - http://refmap-l.blog.jp/archives/8632768.html
-   Tuxemon Tileset - https://opengameart.org/content/tuxemon-tileset
