// 타일맵 확장이 다른 확장에게 여는 자리 (docs/plans/e5-rpg.md 2.2). tilemapExtension.activate 가 돌려주는 TilemapApi 다.
// 받는 쪽은 dependsOn 에 "tilemap" 을 적고 api.exportsOf<TilemapApi>("tilemap") 으로 받는다.
// register* 가 돌려준 함수는 api.onDeactivate 에 넘긴다 (그 확장을 끄면 레이어와 제공자가 빠진다).
//
//   맵 레이어     맵 파일의 최상위 키(섹션) 하나를 맡는다. 열린 맵 문서마다, 그리고 새로 열리는 맵 문서에 attach 한다.
//                 스키마가 늦게 오거나 바뀌면 refreshLayer 로 다시 붙이거나(상태가 없던 문서) refresh() 한다(있던 문서).
//                 이미 붙은 상태는 떼지 않는다. 등록을 거두면 문서마다 상태의 값을 원본에 남기고 뗀다
//   실행 제공자   "여기서 실행"을 priority 높은 것부터 묻고 첫 applies 의 plan 으로 띄운다 (앱의 objectTools/playHere.ts)
//   실행 길       확장이 제 명령(예: 체크포인트 앞에서 실행)으로 맵을 띄울 때 play(doc, request) 를 부른다. 앱이 setPlayer 로
//                 여기서 실행과 같은 길(러너 확인, 저장할지 묻기, 콘솔 한 줄, 러너 시작)을 넣는다. 계획의 watch 가 있으면 러너가
//                 게임이 찍는 줄을 넘겨 끝났는지, 멈춰야 하는지 묻는다 (자동 재생이 끝나지 않는 실행을 멈춘다)
//   맵 뷰         확장의 폼이 맵 위의 좌표를 받는다. pickCell 은 맵 파일을 탭으로 열고 그 뷰에서 타일 하나를 고르게 하고,
//                 revealCell 은 맵 파일을 열고 타일을 뷰 가운데에 둔다. 앱이 setMapViews 로 맵 탭과 뷰를 다루는 길을 넣는다
//
// 뷰와 도구와 인스펙터는 앱이 붙인다. 여기 타입은 DOM 과 PIXI 를 모른다: PIXI 물체와 React 컴포넌트는 unknown 이고 앱이 좁혀 쓴다.

import type { Document, DocumentRegistry } from "@initial-editor/core";
import { action, observable } from "mobx";
import { sectionKeyProblem, type MapLayerBinding, type MapLayerState } from "./model/layers";
import { MapDocument } from "./model/mapDocument";

export interface Point {
  x: number;
  y: number;
}

/** 레이어 뷰가 받는 것. 앱의 MapRenderer 가 만든다 */
export interface MapLayerViewContext {
  readonly document: MapDocument;
  /** 이 레이어의 PIXI Container (월드 좌표). 줌과 팬, 보이기(눈)와 흐리기(대상이 다른 레이어)는 앱이 맡는다 */
  readonly container: unknown;
  /** 지금 줌. 선 굵기와 글자 배율을 줌의 역수로 맞출 때 쓴다 */
  zoom(): number;
  /** 테마 색: 토큰 이름("accent", "danger", "fg-muted" 등) → 0xRRGGBB */
  color(token: string): number;
  /** 테마 글꼴: 토큰 이름("font-ui") → CSS 글꼴 */
  font(token: string): string;
  /** 프로젝트 이미지를 PIXI 텍스처로 읽는다 (앱의 캐시). texture 는 PIXI Texture */
  loadTexture(path: string): Promise<{ texture: unknown; width: number; height: number }>;
}

export interface MapLayerView {
  /** 줌이나 테마가 바뀌었다 */
  redraw?(): void;
  dispose(): void;
}

export interface MapLayerPointer {
  /** 월드 픽셀 */
  world: Point;
  /** 칸 */
  cell: Point;
  /** 0 왼쪽, 2 오른쪽 */
  button: number;
  shift: boolean;
  alt: boolean;
  /** Ctrl 이나 Cmd */
  mod: boolean;
}

export interface MapLayerKey {
  key: string;
  shift: boolean;
  alt: boolean;
  /** Ctrl 이나 Cmd */
  mod: boolean;
}

