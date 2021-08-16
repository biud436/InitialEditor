<template>
    <div id="app">
        <!-- <new-window /> -->
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
        // 새 파일 창을 바로 엽니다.
        this.$router.push({ path: "/newWindow" });
    }
};
</script>
<style>
@import url("../../css/main.css");
#app {
    background-color: transparent;
}
</style>
