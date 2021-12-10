import * as vuex from "vuex";

type State = Record<string, any>;

export const state = <State>{
    title: "",
    theme: "dark"
};

export namespace api {
    export const SET_TITLE = "api/setTitle";
    export const GET_TITLE = "api/getTitle";
    export const SET_THEME = "api/setTheme";
    export const GET_THEME = "api/getTheme";
}

export const mutations: vuex.MutationTree<State> = {
    [api.SET_TITLE](state, title: string) {
        state.title = title;
    },
    [api.SET_THEME](state, theme: string) {
        state.theme = theme;
    }
};

export const getters = {
    [api.GET_TITLE]: (state: State) => state.title,
    [api.GET_THEME]: (state: State) => state.theme
};

export const actions = {
    [api.SET_TITLE](
        { commit, dispatch }: vuex.ActionContext<State, State>,
        title: string
    ) {
        commit("api/setTitle", title);
    },
    [api.SET_THEME](
        { commit, dispatch }: vuex.ActionContext<State, State>,
        theme: string
    ) {
        commit("api/setTheme", theme);
    }
};
