/**
 * @class BaseController
 * @description This class allows you to control request and response message in http.
 */
class BaseController {

    /**
     * 
     * @param {Router} router 
     */
    constructor(router) {
        /**
         * @type {Router}
         */
        this._router = Router;
    }

    doGet() {
    }

};
module.exports = BaseController;