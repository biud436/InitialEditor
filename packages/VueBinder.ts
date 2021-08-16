import Vue from "vue";
import VueRouter from "vue-router";
import { EventEmitter } from "./EventEmitter";
import VueApp from "./views/VueApp.vue";
import NewWindow from "./views/NewWindow.vue";

export class VueBinder extends EventEmitter {
    private vnode: Vue;

    constructor() {
        super();
    }

    getRoutes(): any {
        return [
            { path: "/", name: "home", component: VueApp },
            {
                path: "/newWindow",
                component: NewWindow
            }
        ];
    }

    mount() {
        // 라우터 사용
        Vue.use(VueRouter);

        const router = new VueRouter({
            mode: "history",
            routes: this.getRoutes()
        });

        this.vnode = new Vue({
            router,
            render: h => h(VueApp)
        }).$mount("#app");
    }
}
