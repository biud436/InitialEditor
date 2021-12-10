<template>
    <div id="wrapper">
        <div class="container">
            <!-- 메뉴 -->
            <main-menu-container />
            <!-- 툴바 -->
            <toolbar />
            <!-- 타일 선택 창 -->
            <tile-select-window />
            <!-- 타일맵 -->
            <tilemap />
        </div>
        <div id="app">
            <router-view></router-view>
        </div>
    </div>
</template>
<script>
import MainMenuContainer from "./components/menu/MainMenuContainer.vue";
import Tilemap from "./components/frame/Tilemap.vue";
import TileSelectWindow from "./components/frame/TileSelectWindow.vue";
import Toolbar from "./components/frame/Toolbar.vue";

export default {
    components: {
        MainMenuContainer,
        Toolbar,
        TileSelectWindow,
        Tilemap
    },
    mounted() {
        this.injectServices();
    },
    methods: {
        /**
         * TODO: Note that there is a bug of vetur extension when adding component.
         */
        injectServices() {
            window.onMounted(() => {
                // 외부에서 뷰의 라우터를 호출할 수 있는 인터페이스를 선언합니다.
                if (window.app) {
                    window.app.on("openWindow", this.openWindow);
                }
            });
        },
        /**
         * Open internel modal window for vue.
         */
        openWindow(route) {
            this.$router.push(route);
        }
    }
};
</script>
<style>
@import url("../../css/main.css");
#app {
    background-color: transparent;
}
</style>
