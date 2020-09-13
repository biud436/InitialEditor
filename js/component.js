class Component {
    constructor(...args) {
        this.initMembers(...args);
        this.start();
    }

    initMembers(...args) {

    }

    start() {
        return this;
    }
}

class BasicComponent extends Component {
    constructor(...args) {
        super(...args);
    }
}

export { Component, BasicComponent };