// UI 견본 (?ui=gallery, docs/plans/quality.md 6.4절). 부품을 실제 에디터와 같은 배치로 보여 주어 크기, 간격, 글꼴, 문구를
// 한 화면에서 판단하게 한다. 에디터를 띄우지 않으므로 문서와 되돌리기는 없고 값은 이 화면 안에서만 바뀐다.

import { useEffect, useState } from "react";
import {
  Box,
  Circle,
  Copy,
  Eraser,
  Eye,
  EyeOff,
  FilePlus2,
  FolderOpen,
  Grid3x3,
  Hand,
  Image as ImageIcon,
  Lock,
  LockOpen,
  Magnet,
  MousePointer2,
  PaintBucket,
  Pencil,
  Pipette,
  Play,
  Plus,
  RotateCcw,
  Search,
  Square,
  SquareDashed,
  Trash2,
  Type,
  type LucideIcon,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  IconButton,
  Kbd,
  ListRow,
  NumberInput,
  PanelHeader,
  PropertyRow,
  Section,
  SegmentedControl,
  Select,
  Switch,
  Tabs,
  TextInput,
  Toolbar,
  ToolbarSeparator,
  ToolbarSpacer,
  Vector2Input,
} from "@initial-editor/ui";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./Gallery.css";

type Theme = "dark" | "light";
type Font = "pretendard" | "system";

