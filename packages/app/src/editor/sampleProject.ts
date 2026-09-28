// 메모리 모드(?backend=memory)와 웹판 "샘플로 해 보기"의 샘플 프로젝트. 의존성 없이 화면을 띄우는 데모이며 Playwright 스모크의 상대다.
// 게임(main.lua, main.rb)은 초원 맵(meadow.json)을 그려서, 맵 뷰에서 칠하고 저장한 칸이 F5 로 돌린 게임에 나온다.

import { meadowMapJson, meadowTilesetPng } from "./maps/sampleMap";

export const SAMPLE_ROOT = "memory://sample";

/** 16x16 파랑과 살구색 체커 PNG (RGBA) */
const CHECKER_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAALElEQVR4nGN4MMvmPzK2qr6KggnJMwwDA0jVgC4/HAwY+FgYeAMGPhYG3AAAod6fH2bZCn8AAAAASUVORK5CYII=";

/** 32x16 두 프레임 동전 시트 PNG (RGBA): 0 은 둥근 동전, 1 은 옆으로 돈 동전. 씬 뷰가 첫 프레임만 자르는 것을 보인다 */
const COIN_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAQCAYAAAB3AH1ZAAAAXUlEQVR42mNgGIzgxDS5/9gwueaQpenXJRsUTKphyGYQrQ+bxdgcQo45BPURYzmxhuHSR3Kw43MALkfgMwenw0mxnJBhow4Yug4Y0EQ44NlwUBREg6IoHhSVEb0BAL/LsX95CSSqAAAAAElFTkSuQmCC";

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 샘플 게임이 그리는 맵 (맵 뷰에서 칠하는 예와 같은 파일) */
export const SAMPLE_MAP_PATH = "resources/maps/meadow.json";

export const SAMPLE_MAIN_LUA = `-- 샘플 프로젝트의 Lua 진입점. 씬 계약 네 함수 (init, update, render, destroy).
-- 엔진은 전역 Initialize, Update, Render, Destroy 를 부르고, 맨 아래에서 그것을 네 함수로 잇는다.
-- init 에서 초원 맵(resources/maps/meadow.json)을 읽고, render 가 모든 레이어를 화면 가운데에 그린다.
-- 맵 뷰에서 칠하고 저장하면 칠한 타일이 게임에 그대로 나온다.

local MAP_PATH = "./${SAMPLE_MAP_PATH}"
local map = nil
local layerCount = 0
local camX, camY = 0, 0
local elapsedTotal = 0
local printed = false

function init()
  print("샘플 프로젝트 시작")
  local err
  map, err = Tilemap.Load(MAP_PATH)
  if not map then
    print("sample:map error " .. tostring(err))
    return
  end
  local w, h, tileW, tileH, layers = Tilemap.GetSize(map)
  layerCount = layers
  -- 카메라가 음수면 맵이 오른쪽 아래로 간다. 맵을 화면 가운데에 둔다
  camX = -math.floor((WindowWidth() - w * tileW) / 2)
  camY = -math.floor((WindowHeight() - h * tileH) / 2)
end

function update(elapsed)
  elapsedTotal = elapsedTotal + elapsed
end

function render()
  if map then
    Tilemap.Draw(map, 1, layerCount, camX, camY)
  end
  if not printed then
    printed = true
    print("sample:frame")
    print("sample:map layers=" .. layerCount)
  end
end

function destroy()
  if map then
    Tilemap.Dispose(map)
    map = nil
  end
end

function Initialize() init() end
function Update(elapsed) update(elapsed) end
function Render() render() end
function Destroy() destroy() end
`; // terms-ok: 샘플 스크립트의 코드 주석은 문장형