/** 레이어 도구가 받는 것. 앱의 MapRenderer 가 만든다 */
export interface MapLayerToolContext {
  readonly document: MapDocument;
  zoom(): number;
  /** 커서 모양이나 미리보기가 바뀌었다 */
  changed(): void;
  /** 사용자에게 짧게 알린다 (잠긴 레이어의 편집 거절 등) */
  notice(message: string): void;
}

/** 대상이 이 레이어일 때 맵 뷰의 포인터와 키를 받는다 */
export interface MapLayerTool {
  pointerDown?(p: MapLayerPointer): void;
  pointerMove?(p: MapLayerPointer): void;
  pointerUp?(p: MapLayerPointer): void;
  doubleClick?(p: MapLayerPointer): void;
  pointerLeave?(): void;
  /** 처리했으면 true. Ctrl 조합(복사, 붙여넣기, 복제)도 앱의 단축키보다 먼저 받고, 처리하면 앱이 전파를 막는다 */
  keyDown?(k: MapLayerKey): boolean;
  /** CSS 커서. 없으면 default */
  cursor?(): string;
  /** 오른쪽 버튼을 도구가 쓰는가. 아니면 팬이다 */
  wantsRightButton?(): boolean;
  /** 끄는 중인가 (포인터가 뷰를 떠나도 이어진다) */
  busy?(): boolean;
  dispose?(): void;
}

/** 인스펙터 자리의 컴포넌트가 받는 props */
export interface MapLayerInspectorProps {
  document: MapDocument;
  state: MapLayerState;
}

export interface MapLayerSpec extends MapLayerBinding {
  /** 예: "rpg.events" */
  readonly id: string;
  /** 레이어 패널의 이름 */
  readonly label: string;
  /** 이 레이어가 읽고 쓰는 맵 파일의 최상위 키 (예: "events") */
  readonly section: string;
  /** 그리는 순서와 레이어 패널의 순서 (클수록 위). 모두 오브젝트 위다. 기본 0 */
  readonly order?: number;
  /** 대상을 이 레이어로 고르는 한 글자 단축키 (예: "N") */
  readonly toolKey?: string;
  /** 문서가 열릴 때와 refreshLayer 때 (상태가 아직 없는 문서만). 이 맵에 붙지 않으면 null */
  attach(doc: MapDocument): MapLayerState | null;
  /** attach 가 null 일 때 레이어 패널 아래에 옅게 보일 한 줄. undefined 면 아무것도 안 보인다 */
  hint?(doc: MapDocument): string | undefined;
  /**
   * 이 프로젝트에 이 레이어가 있을 수 있는가 (예: 레이어의 스키마 파일이 있다). 거짓이면 앱이 레이어의 도구 커맨드와 메뉴를 숨긴다.
   * 생략하면 늘 참이다. 관찰 가능해야 메뉴가 따라온다
   */
  visible?(): boolean;
  /** PIXI 뷰. 앱의 MapRenderer 가 오브젝트 위에 붙인다 */
  createView?(ctx: MapLayerViewContext): MapLayerView;
  /** 대상이 이 레이어일 때의 포인터와 키 */
  createTool?(ctx: MapLayerToolContext): MapLayerTool;
  /** 대상이 이 레이어일 때 인스펙터 자리에 그릴 컴포넌트 (앱에서는 React 컴포넌트, props 는 MapLayerInspectorProps) */
  readonly Inspector?: unknown;
}

/**
 * 실행 하나를 지켜보는 것 (예: 자동 재생이 끝났는가, 게임이 처음부터 다시 시작했는가). 앱의 러너가 게임이 찍은 줄마다 line 을,
 * 게임이 끝나면 exit 를 부른다. 실행마다 새로 만든다 (PlayPlan.watch)
 */
export interface PlayWatch {
  /** 게임이 찍은 줄 하나. 실행을 멈출 이유를 돌려주면 러너가 그 글을 콘솔에 남기고 게임을 멈춘다 */
  line(text: string): string | undefined;
  /** 게임이 스스로 끝났다 (code 는 종료 코드, 정지면 null). 알릴 실패가 있으면 그 글 (콘솔 오류와 알림) */
  exit?(code: number | null): string | undefined;
  /** 핫 리로드로 스크립트가 처음부터 다시 돈다 (그 뒤의 줄은 새 판이다) */
  restarted?(): void;
}

