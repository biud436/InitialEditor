/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ "./node_modules/electron/index.js":
/*!****************************************!*\
  !*** ./node_modules/electron/index.js ***!
  \****************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const fs = __webpack_require__(/*! fs */ "fs");
const path = __webpack_require__(/*! path */ "path");

const pathFile = path.join(__dirname, 'path.txt');

function getElectronPath () {
  let executablePath;
  if (fs.existsSync(pathFile)) {
    executablePath = fs.readFileSync(pathFile, 'utf-8');
  }
  if (process.env.ELECTRON_OVERRIDE_DIST_PATH) {
    return path.join(process.env.ELECTRON_OVERRIDE_DIST_PATH, executablePath || 'electron');
  }
  if (executablePath) {
    return path.join(__dirname, 'dist', executablePath);
  } else {
    throw new Error('Electron failed to install correctly, please delete node_modules/electron and try installing again');
  }
}

module.exports = getElectronPath();


/***/ }),

/***/ "./main/config/index.ts":
/*!******************************!*\
  !*** ./main/config/index.ts ***!
  \******************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "config": () => (/* binding */ config)
/* harmony export */ });
/**
 * @description This object creates a configuration object for the application.
 */
const config = {
    mainWindow: {
        get() {
            // 브라우저 창을 생성합니다.
            const isMacOS = process.platform === "darwin";
            const windowRect = {
                width: 1280,
                height: 720,
            };
            const options = {
                ...windowRect,
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false,
                    devTools: true,
                    // allowRunningInsecureContent: true,
                },
                show: false,
                frame: isMacOS ? true : false,
                titleBarStyle: isMacOS ? "default" : "hidden",
                darkTheme: true,
                alwaysOnTop: false,
            };
            return options;
        },
    },
    splashWindow: {
        get() {
            return {
                width: 1280,
                height: 640,
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false,
                    devTools: true,
                },
                frame: false,
                alwaysOnTop: true,
                center: true,
                modal: true,
            };
        },
    },
};


/***/ }),

/***/ "./main/utils/Path.ts":
/*!****************************!*\
  !*** ./main/utils/Path.ts ***!
  \****************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "EntryPoint": () => (/* binding */ EntryPoint)
/* harmony export */ });
/* harmony import */ var path__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! path */ "path");
/* harmony import */ var path__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(path__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var url__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! url */ "url");
/* harmony import */ var url__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(url__WEBPACK_IMPORTED_MODULE_1__);


var EntryPoint;
(function (EntryPoint) {
    class Path {
        static join(...paths) {
            return url__WEBPACK_IMPORTED_MODULE_1__.pathToFileURL(path__WEBPACK_IMPORTED_MODULE_0__.join(...paths)).href;
        }
        static resolve(...paths) {
            return url__WEBPACK_IMPORTED_MODULE_1__.pathToFileURL(path__WEBPACK_IMPORTED_MODULE_0__.resolve(...paths)).href;
        }
        static get separator() {
            return path__WEBPACK_IMPORTED_MODULE_0__.sep;
        }
        static getWorkDir() {
            return Path.WORK_DIR.replace(/\\/g, "/");
        }
    }
    Path.WORK_DIR = process.cwd();
    EntryPoint.Path = Path;
})(EntryPoint || (EntryPoint = {}));


/***/ }),

/***/ "./main/windows/mainWindow.ts":
/*!************************************!*\
  !*** ./main/windows/mainWindow.ts ***!
  \************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "MainWindow": () => (/* binding */ MainWindow)
/* harmony export */ });
/* harmony import */ var electron__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! electron */ "./node_modules/electron/index.js");
/* harmony import */ var electron__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(electron__WEBPACK_IMPORTED_MODULE_0__);

const isDev =  false ? 0 : false;
/**
 * @description
 * This class allows you to create a new window that is applied some configuration.
 */
class MainWindow extends electron__WEBPACK_IMPORTED_MODULE_0__.BrowserWindow {
    constructor(options) {
        super(options);
        this.isProd = "development" === "production";
        this.setConfiguration()
            .then(() => { })
            .catch((err) => {
            console.log(err);
        });
    }
    async setConfiguration() {
        this.setMenuBarVisibility(false);
        this.$ = this.jQuery = __webpack_require__(/*! jquery */ "jquery");
        if (this.isProd) {
            await this.loadURL("app://./home.html");
        }
        else {
            const port = process.argv[2];
            // await this.loadURL(`http://localhost:${port}/home`);
            await this.loadURL(`http://localhost:8080/home`);
            this.webContents.openDevTools();
        }
        this.webContents.once("dom-ready", () => {
            this.webContents.send("change-theme");
        });
    }
    onMaximize() {
        let restoreSize = [];
        if (!this.isMaximized()) {
            restoreSize = this.getMaximumSize();
            this.maximize();
        }
        else {
            this.unmaximize();
        }
    }
}


