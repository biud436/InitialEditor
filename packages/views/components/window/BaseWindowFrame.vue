<template>
    <div class="window-frame-wrapper">
        <div
            :class="{
                'window-frame-wrapper--active': isActive,
                'window-frame-wrapper--inactive': !isActive
            }"
        >
            <!-- prettier-ignore -->
            <p>
                <span>
                    <i class="far fa-window-close" @click="close" />
                </span>
            </p>
        </div>
        <div class="window-frame-body">
            <slot name="content">
                <!-- 여기에 창 내용이 삽입됩니다 -->
            </slot>
        </div>
    </div>
</template>
<script>
export default {
    data() {
        return {
            title: "",
            isActive: true
        };
    },
    methods: {
        close() {
            this.$router.push("home");
        }
    }
};
</script>
<style lang="scss">
.window-frame-wrapper--active {
    width: 256px;
    height: 240px;
    position: relative;
    left: 50%;
    display: flex;
    align-self: center;
}
.window-frame-wrapper--disabled {
    @extend .window-frame-wrapper--active;
    opacity: 0.5;
}
</style>
