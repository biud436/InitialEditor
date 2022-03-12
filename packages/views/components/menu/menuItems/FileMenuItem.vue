<template>
    <ul class="menu__file-sub menu-style" value="File">
        <li data-action="file-new" class="file-menu-new-button">
            <i class="far fa-file"></i>New<em>Ctrl+N</em>
        </li>
        <li data-action="file-open">
            <i class="far fa-folder-open"></i>Open<em>Ctrl+O</em>
        </li>
        <li data-action="file-close">
            <i class="far fa-window-close"></i>Close
        </li>
        <li data-action="file-save">
            <i class="far fa-save"></i>Save<em>Ctrl+S</em>
        </li>
        <li data-action="file-preferences">
            <i class="fas fa-wrench"></i>User Preferences<em>Ctrl+M</em>
        </li>
        <li class="menu__empty-line"></li>
        <li data-action="file-export">
            <i class="fas fa-file-download"></i>Export
        </li>
        <li class="menu__empty-line"></li>
        <li data-action="file-exit"><i class="far fa-times-circle"></i>Exit</li>
    </ul>
</template>
<script>
export default {};
</script>
<style></style>
