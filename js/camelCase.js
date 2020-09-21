function toCamelCase(name) {
    const snake = name || "";

    let nodes = snake.split(/[\s\-]/);
    let nodesTail = nodes.slice(1);
    
    const camel = nodes[0].concat(nodesTail.map(i => i[0].toUpperCase() + i.slice(1)));
    return camel;
}

function getClassName(name) {
    const str = toCamelCase(name);
    return str.slice(0, 1).toUpperCase() + str.slice(1);
}

export default {toCamelCase, getClassName};