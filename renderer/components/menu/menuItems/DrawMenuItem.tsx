import { IconItem } from "@components/atomics/IconItem";
import { ListContainer } from "@components/atomics/ListContainer";
import { ListItem } from "@components/atomics/ListItem";

export function DrawMenuitem() {
    return (
        // ul을 컴포넌트로 감싸면 유니크 클래스 명이 생성되는 듯 하다.
        <ListContainer
            className="menu__draw-sub menu-style"
            defaultValue="Draw"
        >
            <ListItem data-action="draw-pencil" key="draw-pencil_x1r1">
                <IconItem className="fas fa-pencil-alt" />
                Pencil
            </ListItem>
            <ListItem data-action="draw-rectangle" key="draw-rectangle_x1r1">
                <IconItem className="fas fa-square-full" />
                Rectangle
            </ListItem>
            <ListItem data-action="draw-ellipse" key="draw-ellipse_x2r2">
                <IconItem className="fas fa-circle" />
                Ellipse
            </ListItem>
            <ListItem data-action="draw-flood-fill" key="draw-flood-fill_x2r2">
                <IconItem className="fas fa-fill" />
                Flood Fill
            </ListItem>
            <ListItem data-action="draw-shadow-pen" key="draw-shadow-pen_x3r3">
                <IconItem className="fas fa-paint-brush" />
                Shadow Pen
            </ListItem>
        </ListContainer>
    );
}
