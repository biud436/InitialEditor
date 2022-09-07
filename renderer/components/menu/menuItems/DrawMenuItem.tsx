import { IconItem } from "@components/atomics/IconItem";
import { ListContainer } from "@components/atomics/ListContainer";
import { ListItem } from "@components/atomics/ListItem";

export function DrawMenuitem() {
    return (
        // ul을 컴포넌트로 감싸면 유니크 클래스 명이 생성되는 듯 하다.
        <ul className="menu__draw-sub menu-style" defaultValue="Draw">
            <li data-action="draw-pencil" key="draw-pencil_x1r1">
                <i className="fas fa-pencil-alt" />
                Pencil
            </li>
            <li data-action="draw-rectangle" key="draw-rectangle_x1r1">
                <i className="fas fa-square-full" />
                Rectangle
            </li>
            <li data-action="draw-ellipse" key="draw-ellipse_x2r2">
                <i className="fas fa-circle" />
                Ellipse
            </li>
            <li data-action="draw-flood-fill" key="draw-flood-fill_x2r2">
                <i className="fas fa-fill" />
                Flood Fill
            </li>
            <li data-action="draw-shadow-pen" key="draw-shadow-pen_x3r3">
                <i className="fas fa-paint-brush" />
                Shadow Pen
            </li>
        </ul>
    );
}
