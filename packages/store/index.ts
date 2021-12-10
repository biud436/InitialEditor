import Vue from "vue";
import Vuex from "vuex";
import * as api from "./api";

Vue.use(Vuex);

export const store = new Vuex.Store({
    actions: {},
    modules: {
        api
    },
    state: {},
    getters: {}
});
