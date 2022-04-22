import { WindowCreator } from "../WindowCreator";

export const EditMenuNameMap = <const>[
  "edit-undo",
  "edit-cut",
  "edit-copy",
  "edit-paste",
  "edit-delete",
];

export type EditMenuImpl = {
  name: string;
  children: {
    [key in typeof EditMenuNameMap[number]]: {
      name: string;
      children: Partial<Record<string, any>>;
      action: (ev: any) => void;
    };
  };
};

export const EditMenu = <Partial<EditMenuImpl>>{
  name: "편집",
  children: {
    "edit-undo": {
      name: "취소",
      children: {},
    },
    "edit-cut": {
      name: "자르기",
      children: {},
    },
    "edit-copy": {
      name: "복사하기",
      children: {},
    },
    "edit-paste": {
      name: "붙여넣기",
      children: {},
    },
    "edit-delete": {
      name: "삭제하기",
      children: {},
    },
  },
};
