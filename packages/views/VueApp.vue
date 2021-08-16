<template>
    <div id="app">
        <!-- 바람이 분다 -->
        <new-window />
    </div>
</template>
<script>
import NewWindow from "./NewWindow.vue";
import TilesetWindow from "./TilesetWindow.vue";

export default {
    components: {
        NewWindow,
        TilesetWindow
    }
};
</script>
<style>
@import url("../../css/main.css");
#app {
    background-color: transparent;
}
</style>
