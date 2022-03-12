<template>
    <ul class="menu__main">
        <li class="menu__main-program-icon"></li>
        <li class="menu__main-file">
            <label for="file" data-action="file">File</label>
        </li>
        <li><label for="edit" data-action="edit">Edit</label></li>
        <li><label for="mode" data-action="mode">Mode</label></li>
        <li><label for="draw" data-action="draw">Draw</label></li>
        <li>
            <label for="scale" data-action="scale">Scale</label>
        </li>
        <li>
            <label for="tools" data-action="tools">Tools</label>
        </li>
        <li><label for="game" data-action="game">Game</label></li>
        <li><label for="help" data-action="help">Help</label></li>
        <ul class="control-box">
            <li class="minimum" data-action="minimum">
                <i class="fas fa-minus"></i>
            </li>
            <li class="maximum" data-action="maximum">
                <i class="fas fa-window-maximize"></i>
            </li>
            <li class="close" data-action="close">
                <i class="far fa-window-close"></i>
            </li>
        </ul>
    </ul>
</template>
<script>
export default {};
</script>
<style></style>
