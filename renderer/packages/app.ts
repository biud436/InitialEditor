import { EventEmitter } from "./EventEmitter";
import { Component } from "./component";
import { MenuComponent } from "./MenuComponent";
import { TilesetMarker } from "./tilesetMarker";
import Tilemap, { initial2D } from "./tilemap";
import { toCamelCase } from "./camelCase";
import TilesetCanvas from "./TilesetCanvas";
import TileMarker from "./tileMarker";
import { config, MyEditorConfig } from "./config";
import MenuService, { InitialEditor } from "./MenuService";
import Rectangle from "./Rectangle";
import { WindowCreator } from "./WindowCreator";

import { EditorSchema } from "./schema/EditorSchema";
import { ThemeManager } from "./ThemeManager";
import { Inject, Service } from "typedi";
import { Mouse } from "./Mouse";

interface BlockRect {
  isDrawing: boolean;
  rect: Rectangle;
}

namespace WindowGroup {
  export enum Theme {
    Light = 1,
    Dark = 2,
  }
}

type InitialEventListener = Partial<{
  touchmove: (ev: any) => void;
  mousemove: (ev: any) => void;
  mousedown: (ev: any) => void;
  mouseup: (ev: any) => void;
  mouseover: (ev: any) => void;
  "touchstart pointerdown"?: (ev: any) => void;
  "touchend pointerup mouseup"?: (ev: any) => void;
  [key: string]: (ev: any) => void;
}>;

export default class App extends EventEmitter {
  public static Instance: App;

  /** 에디터 설정 파일 */
  private _config: MyEditorConfig = config;

  /** 마우스 제어 */
  public _mouse: Mouse;

  /**
   * 사각형 툴을 위한 제어 객체
   */
  private _blockRect?: {
    isDrawing: boolean;
    rect: Rectangle;
  };
  /**
   * 현재 시간
   */
  private _now: any;

  /**
   * 컴포넌트가 초기화되어있는지 여부
   */
  private _isReady!: boolean;

  /**
   * 타일 선택창
   */
  private _tilesetMarker!: TilesetMarker;
  private _tilemap!: Tilemap;

  /**
   * 타일맵 위에 겹쳐지는 타일 선택창 (오른쪽)
   */
  private _tileMarker!: TileMarker;

  private _components!: Component[];

  /** 메뉴 컴포넌트 */
  private _menu!: MenuComponent;

  /** 타일 선택창 묘화 */
  private _tilesetCanvas!: TilesetCanvas;

  private cache?: {};
  private _isMenuOpen?: boolean;
  private _tileId?: number;
  private _menuController?: MenuService;

  /**
   * 멤버 변수를 초기화합니다.
   */
  public initMembers() {
    this.cache = {};
    this._config = config;
    this._mouse = {
      x: 0,
      y: 0,
      screenX: 0,
      screenY: 0,
      buttons: {
        left: false,
        leftFire: false,
      },
      /**
       * @type {HTMLElement}
       */
      target: undefined,
      /**
       * @type {HTMLElement}
       */
      menuTarget: undefined,
      isDrawing: false,
      startX: 0,
      startY: 0,
      dragTime: 0,
    };

    /**
     * 사각형 툴을 위한 선택 영역
     * @link http://jsfiddle.net/qGzkG/2/
     */
    this._blockRect = {
      isDrawing: false,
      rect: new Rectangle(0, 0, 1, 1),
    };
    this._now = performance.now();
    this._isMenuOpen = false;
    this._tileId = 0;
    this._isReady = false;

    // 타이틀을 변경합니다.
    document.title = "Initial Map Editor";

    this.emit("ready", JSON.stringify(this));

    // 맵 설정 파일을 생성합니다.
    new EditorSchema(this._config).load("./editor.json").then((data) => {
      const myEditorConfig: EditorSchema = JSON.parse(data);
      const themeManager = new ThemeManager();

      //@ts-ignore
      if (myEditorConfig.Theme == WindowGroup.Theme.Light) {
        document.querySelector("body")!.setAttribute("data-theme", "light");
        themeManager.changeLightTheme();
      } else {
        document.querySelector("body")!.setAttribute("data-theme", "dark");
        themeManager.changeDarkTheme();
      }
    });

    this.on("save-config", (extraConfig: any) => {
      let myConfig = Object.assign(this._config.Editor, extraConfig);
      this._config.Editor = myConfig;

      new EditorSchema(myConfig).toFile("./editor.json").then((ret) => {
        alert("설정 변경이 완료되었습니다.");
      });
    });

    // new EditorSchema(this._config)
    //     .toFile("./editor.json")
    //     .then((ret) => {});

    // 뷰 객체를 생성합니다.
    // this._vueBinder = new VueBinder();
    // this._vueBinder.mount();
  }

