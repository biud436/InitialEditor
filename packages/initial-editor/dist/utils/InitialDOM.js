class InitialDOM {
    static query(selectors) {
        return document.querySelector(selectors);
    }
    static queryAll(selectors) {
        return document.querySelectorAll(selectors);
    }
    static fetch(tagName, options) {
        return document.createElement(tagName, options);
    }
    /**
     * 리액트 스타일의 css 바인딩을 사용할 수 있습니다.
     *
     * @param strings
     * @param values
     * @returns
     */
    static css(strings, ...values) {
        const str = strings.reduce((acc, cur, idx) => {
            return acc + cur + (values[idx] || "");
        }, "");
        const uniqueClassName = this.createStyleTagName();
        document.head.insertAdjacentHTML("beforeend", `
            <style>
                .${uniqueClassName} {
                    ${str}
                }
            </style>
            `);
        return uniqueClassName;
    }
    static createStyleTagName() {
        return `css-${Math.random().toString(36).slice(2)}`;
    }
}
export default InitialDOM;
//# sourceMappingURL=InitialDOM.js.map