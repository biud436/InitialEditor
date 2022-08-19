import { RefObject } from "react";

export function getNativeHTMLElement<T extends HTMLElement>(
    refElement: RefObject<T>
): T {
    const element = refElement.current;

    return element as T;
}
