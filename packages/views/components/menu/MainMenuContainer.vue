<template>
    <div class="menu">
        <window-title-bar></window-title-bar>
        <!-- 
                다음 <input> 요소는 실제 화면에서 보이지 않습니다. 
                general sibling combinator를 이용하여 메뉴를 토글할 때 사용됩니다.
                이것은 간단하게 만들 수 있지만 꽤나 강력합니다.

                그러나 실제 메뉴와 달리 다양한 상태에 대응할 수가 없어,
                일부 동작에서는 매우 부자연스럽습니다.

                예를 들면, 일반적으로 메뉴가 열린 상태에서 우측 메뉴에 마우스를 오버하면
                즉시 우측에 있는 메뉴가 열려야 합니다만,

                CSS로는 이를 제어할 수가 없기 때문에 자바스크립트 코드가 들어가야 합니다.
            -->
        <input type="radio" name="menu" id="file" />
        <input type="radio" name="menu" id="edit" />
        <input type="radio" name="menu" id="mode" />
        <input type="radio" name="menu" id="draw" />
        <input type="radio" name="menu" id="scale" />
        <input type="radio" name="menu" id="tools" />
        <input type="radio" name="menu" id="game" />
        <input type="radio" name="menu" id="help" />
        <input type="radio" name="menu" id="none" />

        <!-- 메인 메뉴 -->
        <top-down-navigation-menu></top-down-navigation-menu>
        <!-- 파일 서브 메뉴 -->
        <file-menu-item></file-menu-item>
        <!-- 편집 서브 메뉴 -->
        <edit-menu-item></edit-menu-item>
        <!-- 모드 서브 메뉴 -->
        <mode-menu-item></mode-menu-item>
        <!-- 드로우 서브 메뉴 -->
        <draw-menu-item></draw-menu-item>
        <!-- 스케일 서브 메뉴 -->
        <scale-menu-item></scale-menu-item>
        <!-- 도구 서브 메뉴 -->
        <tool-menu-item></tool-menu-item>
        <!-- 게임 서브 메뉴 -->
        <game-menu-item></game-menu-item>
        <!-- 도움말 서브 메뉴 -->
        <help-menu-item></help-menu-item>
    </div>
</template>
<script>
import DrawMenuItem from "./menuItems/DrawMenuItem.vue";
import EditMenuItem from "./menuItems/EditMenuItem.vue";
import FileMenuItem from "./menuItems/FileMenuItem.vue";
import GameMenuItem from "./menuItems/GameMenuItem.vue";
import HelpMenuItem from "./menuItems/HelpMenuItem.vue";
import ModeMenuItem from "./menuItems/ModeMenuItem.vue";
import ScaleMenuItem from "./menuItems/ScaleMenuItem.vue";
import ToolMenuItem from "./menuItems/ToolMenuItem.vue";
import TopDownNavigationMenu from "./menuItems/TopDownNavigationMenu.vue";
import WindowTitleBar from "./WindowTitleBar.vue";

export default {
    components: {
        WindowTitleBar,
        TopDownNavigationMenu,
        FileMenuItem,
        EditMenuItem,
        ModeMenuItem,
        DrawMenuItem,
        ScaleMenuItem,
        ToolMenuItem,
        GameMenuItem,
        HelpMenuItem
    }
};
</script>
