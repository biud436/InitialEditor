const { Router } = require("express");
const BaseController = require("./BaseController");

class ConfigController extends BaseController {

    /**
     * 
     * @param {Router} router 
     */
    constructor(router) {
        super(router);
    }

    doGet() {
        this._router.route("/config").get((req, res) => {

        });
    }

}

module.exports = ConfigController;