  /**
   * 컴포넌트를 생성합니다.
   */
  public createComponents() {
    this._tilemap = new Tilemap(this._config);

    this._components.push(
      (this._tilesetMarker = new TilesetMarker(this._config))
    );
    this._components.push(this._tilemap);
    this._components.push((this._tileMarker = new TileMarker(this._config)));
    this._components.forEach((component) => {
      component.start();
    });
    this._tilemap.setTileId(0);

    // 타일맵 이벤트를 재전파합니다.
    this.on("tilemap", (...args: any) => {
      this._tilemap.emit(args[0], ...args.slice(1));
    });
  }

  /**
   * 컴포넌트를 초기화합니다.
   */
  public async initWithComponents(): Promise<void> {
    /**
     * @type {Component[]}
     */
    this._components = [];
    this._components.push((this._menu = new MenuComponent(this._config)));
    this._components.push(
      (this._menuController = new MenuService(this._config, this._menu))
    );

    this._tilesetCanvas = new TilesetCanvas(this._config);
    await this._tilesetCanvas
      .start()
      .then((ret) => {
        this.createComponents();
      })
      .then((ret) => {
        const list = <NodeListOf<HTMLElement>>(
          document.querySelectorAll(".darken, .windows-container")
        );
        const items = Array.from(list);
        if (items) {
          items.forEach((obj) => {
            obj.style.left = "-9999px";
          });
        }
      })
      .catch((err) => {
        console.warn(err);
      });
  }

  public toCamelCase() {
    return toCamelCase();
  }

