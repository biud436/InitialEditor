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

}

export { Component, BasicComponent };