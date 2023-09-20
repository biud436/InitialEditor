import { Box } from '../atomics/Box';
import { Layers } from './Layers';
import { TilesetTabs } from './TilesetTabs';

export function TileSelectWindow() {
    return (
        <Box id="aside">
            <Box className="aside__tabs">
                <Box id="view" onDragStart={() => false}></Box>
                <TilesetTabs />
                <Layers />
            </Box>
        </Box>
    );
}
