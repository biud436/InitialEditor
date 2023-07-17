import Container, { Service } from "typedi";

@Service()
class InitialDOM {
    query<T extends Element = Element>(selectors: string): T | null {
        return document.querySelector<T>(selectors);
    }

    fetch<K extends keyof HTMLElementTagNameMap>(
        tagName: K,
        options?: ElementCreationOptions
    ): HTMLElementTagNameMap[K] {
        return document.createElement(tagName, options);
    }
}

export default Container.get(InitialDOM);
