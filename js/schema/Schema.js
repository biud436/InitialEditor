class Schema {
    constructor(config) {   
        this.initMembers(config);
    }

    initMembers(config) {
    }

    toJson() {
        return JSON.stringify(this);
    }
}

export {Schema};