export const SAMPLE_MAIN_RB = `# 샘플 프로젝트의 Ruby 진입점. Lua 판과 같은 씬 계약이고 같은 화면을 그린다.
# 엔진이 init 을 한 번, 프레임마다 update(elapsed) 와 render 를 부른다. init 에서 초원 맵을 읽고 render 가 가운데에 그린다.
# Ruby 의 레이어 번호는 0 부터다.

$map_path = "./${SAMPLE_MAP_PATH}"
$map = nil
$cam_x = 0
$cam_y = 0
$elapsed_total = 0
$printed = false

def init
  puts "샘플 프로젝트 시작"
  $map = Tilemap.load($map_path)
  unless $map
    puts "sample:map error " + $map_path
    return
  end
  # 카메라가 음수면 맵이 오른쪽 아래로 간다. 맵을 화면 가운데에 둔다
  $cam_x = -((Graphics.width - $map.width * $map.tile_width) / 2)
  $cam_y = -((Graphics.height - $map.height * $map.tile_height) / 2)
end

def update(elapsed)
  $elapsed_total += elapsed
end

def render
  $map.draw(0, $map.layer_count - 1, $cam_x, $cam_y) if $map
  unless $printed
    $printed = true
    puts "sample:frame"
    puts "sample:map layers=" + ($map ? $map.layer_count : 0).to_s
  end
end

def destroy
  $map.dispose if $map && !$map.disposed?
  $map = nil
end
`; // terms-ok: 샘플 스크립트의 코드 주석은 문장형

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
  "tilesets": [{ "image": "resources/images/checker.png", "firstGid": 1, "columns": 1 }],
  "layers": [{ "name": "ground", "data": [1, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 1, 1, 1] }],
  "events": [],
  "objects": [
    { "id": "start", "type": "start", "x": 8, "y": 48 },
    { "id": "slime_1", "type": "spawn", "x": 40, "y": 48, "props": { "species": "slime", "minX": 24, "maxX": 56 } },
    { "id": "sign_1", "type": "landmark", "x": 16, "y": 0, "width": 16, "props": { "title": "표지판", "text": "첫 줄\\n둘째 줄" } }
  ]
}
`;

/**
 * 맵 오브젝트 스키마 예제 (resources/schema/map-objects.json). 몬스터(종, 순찰 범위, 보스, 레벨), 하나뿐인 시작 지점,
 * 띠 모양의 흔적(제목과 여러 줄 글). play.env는 여기서 실행의 환경 변수다.
 */
export const SAMPLE_MAP_SCHEMA_JSON = `{
  "version": 1,
  "types": [
    {
      "type": "spawn",
      "label": "몬스터",
      "shape": "point",
      "color": "danger",
      "fields": [
        { "name": "species", "type": "enum", "values": ["slime", "bat"], "default": "slime", "label": "종" },
        { "name": "minX", "type": "number", "role": "rangeMin", "label": "순찰 왼끝" },
        { "name": "maxX", "type": "number", "role": "rangeMax", "label": "순찰 오른끝" },
        { "name": "boss", "type": "boolean", "label": "보스" },
        { "name": "level", "type": "integer", "min": 1, "label": "레벨" }
      ]
    },
    { "type": "start", "label": "시작 지점", "shape": "point", "color": "success", "unique": true },
    {
      "type": "landmark",
      "label": "흔적",
      "shape": "band",
      "color": "warning",
      "defaultWidth": 32,
      "fields": [
        { "name": "title", "type": "string", "label": "제목" },
        { "name": "text", "type": "text", "label": "본문" }
      ]
    }
  ],
  "play": { "env": { "INITIAL2D_SCENE": "main", "INITIAL2D_SAMPLE_MAP": "{map.name}", "INITIAL2D_SAMPLE_AT": "{x},{y}" } }
}
`;

/**
 * 씬 포맷 v1 예제 (docs/plans/e2-scene.md). 스프라이트 둘(체커 4배, 두 프레임 동전 시트), 줄바꿈과 한글이 든 글자 하나,
 * 컴포넌트 자리인 노드 하나. 모르는 키 editorOnly 는 보존되는지 보는 용도다.
 */
export const SAMPLE_SCENE_JSON = `{
  "version": 1,
  "name": "main",
  "objects": [
    {
      "id": "bg",
      "type": "sprite",
      "x": 32,
      "y": 32,
      "props": { "image": "resources/images/checker.png", "width": 0, "height": 0, "frames": 1, "frameDelay": 100, "scale": 4, "angle": 0, "opacity": 255, "loop": true, "startFrame": 0, "endFrame": 0 },
      "scripts": []
    },
    {
      "id": "coin",
      "type": "sprite",
      "x": 160,
      "y": 48,
      "props": { "image": "resources/images/coin.png", "width": 0, "height": 0, "frames": 2, "frameDelay": 200, "scale": 3, "angle": 0, "opacity": 255, "loop": true, "startFrame": 0, "endFrame": 1 },
      "scripts": []
    },
    {
      "id": "title",
      "type": "text",
      "x": 32,
      "y": 160,
      "props": { "text": "샘플 씬\\n둘째 줄", "font": "resources/fonts/hangul.fnt" },
      "scripts": []
    },
    {
      "id": "spawner",
      "type": "node",
      "x": 384,
      "y": 448,
      "props": { "interval": 1500 },
      "scripts": [],
      "editorOnly": { "note": "컴포넌트 스크립트 추가용 빈 노드" }
    }
  ]
}
`;

export const SAMPLE_README = `# 샘플 프로젝트

메모리 모드의 예제. 파일은 브라우저 메모리에만 있고 새로 고침 시 초기 상태로 복원

- scripts/lua/main.lua: Lua 진입점. 초원 맵을 화면 가운데에 렌더링
- scripts/ruby/main.rb: Ruby 진입점. 초원 맵을 화면 가운데에 렌더링
- resources/images/checker.png: 이미지 미리보기용 체커
- resources/images/coin.png: 두 프레임 동전 시트 (씬 뷰의 프레임 자르기 예)
- resources/maps/sample.json: 맵 포맷 v2 예제
- resources/maps/meadow.json: 20x12 초원 맵. 게임이 렌더링하는 맵이라 맵 뷰에서 칠하고 저장한 뒤 F5 로 실행하면 칠한 타일이 게임에 표시 (타일셋은 resources/tiles/meadow16.png)
- resources/schema/map-objects.json: 맵 오브젝트 스키마 예제 (오브젝트 목록과 인스펙터 폼)
- resources/scenes/main.json: 씬 포맷 v1 예제 (씬 뷰에서 열기)
`;

/** MemoryBackend 생성자에 넘길 초기 파일 */
export function sampleProjectFiles(): Record<string, string | Uint8Array> {
  return {
    "game.json": SAMPLE_GAME_JSON,
    "scripts/lua/main.lua": SAMPLE_MAIN_LUA,
    "scripts/ruby/main.rb": SAMPLE_MAIN_RB,
    "resources/images/checker.png": base64ToBytes(CHECKER_PNG_BASE64),
    "resources/images/coin.png": base64ToBytes(COIN_PNG_BASE64),
    "resources/maps/sample.json": SAMPLE_MAP_JSON,
    [SAMPLE_MAP_PATH]: meadowMapJson(),
    "resources/tiles/meadow16.png": meadowTilesetPng(),
    "resources/schema/map-objects.json": SAMPLE_MAP_SCHEMA_JSON,
    "resources/scenes/main.json": SAMPLE_SCENE_JSON,
    "README.md": SAMPLE_README,
  };
}
