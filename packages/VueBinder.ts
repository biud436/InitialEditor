import Vue from "vue";
import { EventEmitter } from "./EventEmitter";
import VueApp from "./VueApp.vue";

export class VueBinder extends EventEmitter {
    private vnode: Vue;

    constructor() {
        super();
    }

    mount() {
        this.vnode = new Vue({
            el: "#app",
            render: h => h(VueApp)
        }).$mount();
    }
}
