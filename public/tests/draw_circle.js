/**
 * @author biud436
 */

const canvas = document.querySelector("#game-canvas");
const ctx = canvas.getContext("2d");

let acc = 0.0;
let r = (Math.PI / 180.0) * acc;

function loop(dt) {
  acc += 1.0;
  r = (Math.PI / 180.0) * acc;

  ctx.setTransform(1, 0, 0, 1.0, window.innerWidth / 2 - 50 / 2, window.innerHeight / 2 - 50 / 2);

  ctx.fillStyle = "rgba(0, 200, 200, 0.5)";
  for (let y = 0; y < 24; y+=1) {
    for (let x = 0; x < 50; x+=1) {
      ctx.fillStyle = `rgba(${r << 4}, 0, 0, 0.5)`;
      const tx = (Math.cos(r) * x) - (Math.sin(r) * y);
      const ty = (Math.sin(r) * x) + (Math.cos(r) * y);
      ctx.fillRect(tx, ty, 4, 4);
    }
  }

  window.requestAnimationFrame(loop);
}

loop();

// https://jsfiddle.net/7bo5evwh/1/