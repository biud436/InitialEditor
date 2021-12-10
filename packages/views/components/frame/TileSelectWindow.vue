<template>
    <div id="aside">
        <div class="aside__tabs">
            <div id="view" ondragstart="return false;"></div>
            <!-- 탭 컨트롤을 위한 체크박스입니다. -->
            <input type="radio" name="tile" id="a" checked />
            <input type="radio" name="tile" id="b" />
            <input type="radio" name="tile" id="c" />
            <input type="radio" name="tile" id="d" />
            <input type="radio" name="tile" id="e" />
            <ul>
                <li>
                    <label for="a" id="tab-a" data-action="tab1">A</label>
                </li>
                <li>
                    <label for="b" id="tab-b" data-action="tab2">B</label>
                </li>
                <li>
                    <label for="c" id="tab-c" data-action="tab3">C</label>
                </li>
                <li>
                    <label for="d" id="tab-d" data-action="tab4">D</label>
                </li>
                <li>
                    <label for="e" id="tab-e" data-action="tab5">E</label>
                </li>
            </ul>
            <div class="aside__tabs__maptree">
                <ul>
                    <li>
                        <i class="fas fa-folder"></i>레이어 그룹
                        <ul class="aside__tabs__maptree-child-tree">
                            <li data-action="layer1">
                                <i class="far fa-eye"></i>레이어 1
                            </li>
                            <li data-action="layer2">
                                <i class="far fa-eye"></i>레이어 2
                            </li>
                            <li data-action="layer3">
                                <i class="far fa-eye"></i>레이어 3
                            </li>
                            <li data-action="layer4">
                                <i class="far fa-eye"></i>레이어 4
                            </li>
                        </ul>
                    </li>
                </ul>
            </div>
        </div>
    </div>
</template>
<script>
export default {};
</script>
<style></style>
