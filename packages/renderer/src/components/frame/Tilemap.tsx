import { Canvas } from "../atomics/Canvas";
import { Division } from "../atomics/Wrapper";

export function Tilemap() {
  return (
    <Division className="contents">
      <Canvas id="contents__main-canvas">
        Your browser can not support canvas tag.
      </Canvas>
    </Division>
  );
}
