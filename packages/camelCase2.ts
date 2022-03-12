export function toCamelCase(name: string) {
    const snake = name || "";

    let nodes = snake.split(/[\s\-]/);
    let nodesTail = nodes.slice(1);

    const camel = nodes[0].concat(
        ...nodesTail.map((e) => {
            return e[0].toUpperCase() + e.slice(1);
        })
    );
    return camel;
}

export function getClassName(name: string) {
    const str = toCamelCase(name);
    return str.slice(0, 1).toUpperCase() + str.slice(1);
}
