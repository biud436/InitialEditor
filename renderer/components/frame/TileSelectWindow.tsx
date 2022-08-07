import { Resizable, ResizableBox } from "react-resizable";
import { IconItem } from "../atomics/IconItem";
import { Input } from "../atomics/Input";
import { ListContainer } from "../atomics/ListContainer";
import { ListItem } from "../atomics/ListItem";
import { Division } from "../atomics/Wrapper";

export function TileSelectWindow() {
    return (
        <Division id="aside">
            <Division className="aside__tabs">
                <Division id="view" onDragStart={() => false}></Division>

                <Input type="radio" name="tile" id="a" defaultChecked />
                <Input type="radio" name="tile" id="b" />
                <Input type="radio" name="tile" id="c" />
                <Input type="radio" name="tile" id="d" />
                <Input type="radio" name="tile" id="e" />
                <ListContainer>
                    <ListItem>
                        <label htmlFor="a" id="tab-a" data-action="tab1">
                            A
                        </label>
                    </ListItem>
                    <ListItem>
                        <label htmlFor="b" id="tab-b" data-action="tab2">
                            B
                        </label>
                    </ListItem>
                    <ListItem>
                        <label htmlFor="c" id="tab-c" data-action="tab3">
                            C
                        </label>
                    </ListItem>
                    <ListItem>
                        <label htmlFor="d" id="tab-d" data-action="tab4">
                            D
                        </label>
                    </ListItem>
                    <ListItem>
                        <label htmlFor="e" id="tab-e" data-action="tab5">
                            E
                        </label>
                    </ListItem>
                </ListContainer>
                <Division className="aside__tabs__maptree">
                    <ListContainer>
                        <ListItem>
                            <IconItem className="fas fa-folder" />
                            레이어 그룹
                            <ListContainer className="aside__tabs__maptree-child-tree">
                                <ListItem data-action="layer1">
                                    <IconItem className="far fa-eye" />
                                    레이어 1
                                </ListItem>
                                <ListItem data-action="layer2">
                                    <IconItem className="far fa-eye" />
                                    레이어 2
                                </ListItem>
                                <ListItem data-action="layer3">
                                    <IconItem className="far fa-eye" />
                                    레이어 3
                                </ListItem>
                                <ListItem data-action="layer4">
                                    <IconItem className="far fa-eye" />
                                    레이어 4
                                </ListItem>
                            </ListContainer>
                        </ListItem>
                    </ListContainer>
                </Division>
            </Division>
        </Division>
    );
}
