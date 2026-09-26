// 작은 인라인 SVG 아이콘. 아이콘 폰트는 쓰지 않는다. 색은 currentColor 라 토큰을 따라간다.

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 14, children, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M1.5 3.5h4l1.5 1.5h7.5v8h-13z" />
    </Svg>
  );
}

export function FolderOpenIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M1.5 3.5h4l1.5 1.5h7.5v2h-13z" />
      <path d="M1.5 7h13l-1.5 6h-11.5z" />
    </Svg>
  );
}

export function FileIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 1.5h6l3 3v10h-9z" />
      <path d="M9.5 1.5v3h3" />
    </Svg>
  );
}

export function CodeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5.5 4.5l-3.5 3.5 3.5 3.5" />
      <path d="M10.5 4.5l3.5 3.5-3.5 3.5" />
    </Svg>
  );
}

export function ImageIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="1.5" y="2.5" width="13" height="11" />
      <circle cx="5.5" cy="6" r="1.2" />
      <path d="M2 12.5l4-4 3 3 2-2 3.5 3.5" />
    </Svg>
  );
}

export function JsonIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5.5 2.5c-1.5 0-2 .7-2 2v2c0 1-.5 1.5-1.5 1.5 1 0 1.5.5 1.5 1.5v2c0 1.3.5 2 2 2" />
      <path d="M10.5 2.5c1.5 0 2 .7 2 2v2c0 1 .5 1.5 1.5 1.5-1 0-1.5.5-1.5 1.5v2c0 1.3-.5 2-2 2" />
    </Svg>
  );
}

export function TextIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 3.5h11" />
      <path d="M2.5 6.5h11" />
      <path d="M2.5 9.5h8" />
      <path d="M2.5 12.5h5" />
    </Svg>
  );
}

export function ChevronIcon({ open, ...props }: IconProps & { open?: boolean }) {
  return (
    <Svg {...props} style={{ transform: open ? "rotate(90deg)" : undefined, transition: "transform 0.1s" }}>
      <path d="M6 3.5l4.5 4.5-4.5 4.5" />
    </Svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 2.5l9 5.5-9 5.5z" fill="currentColor" />
    </Svg>
  );
}

export function StopIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="3.5" width="9" height="9" fill="currentColor" />
    </Svg>
  );
}

export function ReloadIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13 8a5 5 0 1 1-1.5-3.6" />
      <path d="M13 2.5v3h-3" />
    </Svg>
  );
}

export function RefreshIcon(props: IconProps) {
  return <ReloadIcon {...props} />;
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 4l8 8" />
      <path d="M12 4l-8 8" />
    </Svg>
  );
}

const CODE_EXT = new Set(["lua", "rb"]);
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "bmp"]);
const TEXT_EXT = new Set(["md", "txt", "csv", "fnt"]);

/** 확장자와 종류에 맞는 아이콘 */
export function EntryIcon({ kind, ext, open, size = 14 }: { kind: "file" | "dir"; ext: string; open?: boolean; size?: number }) {
  if (kind === "dir") return open ? <FolderOpenIcon size={size} /> : <FolderIcon size={size} />;
  if (CODE_EXT.has(ext)) return <CodeIcon size={size} />;
  if (IMAGE_EXT.has(ext)) return <ImageIcon size={size} />;
  if (ext === "json") return <JsonIcon size={size} />;
  if (TEXT_EXT.has(ext)) return <TextIcon size={size} />;
  return <FileIcon size={size} />;
}
