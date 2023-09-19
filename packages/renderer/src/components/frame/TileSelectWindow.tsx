import { Box } from '../atomics/Box';
import { TilesetMarker } from './TilesetMarker';
import { Layers } from './Layers';
import { TilesetTabs } from './TilesetTabs';

export function TileSelectWindow() {
    return (
        <Box id="aside">
            <Box className="aside__tabs">
                <Box id="view" onDragStart={() => false}></Box>
                <TilesetMarker />
                <TilesetTabs />
                <Layers />
            </Box>
        </Box>
    );
}