  /**
   * 모바일 디바이스에서 실행하고 있는지 여부를 파악합니다.
   * @return {Boolean}
   */
  public isMobileDevice(): Boolean {
    const ret =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );
    return ret;
  }

  public onMouseTouchMove(ev: any) {
    if (!this._mouse) return;
    this._mouse.x = ev.layerX;
    this._mouse.y = ev.layerY;
    this._mouse.screenX = ev.layerX;
    this._mouse.screenY = ev.layerY;
  }

  /**
   * 마우스 이벤트 및 터치 이벤트를 초기화합니다.
   */
  public initWithMouseEvent() {
    const isMobileDevice = this.isMobileDevice();
    let events: InitialEventListener;

    if (isMobileDevice) {
      events = {
        touchmove: (ev: any) => {
          let touchEvent = ev;
          if (ev.type.indexOf("touch") >= 0) {
            touchEvent = ev.touches[0];
          }
          if (!this._mouse) return;

          const target = <HTMLElement>this._mouse.target;
          if (!this._mouse.target) return;
          const rect = <DOMRect>this._mouse.target!.getBoundingClientRect();

          // 현재 선택된 타겟 요소를 기반으로 마우스의 시작 좌표를 정확히 계산합니다.
          this._mouse.x = touchEvent.clientX - rect.x;
          this._mouse.y = touchEvent.clientY - rect.y;
          this._mouse.screenX = touchEvent.screenX;
          this._mouse.screenY = touchEvent.screenY;
        },
        "touchstart pointerdown": (ev: any) => {
          let touchEvent = ev;
          if (ev.type.indexOf("touch") >= 0) {
            touchEvent = ev.touches[0];
          }
          if (!this._mouse) return;

          this._mouse.target = ev.target;

          /**
           * @type {HTMLElement}
           */
          const target = this._mouse.target;
          if (!this._mouse.target) return;
          const rect = this._mouse.target.getBoundingClientRect();

          this._mouse.x = touchEvent.clientX - rect.x;
          this._mouse.y = touchEvent.clientY - rect.y;
          this._mouse.screenX = touchEvent.screenX;
          this._mouse.screenY = touchEvent.screenY;
          this._mouse.buttons.left = true;
          this._mouse.buttons.leftFire = false;
        },
        "touchend pointerup mouseup": (ev: any) => {
          if (!this._mouse) return;
          this._mouse.buttons.left = false;
          this._mouse.buttons.leftFire = true;
        },
      };
    } else {
      events = {
        mousemove: (ev: any) => {
          if (!this._mouse) return;
          this._mouse.x = ev.layerX;
          this._mouse.y = ev.layerY;
          this._mouse.screenX = ev.layerX;
          this._mouse.screenY = ev.layerY;

          if (this._mouse.isDrawing) {
            this._mouse.dragTime++;
          }
        },
        mousedown: (ev: any) => {
          if (ev.button == 0) {
            if (!this._mouse) return;
            this._mouse.buttons.left = true;
            this._mouse.buttons.leftFire = false;
            this._mouse.target = ev.target;
            this._mouse.isDrawing = true;

            const target = <HTMLElement>ev.target;

            // 캔버스
            const canvas = document.querySelector(
              initial2D.MAIN_CANVAS_ID
            ) as HTMLCanvasElement;

            canvas.style.cursor = "crosshair";

            const __canvas = document.querySelector(initial2D.MAIN_CANVAS_ID);
            if (!__canvas) return;
            const canvasOffset = __canvas.getBoundingClientRect();

            let offsetX: number = parseInt(canvasOffset.left as any);
            const offsetY: number = parseInt(canvasOffset.top as any);

            this._mouse.startX = parseInt((ev.clientX - offsetX) as any);
            this._mouse.startY = parseInt((ev.clientY - offsetY) as any);

            // 음수일 땐, 메인 캔버스보다 왼쪽이므로 기준 좌표를 타일셋 뷰로 변경합니다.
            if (this._mouse.startX < 0) {
              const tilesetCanvas = document.querySelector(
                initial2D.TILESET_CANVAS_ID
              );
              if (!tilesetCanvas) return;

              offsetX = tilesetCanvas.getBoundingClientRect().left;
              this._mouse.startX = parseInt((ev.clientX - offsetX) as any);
            }
          }
        },
        mouseup: (ev: any) => {
          if (ev.button == 0) {
            if (!this._mouse) return;
            this._mouse.buttons.left = false;
            this._mouse.buttons.leftFire = true;
            if (!this._blockRect) return;
            this._blockRect.isDrawing = false;
            this._mouse.isDrawing = false;

            const canvas = document.querySelector(
              "#contents__main-canvas"
            ) as HTMLCanvasElement;
            canvas.style.cursor = "default";

            this._mouse.dragTime = 0;
          }
        },
        mouseover: (ev: any) => {
          if (!this._menu) return;
          if (!this._mouse) return;
          if (this._menu._isMenuOpen) {
            this._mouse.buttons.menuTarget = ev.target;
            this._menu.emit("menu_open", this._mouse.buttons.menuTarget);
          }
        },
      };
    }

    for (let k in events) {
      window.addEventListener(k, events[k], false);
    }
  }

  setTileId(tileId: number) {
    if (!this._tilemap) return;
    this._tilemap.setTileId(tileId);
  }

  /**
   * 레이어를 토글하는 기능을 수행합니다.
   */
  initWithMapLayers() {
    const li_elements = Array.from<HTMLElement>(
      document.querySelectorAll("ul.aside__tabs__maptree-child-tree li")
    );

    let length = li_elements.length;

    for (let i = 0; i < length; i++) {
      let li_element = li_elements[i];

      let layerId = i;

      const tilemap = this._tilemap;

      li_element.onclick = () => {
        li_element.style.backgroundColor = "var(--dark-selection-color)";
        li_elements
          .filter((obj) => obj != li_element)
          .forEach((obj) => {
            obj.style.backgroundColor = "rgba(255, 255, 255, 0)";
          });

        // 타일맵을 지우고 다시 그립니다.
        tilemap.setCurrentLayerId(layerId).clear().draw().updateAlphaLayers();
      };

      let i_elements = li_element.querySelectorAll("i");
      let i_elements_length = i_elements.length;

      for (let k = 0; k < i_elements_length; k++) {
        let i_element = i_elements[k] as HTMLElement;

        i_element.onclick = () => {
          let iElement = i_element.querySelector("i");
          if (iElement instanceof HTMLElement) {
            if (iElement.classList.contains("fa-eye-slash")) {
              iElement.classList.replace("fa-eye-slash", "fa-eye");
            } else {
              iElement.classList.replace("fa-eye", "fa-eye-slash");
            }
          }

          if (i_element.classList.contains("fa-eye")) {
            i_element.classList.replace("fa-eye", "fa-eye-slash");
          } else {
            i_element.classList.replace("fa-eye-slash", "fa-eye");
          }

          tilemap.toggleLayerVisibility(layerId);
        };
      }
    }

    (
      document.querySelector(
        "ul.aside__tabs__maptree-child-tree li:first-child"
      ) as HTMLElement
    ).click();
  }

  start() {
    this.initMembers();
    this.initWithMouseEvent();

    // 모든 컴포넌트가 초기화된 이후 시점에 특정 작업을 수행합니다.
    this.initWithComponents()
      .then((ret) => {
        this.initWithMapLayers();
        this._isReady = true;
        this.on("update", (deltaTime: number) => {
          this.update(deltaTime);
        });
      })
      .catch((err) => {
        console.warn(err);
        this._isReady = false;
      });
  }

  /**
   * 매 프레임마다 반복 실행되는 메소드입니다.
   * @param {Number}} deltaTime
   */
  update(deltaTime: number) {
    if (!this._isReady) return;

    // 400ms가 지났을 때 마다 무언가를 실행합니다.
    if (deltaTime - this._now >= 400) {
      this._now = deltaTime;
    }

    this.updateComponents();

    this._mouse.buttons.leftFire = false;
  }

  /**
   * 메뉴가 열려있을 때 선별적으로 컴포넌트를 업데이트 합니다.
   */
  updateComponents() {
    const target = this._mouse.target;

    if (!target) {
      return;
    }

    const id = target.id;

    /**
     * @type {Mouse}
     */
    const mouse = this._mouse;

    // 메뉴를 업데이트합니다.
    this._menu.update<HTMLElement, any>(target, mouse);

    // 메뉴가 열리지 않았을 경우
    if (!this._menu.isMenuOpen()) {
      switch (id) {
        case "tileset-canvas":
        case "view":
          // * 마우스 왼쪽 버튼을 눌렀다 뗐을 때
          if (this._mouse.buttons.leftFire) {
            // 타일셋 마커를 표시합니다.
            this._tilesetMarker.update(mouse);
            this._tilesetMarker.onDragLeave(mouse);
          } else if (this._mouse.buttons.left) {
            this._tilesetMarker.onDragEnter(mouse);
          }
          break;
        case "contents__main-canvas":
          // * 마우스 왼쪽 버튼을 누르고 있을 때
          if (this._mouse.buttons.left) {
            // 타일셋을 업데이트합니다.
            this._tilemap.update(mouse);
          }
          // * 마우스 왼쪽 버튼을 눌렀다 뗐을 때
          if (this._mouse.buttons.leftFire) {
            // 타일 마커의 위치를 변경합니다.
            this._tileMarker.update(mouse);
          }
          break;
      }
    }
  }

  /**
   * 이 메소드는 HTML 파일로부터 전역 호출을 받기 위해 존재합니다.
   * 창을 생성하게 되면 HTML 파일을 AJAX를 이용하여 비동기 적으로 불러오게 됩니다.
   * 창은 생성 직후, 화면에서 감춰진 상태로 존재하게 됩니다.
   *
   * HTML 파일 내부에는 로드가 완료되었음을 감지하는 콜백 함수가 걸려 있습니다.
   *
   * 그 콜백 함수가 바로 이 함수이며 이 함수가 실행되면 화면에 창이 보여지게 됩니다.
   *
   * 창 생성 요청
   *              ->  HTML 파일 로드 요청
   *              ->  로드 시작
   *              ->  로드 완료
   *              ->  렌더링 시작
   *              ->  렌더링 완료 후, 브라우저에 의해 window.app.onLoad 함수가 자동으로 실행됨.
   *
   * 창은 특별한(Unique) ID 값에 의해 식별되며 이 값은 문자열입니다.
   *
   * @param {HTMLElement} elem
   * @param {String}} id
   */
  onLoad(elem: HTMLElement, id: string): void {
    WindowCreator.onLoad(elem, id);
  }

  /**
   * 유일한 인스턴스를 반환하는 메소드입니다.
   * 일렉트론 환경에서는 별도의 전역 변수를 사용하므로 사용되지 않습니다.
   *
   * @return {App}
   */
  static GetInstance() {
    if (!App.Instance) {
      process.on("uncaughtException", (err: any) => {
        console.warn(err);
      });
      process.on("unhandledRejection", (err: unknown) => {
        console.warn(err);
      });

      App.Instance = new App();
    }

    return App.Instance;
  }
}
