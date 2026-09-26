// 오브젝트 타입 아이콘 (계층 패널과 오브젝트 추가 대화상자). 타입 명세의 icon 이름으로 고르고, 모르면 상자.
// components/icons.tsx 처럼 인라인 SVG 이고 색은 currentColor 다.

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 14, children, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

/** 빈 노드: 십자 */
export function NodeTypeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 2.5v11" />
      <path d="M2.5 8h11" />
      <circle cx="8" cy="8" r="2" />
    </Svg>
  );
}

/** 스프라이트: 프레임이 든 그림 */
export function SpriteTypeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="1.5" y="3.5" width="13" height="9" />
      <path d="M6 3.5v9" />
      <path d="M10.5 3.5v9" />
      <path d="M2.5 11l2-2 1.5 1.5" />
    </Svg>
  );
}

/** 글자: T */
export function TextTypeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 3.5h10" />
      <path d="M8 3.5v9" />
      <path d="M6 12.5h4" />
    </Svg>
  );
}

/** 타일맵: 격자 */
export function TilemapTypeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2" y="2" width="12" height="12" />
      <path d="M6 2v12" />
      <path d="M10 2v12" />
      <path d="M2 6h12" />
      <path d="M2 10h12" />
    </Svg>
  );
}

export function BoxTypeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 5l5.5-2.5 5.5 2.5v6l-5.5 2.5-5.5-2.5z" />
      <path d="M2.5 5l5.5 2.5 5.5-2.5" />
      <path d="M8 7.5v6" />
    </Svg>
  );
}

const ICONS: Record<string, (props: IconProps) => JSX.Element> = {
  node: NodeTypeIcon,
  sprite: SpriteTypeIcon,
  text: TextTypeIcon,
  tilemap: TilemapTypeIcon,
  grid: TilemapTypeIcon,
  box: BoxTypeIcon,
};

/** 타입 명세의 icon 이름(없으면 타입 이름)으로 아이콘을 고른다 */
export function TypeIcon({ icon, size = 14 }: { icon: string | undefined; size?: number }) {
  const Component = (icon && ICONS[icon]) || BoxTypeIcon;
  return <Component size={size} />;
}