export interface PlayPlan {
  /** 러너의 기본 변수 뒤에 덧씌운다 */
  env: Record<string, string>;
  /** 로그에 보일 위치 (칸이든 픽셀이든 제공자가 정한다). 없으면 null */
  at: Point | null;
  /** "이벤트 captain 앞" 같은 설명 */
  note?: string;
  /** 실행을 지켜볼 것을 만든다 (실행마다 한 번). 없으면 러너가 줄을 흘려보내기만 한다 */
  watch?(): PlayWatch;
}

export interface PlayContext {
  /** 이 맵의 뷰에 남은 커서 (월드 픽셀) */
  cursor: Point | null;
  /** 이 맵의 뷰 가운데 (월드 픽셀) */
  viewCenter: Point | null;
}

export interface PlayProviderSpec {
  id: string;
  /** 높은 것부터 묻는다. 기본 제공자(map-objects.json 의 play)는 0 */
  priority: number;
  /** 이 맵을 이 제공자가 띄우는가 */
  applies(doc: MapDocument): boolean;
  /** applies 가 거짓인 이유 (누를 때 알린다). 이 프로젝트에 해당하지 않으면 undefined */
  hint?(doc: MapDocument): string | undefined;
  /** 띄울 변수. 못 정하면 null */
  plan(doc: MapDocument, ctx: PlayContext): PlayPlan | null;
}

/** 확장이 맵 하나를 띄울 때 넘기는 것 (앱의 여기서 실행과 같은 길로 간다) */
export interface PlayRequest {
  /** 로그와 알림에 보일 이름 (예: "이 체크포인트 앞에서 실행") */
  label: string;
  /** 저장을 마친 뒤에 부른다 (다시 읽기를 골랐으면 디스크의 내용으로). 띄울 수 없으면 그 이유 */
  plan(doc: MapDocument): PlayPlan | string;
}

/** 맵을 띄우는 길. 앱이 setPlayer 로 넣는다 (러너 확인, 저장할지 묻기, 콘솔 한 줄, 러너 시작) */
export interface MapPlayer {
  /** 지금 띄울 수 없는 이유 (러너가 못 띄운다, 엔진이 없다). 띄울 수 있으면 undefined */
  blocked(): string | undefined;
  /** 띄웠으면 true */
  play(doc: MapDocument, request: PlayRequest): Promise<boolean>;
}

export const NO_MAP_PLAYER = "맵 실행기 미설정 (setPlayer 호출 없음)";

/**
 * 설치본 자가 검사(앱의 editor/selftest)가 확장에 묻는 것. 확장의 내보내기 selftest 칸에 둔다.
 * 판정은 앱이 아니라 scripts/selftest-check.mjs 가 보고서와 디스크의 맵 파일로 한다
 */
export interface MapSelftestProbe {
  /** 이 맵에 붙인 것의 보고 (JSON 으로 적을 수 있는 값). ready 가 참이 될 때까지 자가 검사가 다시 묻는다 */
  describe(doc: MapDocument): { ready: boolean } & Record<string, unknown>;
  /** 계획의 인자로 실행 요청을 만든다 (메뉴의 실행 명령과 같은 요청). 만들 수 없으면 그 이유 */
  playRequest(doc: MapDocument, args: Readonly<Record<string, unknown>>): PlayRequest | string;
}

/** 맵 뷰에서 타일 하나를 고르는 요청 */
export interface CellPickRequest {
  /** 고를 맵 파일 (프로젝트 경로). 탭으로 열고, 이미 열려 있으면 그 탭으로 간다 */
  path: string;
  /** 고르는 동안 맵 뷰 위의 띠에 보일 글 */
  prompt: string;
  /** 끝나면(타일을 고르거나 Esc 로 취소하면) 활성으로 돌릴 문서. 고르는 동안 이 문서가 닫히면 고르기를 취소한다 */
  returnTo?: Document;
}

