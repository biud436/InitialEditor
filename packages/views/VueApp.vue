<template>
    <div id="app">
        <router-view></router-view>
    </div>
</template>
<script>
import NewWindow from "./NewWindow.vue";
import TilesetWindow from "./TilesetWindow.vue";

export default {
    components: {
        NewWindow,
        TilesetWindow
    },
    mounted() {
        // 외부에서 뷰의 라우터를 호출할 수 있는 인터페이스를 선언합니다.
        if (window.app) {
            window.app.on("openWindow", this.openWindow);
        }
    },
    methods: {
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
