<div align="center">

![LOGO](https://repository-images.githubusercontent.com/294916739/2f3b679c-ef74-43a7-9d9d-9c08982e3db1)

</div>

![typescript](https://img.shields.io/badge/typescript-4.6.2-green.svg?logo=typescript&style=for-the-badge)
![electron](https://img.shields.io/badge/electron-16.0.7-green.svg?logo=electron&style=for-the-badge)
![react](https://img.shields.io/badge/react-17.0.2-green.svg?logo=react&style=for-the-badge)
![next](https://img.shields.io/badge/next-11.1.3-green.svg?logo=next.js&style=for-the-badge)
![styled-components](https://img.shields.io/badge/styled--components-5.3.3-green.svg?logo=styled-components&style=for-the-badge)

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

## InitialDOM

To create a new element, you can use the `InitialDOM` class. this class is a wrapper class of the `document` object. this class has a static method called `query` and `fetch`. the `query` method is a wrapper method of the `document.querySelector` method. the `fetch` method is a wrapper method of the `document.createElement` method. the `css` method creates a new style sheet to the `head` element and returns class name.

```ts
const parent = InitialDOM.query("#view");
let child = null;
if ((child = InitialDOM.query("#tileset-marker"))) {
    parent?.removeChild(child);
    return;
}

this._element = InitialDOM.fetch("div");
this._element.id = "tileset-marker";
this._element.className = InitialDOM.css`
        min-width: ${this._tileWidth}px;
        min-height: ${this._tileHeight}px;
        width: ${this._tileWidth}px;
        height: ${this._tileHeight}px;
        position: absolute;
        top: 0;
        left: 0;
        margin: 0;
        padding: 0;
        border: 2px dotted yellow;
        z-index: 50;
        box-sizing: border-box;
    `;
```

Why the wrapper class is needed? In this way, it will be possible to change this class to another framework such as React, Vue, Angular and so on easily. so I wrote it like this way.

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