/** 맵 탭과 맵 뷰를 다루는 길. 앱이 setMapViews 로 넣는다 */
export interface MapViews {
  /** 고른 타일. 취소했거나 맵을 열지 못했으면 null. 새 요청은 앞의 요청을 취소한다 */
  pickCell(request: CellPickRequest): Promise<Point | null>;
  /** 맵 파일을 탭으로 열고 이 타일을 뷰 가운데에 둔다 (줌은 그대로). 열었으면 true */
  revealCell(path: string, cell: Point): Promise<boolean>;
}

export const NO_MAP_VIEWS = "맵 뷰 없음 (에디터가 맵 뷰를 등록하지 않음)";

export interface TilemapApi {
  registerMapLayer(spec: MapLayerSpec): () => void;
  registerPlayProvider(spec: PlayProviderSpec): () => void;
  /** 열린 맵 문서마다: 상태가 없으면 attach 를 다시 부르고, 있으면 state.refresh() */
  refreshLayer(id: string): void;
  /** 등록된 레이어 (관찰 가능) */
  readonly layers: ReadonlyMap<string, MapLayerSpec>;
  /** 등록된 실행 제공자, priority 높은 것부터 (같으면 먼저 등록한 것) */
  readonly playProviders: readonly PlayProviderSpec[];
  /** 맵 하나를 요청대로 띄운다 (앱이 넣은 길, 여기서 실행과 같다). 띄웠으면 true */
  play(doc: MapDocument, request: PlayRequest): Promise<boolean>;
  /** 지금 띄울 수 없는 이유. 띄울 수 있으면 undefined (관찰 가능) */
  playBlocked(): string | undefined;
  /** 앱이 맵을 띄우는 길을 넣는다. 돌려준 함수로 뺀다 */
  setPlayer(player: MapPlayer): () => void;
  /** 맵 파일의 뷰에서 타일 하나를 고른다 (앱이 넣은 길). 취소했거나 길이 없으면 null */
  pickCell(request: CellPickRequest): Promise<Point | null>;
  /** 맵 파일을 탭으로 열고 이 타일을 뷰 가운데에 둔다. 열었으면 true */
  revealCell(path: string, cell: Point): Promise<boolean>;
  /** 맵 뷰를 쓸 수 없는 이유. 쓸 수 있으면 undefined (관찰 가능) */
  mapViewsBlocked(): string | undefined;
  /** 앱이 맵 탭과 뷰를 다루는 길을 넣는다. 돌려준 함수로 뺀다 */
  setMapViews(views: MapViews): () => void;
}

export interface TilemapContribDeps {
  /** 열린 문서 (작업 공간의 것). 맵 문서가 열리면 레이어를 붙인다 */
  documents?: DocumentRegistry;
  /** 붙이기 실패 같은 것을 콘솔에 */
  warn?(message: string): void;
}

/** 레이어 순서: order 가 큰 것이 위, 같으면 먼저 등록한 것이 아래 */
export function sortLayers(specs: Iterable<MapLayerSpec>): MapLayerSpec[] {
  return [...specs].map((spec, i) => ({ spec, i })).sort((a, b) => (a.spec.order ?? 0) - (b.spec.order ?? 0) || a.i - b.i).map((x) => x.spec);
}

export class TilemapContrib implements TilemapApi {
  readonly layers = observable.map<string, MapLayerSpec>({}, { deep: false });
  private readonly providers = observable.array<PlayProviderSpec>([], { deep: false });
  private readonly player = observable.box<MapPlayer | null>(null, { deep: false });
  private readonly views = observable.box<MapViews | null>(null, { deep: false });
  private offOpen: (() => void) | null = null;

  constructor(private readonly deps: TilemapContribDeps = {}) {
    this.offOpen = deps.documents?.events.on("open", (doc) => {
      if (!(doc instanceof MapDocument)) return;
      for (const spec of sortLayers(this.layers.values())) this.refreshOne(doc, spec);
    }) ?? null;
  }

  get playProviders(): readonly PlayProviderSpec[] {
    return this.providers
      .map((spec, i) => ({ spec, i }))
      .sort((a, b) => b.spec.priority - a.spec.priority || a.i - b.i)
      .map((x) => x.spec);
  }

  /** 그리는 순서의 레이어 (아래부터) */
  orderedLayers(): MapLayerSpec[] {
    return sortLayers(this.layers.values());
  }