/***/ }),

/***/ "./main/windows/splashWindow.ts":
/*!**************************************!*\
  !*** ./main/windows/splashWindow.ts ***!
  \**************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "showSplashWindow": () => (/* binding */ showSplashWindow)
/* harmony export */ });
/* harmony import */ var electron__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! electron */ "./node_modules/electron/index.js");
/* harmony import */ var electron__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(electron__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _config__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../config */ "./main/config/index.ts");


/**
 * Show up the splash window on the screen.
 *
 * @param mainWindow
 * @returns
 */
async function showSplashWindow(mainWindow) {
    const isProd = "development" === "production";
    const options = _config__WEBPACK_IMPORTED_MODULE_1__.config.splashWindow.get();
    const splash = new electron__WEBPACK_IMPORTED_MODULE_0__.BrowserWindow(options);
    let url = "";
    if (isProd) {
        url = "app://./splash.html";
    }
    else {
        const port = process.argv[2];
        url = `http://localhost:${port}/splash`;
    }
    splash.loadURL(url);
    splash.center();
    splash.on("close", () => mainWindow.show());
    splash.close();
    return splash;
}


/***/ }),

/***/ "electron-serve":
/*!*********************************!*\
  !*** external "electron-serve" ***!
  \*********************************/
/***/ ((module) => {

"use strict";
module.exports = require("electron-serve");

/***/ }),

/***/ "jquery":
/*!*************************!*\
  !*** external "jquery" ***!
  \*************************/
/***/ ((module) => {

"use strict";
module.exports = require("jquery");

/***/ }),

/***/ "fs":
/*!*********************!*\
  !*** external "fs" ***!
  \*********************/
/***/ ((module) => {

"use strict";
module.exports = require("fs");

/***/ }),

/***/ "path":
/*!***********************!*\
  !*** external "path" ***!
  \***********************/
/***/ ((module) => {

"use strict";
module.exports = require("path");

/***/ }),

/***/ "url":
/*!**********************!*\
  !*** external "url" ***!
  \**********************/
/***/ ((module) => {

"use strict";
module.exports = require("url");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat get default export */
/******/ 	(() => {
/******/ 		// getDefaultExport function for compatibility with non-harmony modules
/******/ 		__webpack_require__.n = (module) => {
/******/ 			var getter = module && module.__esModule ?
/******/ 				() => (module['default']) :
/******/ 				() => (module);
/******/ 			__webpack_require__.d(getter, { a: getter });
/******/ 			return getter;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be in strict mode.
(() => {
"use strict";
/*!****************************!*\
  !*** ./main/background.ts ***!
  \****************************/
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "EntryPoint": () => (/* binding */ EntryPoint)
/* harmony export */ });
/* harmony import */ var fs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! fs */ "fs");
/* harmony import */ var fs__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(fs__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var electron__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! electron */ "./node_modules/electron/index.js");
/* harmony import */ var electron__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(electron__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var _windows_mainWindow__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./windows/mainWindow */ "./main/windows/mainWindow.ts");
/* harmony import */ var _config__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./config */ "./main/config/index.ts");
/* harmony import */ var _windows_splashWindow__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./windows/splashWindow */ "./main/windows/splashWindow.ts");
/* harmony import */ var _utils_Path__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./utils/Path */ "./main/utils/Path.ts");
/* harmony import */ var electron_serve__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! electron-serve */ "electron-serve");
/* harmony import */ var electron_serve__WEBPACK_IMPORTED_MODULE_6___default = /*#__PURE__*/__webpack_require__.n(electron_serve__WEBPACK_IMPORTED_MODULE_6__);







const Path = _utils_Path__WEBPACK_IMPORTED_MODULE_5__.EntryPoint.Path;
const isProd = "development" === "production";
if (isProd) {
    electron_serve__WEBPACK_IMPORTED_MODULE_6___default()({ directory: "app" });
}
else {
    electron__WEBPACK_IMPORTED_MODULE_1__.app.setPath("userData", `${electron__WEBPACK_IMPORTED_MODULE_1__.app.getPath("userData")} (development)`);
}
/**
 * @author biud436
 * @description
 * This class allows you to create the electron application and start.
 */
