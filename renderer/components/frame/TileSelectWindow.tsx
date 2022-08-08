import { Label } from "@components/atomics/Label";
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
                    <ListItem key="x1e4_tileset_window_tab_1">
                        <Label htmlFor="a" id="tab-a" data-action="tab1">
                            A
                        </Label>
                    </ListItem>
                    <ListItem key="x1e4_tileset_window_tab_2">
                        <Label htmlFor="b" id="tab-b" data-action="tab2">
                            B
                        </Label>
                    </ListItem>
                    <ListItem key="x1e4_tileset_window_tab_3">
                        <Label htmlFor="c" id="tab-c" data-action="tab3">
                            C
                        </Label>
                    </ListItem>
                    <ListItem key="x1e4_tileset_window_tab_4">
                        <Label htmlFor="d" id="tab-d" data-action="tab4">
                            D
                        </Label>
                    </ListItem>
                    <ListItem key="x1e4_tileset_window_tab_5">
                        <Label htmlFor="e" id="tab-e" data-action="tab5">
                            E
                        </Label>
                    </ListItem>
                </ListContainer>
                <Division className="aside__tabs__maptree">
                    <ListContainer>
                        <ListItem>
                            <IconItem className="fas fa-folder" />
                            레이어 그룹
                            <ListContainer className="aside__tabs__maptree-child-tree">
                                <ListItem
                                    data-action="layer1"
                                    key="x1e4_tileset_window_map_tree_layer_1"
                                >
                                    <IconItem className="far fa-eye" />
                                    레이어 1
                                </ListItem>
                                <ListItem
                                    data-action="layer2"
                                    key="x1e4_tileset_window_map_tree_layer_2"
                                >
                                    <IconItem className="far fa-eye" />
                                    레이어 2
                                </ListItem>
                                <ListItem
                                    data-action="layer3"
                                    key="x1e4_tileset_window_map_tree_layer_3"
                                >
                                    <IconItem className="far fa-eye" />
                                    레이어 3
                                </ListItem>
                                <ListItem
                                    data-action="layer4"
                                    key="x1e4_tileset_window_map_tree_layer_4"
                                >
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
