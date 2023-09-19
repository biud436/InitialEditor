import { Canvas } from '../atomics/Canvas';
import { Box } from '../atomics/Box';

export function Tilemap() {
    return (
        <Box className="contents">
            <Canvas id="contents__main-canvas">
                Your browser can not support canvas tag.
            </Canvas>
        </Box>
    );
}