  /** 이 맵을 띄울 첫 제공자 (priority 순). 없으면 null */
  providerFor(doc: MapDocument): PlayProviderSpec | null {
    return this.playProviders.find((p) => p.applies(doc)) ?? null;
  }

  registerMapLayer(spec: MapLayerSpec): () => void {
    if (this.layers.has(spec.id)) throw new Error(`맵 레이어 id 중복: ${spec.id}`);
    const problem = sectionKeyProblem(spec.section);
    if (problem) throw new Error(`맵 레이어 ${spec.id}: ${problem}`);
    for (const other of this.layers.values()) {
      if (other.section === spec.section) throw new Error(`섹션 ${spec.section}: 레이어 ${other.id}에서 이미 사용 중`);
    }
    action(() => this.layers.set(spec.id, spec))();
    for (const doc of this.openMaps()) this.refreshOne(doc, spec);
    let done = false;
    return () => {
      if (done || this.layers.get(spec.id) !== spec) return;
      done = true;
      for (const doc of this.openMaps()) doc.detachLayer(spec.id);
      action(() => this.layers.delete(spec.id))();
    };
  }

  registerPlayProvider(spec: PlayProviderSpec): () => void {
    if (this.providers.some((p) => p.id === spec.id)) throw new Error(`실행 제공자 id 중복: ${spec.id}`);
    action(() => this.providers.push(spec))();
    return action(() => {
      this.providers.remove(spec);
    });
  }

  play(doc: MapDocument, request: PlayRequest): Promise<boolean> {
    const player = this.player.get();
    if (!player) {
      this.deps.warn?.(`${request.label}: ${NO_MAP_PLAYER}`);
      return Promise.resolve(false);
    }
    return player.play(doc, request);
  }

  playBlocked(): string | undefined {
    const player = this.player.get();
    return player ? player.blocked() : NO_MAP_PLAYER;
  }

  setPlayer(player: MapPlayer): () => void {
    action(() => this.player.set(player))();
    return action(() => {
      if (this.player.get() === player) this.player.set(null);
    });
  }

  pickCell(request: CellPickRequest): Promise<Point | null> {
    const views = this.views.get();
    if (!views) {
      this.deps.warn?.(`타일 선택 (${request.path}): ${NO_MAP_VIEWS}`);
      return Promise.resolve(null);
    }
    return views.pickCell(request);
  }

  revealCell(path: string, cell: Point): Promise<boolean> {
    const views = this.views.get();
    if (!views) {
      this.deps.warn?.(`타일 보기 (${path}): ${NO_MAP_VIEWS}`);
      return Promise.resolve(false);
    }
    return views.revealCell(path, cell);
  }

  mapViewsBlocked(): string | undefined {
    return this.views.get() ? undefined : NO_MAP_VIEWS;
  }

  setMapViews(views: MapViews): () => void {
    action(() => this.views.set(views))();
    return action(() => {
      if (this.views.get() === views) this.views.set(null);
    });
  }

  refreshLayer(id: string): void {
    const spec = this.layers.get(id);
    if (!spec) return;
    for (const doc of this.openMaps()) this.refreshOne(doc, spec);
  }

  /** 문서에 붙이거나 새로 고친다. attach 나 refresh 가 던지면 콘솔에 남기고 넘어간다 */
  private refreshOne(doc: MapDocument, spec: MapLayerSpec): void {
    try {
      doc.refreshLayer(spec);
    } catch (e) {
      this.deps.warn?.(`맵 레이어 ${spec.label}(${spec.id}) 연결 실패 (${doc.path ?? doc.title}): ${(e as Error).message}`);
    }
  }

  private openMaps(): MapDocument[] {
    return (this.deps.documents?.documents ?? []).filter((d): d is MapDocument => d instanceof MapDocument);
  }

  /** 확장을 해제할 때: 문서 구독을 끊고 레이어를 전부 뗀다 */
  dispose(): void {
    this.offOpen?.();
    this.offOpen = null;
    for (const id of [...this.layers.keys()]) {
      for (const doc of this.openMaps()) doc.detachLayer(id);
    }
    action(() => {
      this.layers.clear();
      this.providers.clear();
      this.player.set(null);
      this.views.set(null);
    })();
  }
}
