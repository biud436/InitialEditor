class Schema {
    constructor(config: any) {   
        this.initMembers(config);
    }

    initMembers(config: any) {
    }

    toJson() {
        return JSON.stringify(this);
    }
}

export {Schema};