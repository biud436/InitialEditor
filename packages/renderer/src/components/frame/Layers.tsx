import { IconItem } from '../atomics/IconItem';
import { ListContainer } from '../atomics/ListContainer';
import { ListItem } from '../atomics/ListItem';
import { Box } from '../atomics/Box';

const layerMap = [
    ['layer1', '레이어 1'],
    ['layer2', '레이어 2'],
    ['layer3', '레이어 3'],
    ['layer4', '레이어 4'],
];

export function Layers() {
    return (
        <Box className="aside__tabs__maptree">
            <ListContainer>
                <ListItem>
                    <IconItem className="fas fa-folder" />
                    레이어 그룹
                    <ListContainer className="aside__tabs__maptree-child-tree">
                        {layerMap.map(([action, name]) => (
                            <ListItem
                                data-action={action}
                                key={'x1e4_tileset_window_map_tree_' + action}
                            >
                                <IconItem className="far fa-eye" />
                                {name}
                            </ListItem>
                        ))}
                    </ListContainer>
                </ListItem>
            </ListContainer>
        </Box>
    );
}
