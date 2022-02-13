import Vue from "vue";
import Vuex from "vuex";
import VueRouter from "vue-router";
import VueCompositionAPI from "@vue/composition-api";
import { EventEmitter } from "./EventEmitter";
import NewWindow from "./views/components/window/NewWindow.vue";
import MainContainer from "./views/MainContainer.vue";
import TilesetWindow from "./views/components/window/TilesetWindow.vue";
import { store } from "./store";

export class VueBinder extends EventEmitter {
    private app: Vue;

    constructor() {
        super();
    }

    /**
     * 메인 컨테이너에서 사용할 라우터 설정
     * @returns
     */
    getRoutesForMainContainer(): any {
        return [
            { path: "/", name: "home", component: MainContainer },
            {
                path: "/newWindow",
                name: "newWindow",
                component: NewWindow,
            },
            {
                path: "/optionWindow",
                name: "optionWindow",
                component: TilesetWindow,
            },
        ];
    }

    /**
     * 뷰 마운트
     */
    mount() {
        // 미들웨어 사용
        Vue.use(VueRouter);
        Vue.use(VueCompositionAPI);

        // 라우터 설정
        const routerForMainContainer = new VueRouter({
            mode: "history",
            routes: this.getRoutesForMainContainer(),
        });

        // 컨테이너 생성
        this.app = new Vue({
            router: routerForMainContainer,
            store,
            render: (h) => h(MainContainer),
        }).$mount("#container");
    }
}
