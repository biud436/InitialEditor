<template>
    <div v-on:class="$style.background" :ref="name">
        <!-- prettier-ignore -->
        <window-frame-header :theme="theme">
            <p>
                <span>
                    <i class="far fa-window-close" @click="close" />
                </span>
            </p>
            부모 창의 헤더
        </window-frame-header>
        <div class="window-frame-body">
            <slot name="content">
                <!-- 여기에 창 내용이 삽입됩니다 -->
            </slot>
        </div>
    </div>
</template>
<script>
import styled from "vue-styled-components";

/**
 * TODO: vue-styled-components를 도입하였으나 취약점 및 기타 여러가지 버그가 있어 제어하기 쉽지 않음.
 * ! 삭제 예정
 */
const WindowFrameHeader = styled.div`
    width: ${(props) => props.theme.width + "px"};
    height: ${(props) => props.theme.width + "px"};
    position: relative;
    left: 50%;
    display: flex;
    align-self: center;
    background-color: #252526;
`;

export default {
    components: {
        WindowFrameHeader,
    },
    props: {
        name: {
            type: String,
            default: "Window",
        },
        width: {
            type: Number,
            default: 256,
        },
        height: {
            type: Number,
            default: 256,
        },
    },
    mounted() {
        const refName = this.name;
        $(this.$refs[refName]).draggable();
    },
    data() {
        return {
            title: "",
            isActive: true,
            theme: {
                width: 256,
                height: 512,
            },
        };
    },
    methods: {
        close() {
            this.$router.push("home");
        },
    },
};
</script>
<style lang="scss" module scoped>
.background {
    width: 100%;
    height: 100%;
    position: relative;
    left: 50%;
    display: flex;
    align-self: center;
    background-color: #252526;
}
</style>
