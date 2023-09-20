import { RefObject } from 'react';

export function getWindowCenterPosition(ref: RefObject<HTMLDivElement>) {
    let width = window.innerWidth / 6;
    let height = window.innerHeight / 2 - 100;

    if (ref) {
        const elem = ref.current;
        if (elem) {
            width -= elem.offsetWidth / 2;
            height -= elem.offsetHeight / 2;
        }
    }

    return {
        x: Math.floor(width),
        y: Math.floor(height),
    };
}
