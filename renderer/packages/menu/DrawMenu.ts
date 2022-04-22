import { WindowCreator } from "../WindowCreator";

export type DrawMenuImpl = {
  name: string;
  children: {
    [key in
      | "draw-pencil"
      | "draw-rectangle"
      | "draw-ellipse"
      | "draw-ellipse"
      | "draw-flood-fill"
      | "draw-shadow pen"]: {
      name: string;
      children: Partial<Record<string, any>>;
      action: (ev: any) => void;
    };
  };
  [key: string]: any;
};

export const DrawMenu = <Partial<DrawMenuImpl>>{
  name: "그리기",
  children: {
    "draw-pencil": {
      name: "펜",
      children: {},
      action: (ev: any) => {
        window.app.emit("tilemap:drawingType", 0);
      },
    },
    "draw-rectangle": {
      name: "정사각형",
      children: {},
      action: (ev: any) => {
        window.app.emit("tilemap:drawingType", 1);
      },
    },
    "draw-ellipse": {
      name: "직사각형",
      children: {},
      action: (ev: any) => {
        window.app.emit("tilemap:drawingType", 2);
      },
    },
    "draw-flood-fill": {
      name: "채우기",
      children: {},
      action: (ev: any) => {
        window.app.emit("tilemap:drawingType", 3);
      },
    },
    "draw-shadow pen": {
      name: "그림자",
      children: {},
      action: (ev: any) => {},
    },
  },
};
