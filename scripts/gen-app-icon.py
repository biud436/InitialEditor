#!/usr/bin/env python3
"""InitialEditor 앱 아이콘 원본(1024x1024 PNG)을 만든다.

어두운 둥근 사각형 위에 밝은 "IE" 글자. 이 PNG 를 `yarn tauri icon src-tauri/app-icon.png -o src-tauri/icons` 에
넣으면 icon.icns, icon.ico 와 각 크기의 PNG 가 나온다 (src-tauri/icons/). 디자인은 자리표시자다.

  python3 scripts/gen-app-icon.py            # src-tauri/app-icon.png 를 만든다
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SIZE = 1024
OUT = Path(__file__).resolve().parent.parent / "src-tauri" / "app-icon.png"


def find_font(size: int):
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/SFNSMono.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def main() -> None:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    margin = 64
    radius = 200
    draw.rounded_rectangle((margin, margin, SIZE - margin, SIZE - margin), radius=radius, fill=(30, 34, 44, 255))
    # 왼쪽 아래에 강조색 띠 하나 (엔진 색과 구분되는 청록)
    draw.rounded_rectangle((margin + 96, SIZE - margin - 176, SIZE - margin - 96, SIZE - margin - 128), radius=24, fill=(78, 201, 176, 255))
    font = find_font(520)
    text = "IE"
    box = draw.textbbox((0, 0), text, font=font)
    w, h = box[2] - box[0], box[3] - box[1]
    x = (SIZE - w) / 2 - box[0]
    y = (SIZE - h) / 2 - box[1] - 48
    draw.text((x, y), text, font=font, fill=(236, 239, 244, 255))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, "PNG")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
