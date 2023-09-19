import { Label } from '../atomics/Label';
import { Input } from '../atomics/Input';
import { ListContainer } from '../atomics/ListContainer';
import { ListItem } from '../atomics/ListItem';
import React from 'react';

export function TilesetTabs() {
    return (
        <React.Fragment>
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
        </React.Fragment>
    );
}
