function toCamelCase(name: any = "") {
    const snake = name || "";

    let nodes: any = snake.split(/[\s\-]/);
    let nodesTail: any = nodes.slice(1);

    const camel = nodes[0].concat(
        nodesTail.map((e: any) => {
            return e[0].toUpperCase() + e.slice(1);
        }) as any
    );
    return camel;
}

function getClassName(name: any) {
    const str = toCamelCase(name);
    return str.slice(0, 1).toUpperCase() + str.slice(1);
}

export { toCamelCase, getClassName };
