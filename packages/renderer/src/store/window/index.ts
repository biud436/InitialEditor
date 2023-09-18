import { atom, RecoilState } from 'recoil';

export const WindowStateMap = <const>[
    'none',
    'newWindow',
    'optionWindow',
    'scriptEditor',
];
export type WindowType = (typeof WindowStateMap)[number];
export type WindowStateImpl = {
    currentWindow: (typeof WindowStateMap)[number];
};

export const WindowState = <RecoilState<WindowStateImpl>>atom({
    key: 'windowState',
    default: {
        currentWindow: 'none',
    },
});