class EntryPoint {
    constructor() {
        this.isProd = "development" === "production";
        this.initWithTitle();
        this.createUserDataStorage();
    }
    /**
     * Sets the title of an application from hard-coded text.
     */
    initWithTitle() {
        electron__WEBPACK_IMPORTED_MODULE_1__.app.setName("InitialEditor");
    }
    createUserDataStorage() {
        if (this.isProd) {
            electron_serve__WEBPACK_IMPORTED_MODULE_6___default()({ directory: "app" });
        }
        else {
            electron__WEBPACK_IMPORTED_MODULE_1__.app.setPath("userData", `${electron__WEBPACK_IMPORTED_MODULE_1__.app.getPath("userData")} (development)`);
        }
    }
    /**
     * Prints the information of each monitor.
     * if you are using multiple monitors, you can use this method to print the information of each monitor.
     */
    printMonitorInfo() {
        const data = {};
        const displays = electron__WEBPACK_IMPORTED_MODULE_1__.screen.getAllDisplays();
        // 모니터의 갯수입니다.
        displays.forEach((e, i) => {
            const monitorId = e.id;
            data[monitorId] = {
                x: e.bounds.x,
                y: e.bounds.y,
                width: e.size.width,
                height: e.size.height,
            };
        });
        fs__WEBPACK_IMPORTED_MODULE_0__.writeFileSync("display.json", JSON.stringify(data, null, 4));
    }
    connectIPC(hostWindow) {
        hostWindow.on("closed", () => {
            this._hostWindow = null;
        });
        // 별도의 패턴으로 정리해야 할 필요성이 있음.
        electron__WEBPACK_IMPORTED_MODULE_1__.ipcMain.on("minimize", () => hostWindow.minimize());
        electron__WEBPACK_IMPORTED_MODULE_1__.ipcMain.on("maximize", () => hostWindow.onMaximize());
        electron__WEBPACK_IMPORTED_MODULE_1__.ipcMain.on("message_box:error", (event, ...args) => {
            const [title, content] = args;
            electron__WEBPACK_IMPORTED_MODULE_1__.dialog.showErrorBox(title, content);
        });
        electron__WEBPACK_IMPORTED_MODULE_1__.ipcMain.on("close", () => hostWindow.close());
        electron__WEBPACK_IMPORTED_MODULE_1__.ipcMain.on("set-resolution", (event, width, height) => {
            hostWindow.setSize(width, height);
        });
    }
    /**
     * Creates an internal menu on macOS.
     * However This is not completed development.
     */
    createInternalMenuForDarwin(hostWindow) {
        if (process.platform === "darwin") {
            electron__WEBPACK_IMPORTED_MODULE_1__.Menu.setApplicationMenu(electron__WEBPACK_IMPORTED_MODULE_1__.Menu.buildFromTemplate([
                {
                    role: "appMenu",
                    label: "InitialEditor",
                    submenu: [
                        {
                            role: "quit",
                        },
                    ],
                },
                {
                    label: "파일",
                    role: "fileMenu",
                    submenu: [
                        {
                            label: "새로 만들기",
                            accelerator: "CmdOrCtrl+N",
                            click: () => {
                                hostWindow.webContents.send("new-file");
                            },
                        },
                        {
                            label: "프로그램 종료",
                            accelerator: "CmdOrCtrl+Q",
                            role: "quit",
                        },
                    ],
                },
            ]));
        }
    }
    /**
     * Creates a main window of the application.
     * Host Window means the main window that contains a tile editor that can draw tiles.
     *
     * @returns
     */
    createWindow() {
        this.connectIPC((this._hostWindow = new _windows_mainWindow__WEBPACK_IMPORTED_MODULE_2__.MainWindow(_config__WEBPACK_IMPORTED_MODULE_3__.config.mainWindow.get())));
        this.printMonitorInfo();
        this.createInternalMenuForDarwin(this._hostWindow);
        return this;
    }
    /**
     * Sets event listeners.
     */
    listenOn() {
        electron__WEBPACK_IMPORTED_MODULE_1__.app.whenReady().then(() => {
            this.createWindow();
            if (process.platform === "darwin") {
                electron__WEBPACK_IMPORTED_MODULE_1__.ipcMain.emit("creatSystemMenu", this._hostWindow);
            }
            // open develooper tools
            this._hostWindow.webContents.openDevTools({
                mode: "detach",
            });
            this._hostWindow.center();
            (0,_windows_splashWindow__WEBPACK_IMPORTED_MODULE_4__.showSplashWindow)(this._hostWindow);
        });
        electron__WEBPACK_IMPORTED_MODULE_1__.app.on("window-all-closed", () => {
            switch (process.platform) {
                case "darwin":
                    process.exit(0);
                case "win32":
                    electron__WEBPACK_IMPORTED_MODULE_1__.app.quit();
                    break;
                default:
                    electron__WEBPACK_IMPORTED_MODULE_1__.app.quit();
            }
        });
        electron__WEBPACK_IMPORTED_MODULE_1__.app.on("activate", () => {
            if (electron__WEBPACK_IMPORTED_MODULE_1__.BrowserWindow.getAllWindows().length === 0) {
                this.createWindow();
            }
        });
    }
    static builder() {
        return new EntryPoint();
    }
}
EntryPoint.builder().listenOn();

})();

module.exports = __webpack_exports__;
/******/ })()
;
//# sourceMappingURL=bundle.js.map