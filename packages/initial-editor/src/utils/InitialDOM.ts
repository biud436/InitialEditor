import Container, { Service } from "typedi";

@Service()
class InitialDOM {
    query<T extends Element = Element>(selectors: string): T | null {
        return document.querySelector<T>(selectors);
    }

    queryAll<T extends Element = Element>(selectors: string): NodeListOf<T> {
        return document.querySelectorAll<T>(selectors);
    }

    fetch<K extends keyof HTMLElementTagNameMap>(
        tagName: K,
        options?: ElementCreationOptions
    ): HTMLElementTagNameMap[K] {
        return document.createElement(tagName, options);
    }

    /**
     * 리액트 스타일의 css 바인딩을 사용할 수 있습니다.
     *
     * @param strings
     * @param values
     * @returns
     */
    css(strings: TemplateStringsArray, ...values: any[]) {
        const str = strings.reduce((acc, cur, idx) => {
            return acc + cur + (values[idx] || "");
        }, "");

        const uniqueClassName = this.createStyleTagName();

        document.head.insertAdjacentHTML(
            "beforeend",
            `
            <style>
                .${uniqueClassName} {
                    ${str}
                }
            </style>
            `
        );

        return uniqueClassName;
    }

    private createStyleTagName() {
        return `css-${Math.random().toString(36).slice(2)}`;
    }
}

export default Container.get(InitialDOM);
