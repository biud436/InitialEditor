function toCamelCase(name: string) {
    const snake = name || "";

    let nodes: string[] = snake.split(/[\s\-]/);
    let nodesTail: string[] = nodes.slice(1);
    
    const camel = nodes[0].concat( (nodesTail.map(e => {
        return e[0].toUpperCase() + e.slice(1);
    }) as any) );
    return camel;
}

function getClassName(name: string) {
    const str = toCamelCase(name);
    return str.slice(0, 1).toUpperCase() + str.slice(1);
}

export {toCamelCase, getClassName};
