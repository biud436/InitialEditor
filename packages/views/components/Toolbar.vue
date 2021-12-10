<template>
    <div class="toolbar">
        <ul>
            <!-- 파일 툴바 -->
            <li data-action="file-new" class="file-menu-new-button">
                <i class="far fa-file" title="게임 만들기"></i>
            </li>
            <li data-action="file-open">
                <i class="far fa-folder-open" title="게임 열기"></i>
            </li>
            <li data-action="file-save"><i class="far fa-save"></i></li>
            <li data-action="edit-undo"><i class="fas fa-undo"></i></li>
            <li class="toolbar__empty-line--modifier"></li>
            <!-- 편집 툴바 -->
            <li data-action="edit-cut"><i class="fas fa-cut"></i></li>
            <li data-action="edit-copy"><i class="fas fa-copy"></i></li>
            <li data-action="edit-paste">
                <i class="fas fa-paste"></i>
            </li>
            <li data-action="edit-delete">
                <i class="fas fa-trash-alt"></i>
            </li>
            <li class="toolbar__empty-line--modifier"></li>
            <!-- 모드 툴바 -->
            <li data-action="mode-map">
                <i class="fas fa-layer-group"></i>
            </li>
            <li data-action="mode-event">
                <i class="fas fa-flag-checkered"></i>
            </li>
            <li data-action="mode-region">
                <i class="fas fa-map"></i>
            </li>
            <li class="toolbar__empty-line--modifier"></li>
            <!-- 드로우 툴바 -->
            <li data-action="draw-pencil">
                <i id="pen-tool" class="fas fa-pencil-alt" title="펜"></i>
            </li>
            <li data-action="draw-rectangle">
                <i
                    id="square-tool"
                    class="fas fa-square-full"
                    title="사각형"
                ></i>
            </li>
            <li data-action="draw-ellipse">
                <i
                    id="rectangle-tool"
                    class="fas fa-circle"
                    title="직사각형"
                ></i>
            </li>
            <li data-action="draw-flood-fill">
                <i id="pen-tool" class="fas fa-fill" title="채우기"></i>
            </li>
            <li data-action="draw-shadow-pen">
                <i
                    id="shadow-tool"
                    class="fas fa-paint-brush"
                    title="그림자"
                ></i>
            </li>
            <li class="toolbar__empty-line--modifier"></li>
            <!-- 기타 툴바 -->
            <li data-action="take-screenshot">
                <i
                    id="take-screenshot"
                    title="맵 파일 내보내기"
                    class="fas fa-book"
                ></i>
            </li>
            <li data-action="tools-resource-manager">
                <i class="fas fa-scroll"></i>
            </li>
            <li data-action="tools-script-eidtor">
                <i class="fas fa-toolbox"></i>
            </li>
            <li data-action="tools-sound-test">
                <i class="fas fa-music"></i>
            </li>
            <li class="toolbar__empty-line--modifier"></li>
            <li data-action="tools-options">
                <i class="fas fa-user-cog"></i>
            </li>
            <li class="toolbar__empty-line--modifier"></li>
            <li data-action="game-playtest">
                <i class="fas fa-gamepad"></i>
            </li>
            <li class="toolbar__empty-line--modifier"></li>
            <li data-action="game-folder-open">
                <i class="fas fa-folder-open"></i>
            </li>
        </ul>
    </div>
</template>
<script>
export default {};
</script>
<style></style>
