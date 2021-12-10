import * as vuex from "vuex";

type State = Record<string, any>;

export const state = <State>{
    title: ""
};

export namespace api {
    export const SET_TITLE = Symbol("api/setTitle");
    export const GET_TITLE = Symbol("api/getTitle");
}

export const mutations: vuex.MutationTree<State> = {
    [api.SET_TITLE](state, title: string) {
        state.title = title;
    }
};

export const getters = {
    [api.GET_TITLE]: (state: State) => state.title
};

export const actions = {
    [api.SET_TITLE](
        { commit, dispatch }: vuex.ActionContext<State, State>,
        title: string
    ) {
        commit("setTitle", title);
    }
};