const PRETENDARD = `"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;

interface SceneObject {
  id: string;
  icon: LucideIcon;
  depth: number;
  parent?: boolean;
  hidden?: boolean;
  locked?: boolean;
}

const OBJECTS: SceneObject[] = [
  { id: "bg1", icon: ImageIcon, depth: 0, locked: true },
  { id: "bg2", icon: ImageIcon, depth: 0, locked: true },
  { id: "ground", icon: ImageIcon, depth: 0 },
  { id: "bird", icon: ImageIcon, depth: 0 },
  { id: "pipes", icon: Box, depth: 0, parent: true },
  { id: "pipe_top", icon: ImageIcon, depth: 1 },
  { id: "pipe_bottom", icon: ImageIcon, depth: 1 },
  { id: "score", icon: Type, depth: 0 },
  { id: "title", icon: Type, depth: 0 },
  { id: "game_over", icon: Type, depth: 0, hidden: true },
];

export function Gallery() {
  const [theme, setTheme] = useState<Theme>(() => (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));
  const [font, setFont] = useState<Font>("pretendard");
  const [selected, setSelected] = useState("bird");
  const [open, setOpen] = useState(true);
  const [hidden, setHidden] = useState<Record<string, boolean>>({ game_over: true });
  const [tool, setTool] = useState("pen");
  const [grid, setGrid] = useState(true);
  const [snap, setSnap] = useState(false);
  const [zoom, setZoom] = useState("100");
  const [pos, setPos] = useState({ x: 170, y: 416 });
  const [scale, setScale] = useState(1);
  const [angle, setAngle] = useState(0);
  const [opacity, setOpacity] = useState(100);
  const [clip, setClip] = useState("fly");
  const [frameMs, setFrameMs] = useState(110);
  const [loop, setLoop] = useState(true);
  const [visible, setVisible] = useState(true);
  const [gravity, setGravity] = useState(1400);
  const [name, setName] = useState("새 게임");
  const [tab, setTab] = useState("objects");
  const [reload, setReload] = useState(true);
  const [mixed, setMixed] = useState<boolean | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement.style;
    if (font === "pretendard") root.setProperty("--font-ui", PRETENDARD);
    else root.removeProperty("--font-ui");
  }, [font]);

  const visibleRows = OBJECTS.filter((o) => o.depth === 0 || open);

  return (
    <div className="gallery">
      <header className="gallery-bar">
        <span className="gallery-title">UI 견본</span>
        <span className="gallery-sub">크기, 간격, 폰트, 문구를 이 화면에서 정합니다</span>
        <ToolbarSpacer />
        <SegmentedControl
          ariaLabel="폰트"
          value={font}
          onChange={setFont}
          options={[
            { value: "pretendard", label: "Pretendard" },
            { value: "system", label: "시스템 폰트" },
          ]}
        />
        <SegmentedControl
          ariaLabel="테마"
          value={theme}
          onChange={setTheme}
          options={[
            { value: "dark", label: "다크" },
            { value: "light", label: "라이트" },
          ]}
        />
      </header>

      <div className="gallery-body">
        {/* 계층 */}
        <aside className="gallery-panel gallery-left">
          <PanelHeader title="계층" meta="flappy">
            <IconButton icon={Search} label="찾기" size="sm" />
            <IconButton icon={Plus} label="오브젝트 추가" shortcut="⇧⌘A" size="sm" />
          </PanelHeader>
          <div role="tree" aria-label="오브젝트" className="gallery-tree">
            {visibleRows.map((o) => {
              const isHidden = hidden[o.id] === true;
              return (
                <ListRow
                  key={o.id}
                  label={o.id}
                  icon={o.icon}
                  depth={o.depth}
                  expanded={o.parent ? open : undefined}
                  onToggle={() => setOpen(!open)}
                  selected={selected === o.id}
                  dimmed={isHidden}
                  onClick={() => setSelected(o.id)}
                  status={
                    isHidden ? <EyeOff size={14} strokeWidth={1.75} aria-label="에디터에서 숨김" /> : o.locked ? <Lock size={14} strokeWidth={1.75} aria-label="잠김" /> : undefined
                  }
                  actions={
                    <>
                      <IconButton icon={o.locked ? Lock : LockOpen} label={o.locked ? "잠금 풀기" : "잠그기"} size="sm" />
                      <IconButton
                        icon={isHidden ? EyeOff : Eye}
                        label={isHidden ? "에디터에서 보이기" : "에디터에서 숨기기"}
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setHidden({ ...hidden, [o.id]: !isHidden });
                        }}
                      />
                    </>
                  }
                />
              );
            })}
          </div>
          <PanelHeader title="레이어" meta="항구 마을">
            <IconButton icon={Plus} label="레이어 추가" size="sm" />
          </PanelHeader>
          <div role="tree" aria-label="레이어">
            <ListRow label="위 장식" icon={SquareDashed} actions={<IconButton icon={Eye} label="숨기기" size="sm" />} />
            <ListRow label="장식" icon={SquareDashed} selected actions={<IconButton icon={Eye} label="숨기기" size="sm" />} />
            <ListRow label="바닥" icon={SquareDashed} actions={<IconButton icon={Eye} label="숨기기" size="sm" />} />
            <ListRow label="통행" icon={Grid3x3} dimmed status={<EyeOff size={14} strokeWidth={1.75} aria-label="숨김" />} actions={<IconButton icon={EyeOff} label="보이기" size="sm" />} />
          </div>
        </aside>

        {/* 가운데 */}
        <main className="gallery-center">
          <Toolbar ariaLabel="맵 도구">
            <SegmentedControl
              ariaLabel="도구"
              value={tool}
              onChange={setTool}
              options={[
                { value: "select", icon: MousePointer2, title: "선택", shortcut: "V" },
                { value: "hand", icon: Hand, title: "화면 이동", shortcut: "H" },
                { value: "pen", icon: Pencil, title: "펜", shortcut: "B" },
                { value: "rect", icon: Square, title: "사각형", shortcut: "R" },
                { value: "ellipse", icon: Circle, title: "원", shortcut: "O" },
                { value: "fill", icon: PaintBucket, title: "채우기", shortcut: "G" },
                { value: "eraser", icon: Eraser, title: "지우개", shortcut: "E" },
                { value: "picker", icon: Pipette, title: "스포이드", shortcut: "I" },
              ]}
            />
            <ToolbarSeparator />
            <IconButton icon={Grid3x3} label="격자" pressed={grid} onClick={() => setGrid(!grid)} />
            <IconButton icon={Magnet} label="격자에 맞추기" pressed={snap} onClick={() => setSnap(!snap)} />
            <ToolbarSpacer />
            <div className="gallery-zoom">
              <Select
                size="sm"
                ariaLabel="배율"
                value={zoom}
                onChange={setZoom}
                options={[
                  { value: "25", label: "25%" },
                  { value: "50", label: "50%" },
                  { value: "100", label: "100%" },
                  { value: "200", label: "200%" },
                  { value: "fit", label: "화면에 맞추기" },
                ]}
              />
            </div>
            <ToolbarSeparator />
            <Button variant="primary" icon={Play} shortcut="F5">
              플레이 테스트
            </Button>
          </Toolbar>

          <div className="gallery-scroll">
            <div className="gallery-grid">
              <Card className="gallery-card">
                <h3>단추</h3>
                <div className="gallery-line">
                  <Button variant="primary">게임 만들기</Button>
                  <Button>취소</Button>
                  <Button variant="ghost">나중에</Button>
                  <Button variant="danger" icon={Trash2}>
                    삭제
                  </Button>
                </div>
                <div className="gallery-line">
                  <Button size="sm" icon={Plus}>
                    추가
                  </Button>
                  <Button size="sm" icon={Copy}>
                    복제
                  </Button>
                  <Button size="sm" disabled>
                    사용할 수 없음
                  </Button>
                  <Button size="lg" variant="primary" icon={FilePlus2}>
                    새 게임
                  </Button>
                </div>
                <div className="gallery-line">
                  <IconButton icon={RotateCcw} label="되돌리기" shortcut="⌘Z" variant="default" />
                  <IconButton icon={Copy} label="복사" shortcut="⌘C" variant="default" />
                  <IconButton icon={Trash2} label="삭제" shortcut="Delete" variant="default" />
                  <IconButton icon={FolderOpen} label="게임 폴더 열기" />
                  <IconButton icon={Grid3x3} label="격자" pressed />
                </div>
              </Card>

              <Card className="gallery-card">
                <h3>입력</h3>
                <PropertyRow label="게임 이름">
                  <TextInput value={name} sessionPrefix="g.name" onChange={setName} ariaLabel="게임 이름" />
                </PropertyRow>
                <PropertyRow label="중력">
                  <NumberInput value={gravity} unit="px/s²" step={10} sessionPrefix="g.gravity" onChange={setGravity} ariaLabel="중력" />
                </PropertyRow>
                <PropertyRow label="여러 오브젝트">
                  <NumberInput value={null} unit="px" sessionPrefix="g.mixed" onChange={() => undefined} ariaLabel="여러 오브젝트의 값" />
                </PropertyRow>
                <PropertyRow label="이름이 아주 긴 속성은 두 줄로 감쌉니다">
                  <TextInput value="" placeholder="비어 있음" sessionPrefix="g.long" onChange={() => undefined} ariaLabel="긴 이름의 속성" />
                </PropertyRow>
                <PropertyRow label="잘못된 값">
                  <TextInput value="abc" invalid sessionPrefix="g.bad" onChange={() => undefined} ariaLabel="잘못된 값" />
                </PropertyRow>
                <div className="gallery-line">
                  <Checkbox checked={reload} onChange={setReload} label="저장하면 게임에 바로 반영" />
                  <Checkbox checked={mixed} onChange={(v) => setMixed(v)} label="여러 값" />
                </div>
                <div className="gallery-line">
                  <Switch checked={loop} onChange={setLoop} label="반복" />
                  <Switch checked={false} onChange={() => undefined} label="사용할 수 없음" disabled />
                </div>
              </Card>

              <Card className="gallery-card">
                <h3>빈 상태</h3>
                <EmptyState icon={Box} title="씬이 비어 있습니다" description="이미지를 이 화면으로 드래그하면 스프라이트가 됩니다." action={<Button icon={Plus}>오브젝트 추가</Button>} />
              </Card>

              <Card className="gallery-card">
                <h3>탭, 배지, 단축키</h3>
                <Tabs
                  ariaLabel="견본 탭"
                  value={tab}
                  onChange={setTab}
                  items={[
                    { value: "objects", label: "오브젝트", count: 10 },
                    { value: "layers", label: "레이어", count: 4 },
                    { value: "events", label: "이벤트", count: 17 },
                  ]}
                />
                <div className="gallery-line gallery-pad">
                  <Badge>스프라이트</Badge>
                  <Badge tone="accent">시작 씬</Badge>
                  <Badge tone="warning">저장 안 됨</Badge>
                  <Badge tone="danger">오류 2</Badge>
                  <Badge tone="success">실행 중</Badge>
                </div>
                <div className="gallery-line gallery-pad">
                  <span className="gallery-text">저장</span>
                  <Kbd>⌘S</Kbd>
                  <span className="gallery-text">플레이 테스트</span>
                  <Kbd>F5</Kbd>
                </div>
              </Card>

              <Card className="gallery-card gallery-wide">
                <h3>텍스트</h3>
                <div className="gallery-type">
                  <div className="t-xl">작은 새가 하늘을 납니다</div>
                  <div className="t-lg">작은 새가 하늘을 납니다 (제목 15px)</div>
                  <div className="t-md">작은 새가 하늘을 납니다. 기본 13px, 메뉴와 목록과 입력 필드가 이 크기입니다.</div>
                  <div className="t-sm">작은 새가 하늘을 납니다. 보조 12px, 속성 이름과 흐린 정보.</div>
                  <div className="t-xs">작은 새가 하늘을 납니다. 작게 11px, 배지와 단축키.</div>
                </div>
              </Card>
            </div>
          </div>
        </main>

        {/* 인스펙터 */}
        <aside className="gallery-panel gallery-right">
          <PanelHeader title="인스펙터" />
          <div className="gallery-inspector-head">
            <ImageIcon size={16} strokeWidth={1.75} aria-hidden />
            <TextInput value={selected} sessionPrefix="g.id" onChange={(v) => setSelected(v)} ariaLabel="이름" />
            <IconButton icon={visible ? Eye : EyeOff} label={visible ? "게임에서 숨기기" : "게임에서 보이기"} onClick={() => setVisible(!visible)} />
          </div>
          <div className="gallery-scroll">
            <Section title="변환">
              <PropertyRow label="위치">
                <Vector2Input x={pos.x} y={pos.y} sessionPrefix="g.pos" ariaLabel="위치" onChange={(a, v) => setPos({ ...pos, [a]: v })} />
              </PropertyRow>
              <PropertyRow label="배율">
                <NumberInput value={scale} step={0.1} sessionPrefix="g.scale" onChange={setScale} ariaLabel="배율" />
              </PropertyRow>
              <PropertyRow label="회전">
                <NumberInput value={angle} sessionPrefix="g.angle" onChange={setAngle} ariaLabel="회전" unit="°" />
              </PropertyRow>
              <PropertyRow label="불투명도">
                <NumberInput value={opacity} min={0} max={100} integer sessionPrefix="g.opacity" onChange={setOpacity} ariaLabel="불투명도" unit="%" />
              </PropertyRow>
            </Section>
            <Section title="스프라이트">
              <PropertyRow label="이미지">
                <Select
                  ariaLabel="이미지"
                  value="bird"
                  onChange={() => undefined}
                  options={[
                    { value: "bird", label: "bird.png", description: "276 x 64, 3프레임", icon: ImageIcon },
                    { value: "pipe", label: "pipe.png", description: "52 x 271", icon: ImageIcon },
                    { value: "ground", label: "ground.png", description: "768 x 64", icon: ImageIcon },
                  ]}
                />
              </PropertyRow>
              <PropertyRow label="애니메이션">
                <Select
                  ariaLabel="애니메이션"
                  value={clip}
                  onChange={setClip}
                  options={[
                    { value: "fly", label: "날갯짓" },
                    { value: "fall", label: "떨어지기" },
                    { value: "dead", label: "부딪힘" },
                  ]}
                />
              </PropertyRow>
              <PropertyRow label="프레임 시간">
                <NumberInput value={frameMs} min={1} integer sessionPrefix="g.frame" onChange={setFrameMs} ariaLabel="프레임 시간" unit="ms" />
              </PropertyRow>
              <PropertyRow label="반복">
                <Switch checked={loop} onChange={setLoop} ariaLabel="반복" />
              </PropertyRow>
            </Section>
            <Section title="스크립트" actions={<IconButton icon={Plus} label="스크립트 추가" size="sm" />}>
              <Card className="gallery-script">
                <div className="gallery-script-head">
                  <span className="gallery-script-name">bird</span>
                  <span className="gallery-script-path">components/flappy/bird.lua</span>
                </div>
                <PropertyRow label="점프 힘">
                  <NumberInput value={480} unit="px/s" sessionPrefix="g.jump" onChange={() => undefined} ariaLabel="점프 힘" />
                </PropertyRow>
                <PropertyRow label="효과음">
                  <Select ariaLabel="효과음" value="flap" onChange={() => undefined} options={[{ value: "flap", label: "flap.wav" }, { value: "none", label: "없음" }]} />
                </PropertyRow>
              </Card>
            </Section>
          </div>
        </aside>
      </div>
    </div>
  );
}
