// 메모리 모드(?backend=memory)의 샘플 프로젝트. 의존성 없이 화면을 띄우는 데모이며 Playwright 스모크의 상대다.

export const SAMPLE_ROOT = "memory://sample";

/** 16x16 파랑과 살구색 체커 PNG (RGBA) */
const CHECKER_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAALElEQVR4nGN4MMvmPzK2qr6KggnJMwwDA0jVgC4/HAwY+FgYeAMGPhYG3AAAod6fH2bZCn8AAAAASUVORK5CYII=";

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const SAMPLE_MAIN_LUA = `-- 샘플 프로젝트의 Lua 진입점. 씬 계약 네 함수 (init, update, render, destroy).
-- 엔진은 있는 것만 부른다. 프레임마다 update(elapsed) 와 render() 가 불린다.

local elapsedTotal = 0

function init()
  print("샘플 프로젝트 시작")
end

function update(elapsed)
  elapsedTotal = elapsedTotal + elapsed
  if Input.trigger("escape") then
    System.exit()
  end
end

function render()
  Graphics.drawText(24, 24, string.format("경과 %.1f 초", elapsedTotal / 1000))
end

function destroy()
end
`;

export const SAMPLE_MAIN_RB = `# 샘플 프로젝트의 Ruby 진입점. Lua 판과 같은 씬 계약이다.

def init
  puts "샘플 프로젝트 시작"
end

def update(elapsed)
  System.exit if Input.trigger?(:escape)
end

def render
  Graphics.draw_text(24, 24, "안녕")
end

def destroy
end
`;

export const SAMPLE_GAME_JSON = `{
  "name": "샘플 프로젝트",
  "windowWidth": 768,
  "windowHeight": 896,
  "renderScale": 1,
  "script": "lua",
  "startScene": "main"
}
`;

export const SAMPLE_MAP_JSON = `{
  "version": 2,
  "width": 4,
  "height": 4,
  "tileWidth": 16,
  "tileHeight": 16,
  "tilesets": [{ "image": "resources/images/checker.png", "firstgid": 1 }],
  "layers": [{ "name": "ground", "data": [1, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 1, 1, 1] }],
  "events": []
}
`;

export const SAMPLE_README = `# 샘플 프로젝트

메모리 모드의 예제다. 파일은 브라우저 메모리에만 있고 새로 고치면 처음으로 돌아간다.

- scripts/lua/main.lua: Lua 진입점
- scripts/ruby/main.rb: Ruby 진입점
- resources/images/checker.png: 이미지 미리보기용 체커
- resources/maps/sample.json: 맵 포맷 v2 예제
`;

/** MemoryBackend 생성자에 넘길 초기 파일 */
export function sampleProjectFiles(): Record<string, string | Uint8Array> {
  return {
    "game.json": SAMPLE_GAME_JSON,
    "scripts/lua/main.lua": SAMPLE_MAIN_LUA,
    "scripts/ruby/main.rb": SAMPLE_MAIN_RB,
    "resources/images/checker.png": base64ToBytes(CHECKER_PNG_BASE64),
    "resources/maps/sample.json": SAMPLE_MAP_JSON,
    "README.md": SAMPLE_README,
  };
}
