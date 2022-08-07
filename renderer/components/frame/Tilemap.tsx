import { Canvas } from "../atomics/Canvas";
import { Division } from "../atomics/Wrapper";

export function Tilemap() {
    return (
        <Division className="contents">
            <Canvas id="contents__main-canvas">
                캔버스를 지원하지 않는 기기입니다.
            </Canvas>
        </Division>
    );
}
