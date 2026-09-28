// 안드로이드 스테이징의 대화상자 (docs/plans/e6-packaging.md 6.3).
//   확인: 원본(프로젝트), 대상(통째로 바뀐다), 스크립트와 출처, --dry-run 으로 미리 센 파일 수와 크기, RTP 변환물 체크(기본 꺼짐).
//         프로젝트에서 나온 저장소면 스크립트 경로를 보이고 실행 허용부터 받는다 (허용해야 미리 센다)
//   못 찾음: 찾아본 곳과 "설정 열기"
//   저장 안 된 문서: 저장하고 스테이징, 그대로 스테이징, 취소
// 처음 초점은 실행하지 않는 쪽(취소)이다.

import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { askDirtyChoice, type DirtyChoice } from "../dirtyChoice";
import type { ModalStore } from "../modals";
import type { AndroidStageStore, FoundRepo } from "./AndroidStageStore";
import { REPO_SOURCE_LABELS, stageDestPath, type RepoCandidate } from "./engineRepo";
import { countText, type DryRunSummary } from "./stageOutput";
import "./AndroidStageDialog.css";

export const STAGE_TITLE = "안드로이드로 스테이징";
export const STAGE_OK = "스테이징";
export const RTP_LABEL = "RTP 변환물 포함 (개인 기기 시험용)";
export const RTP_CHECK_WARNING = "RTP 변환물은 재배포 불가. 이 APK 는 배포 금지";
export const DEST_NOTE = "이 폴더의 내용 전체가 교체됨";
export const ALLOW_SCRIPT = "스크립트 실행 허용";
export const COUNTING = "세는 중";
export const MISSING_TITLE = "엔진 저장소 탐색 실패";
export const OPEN_SETTINGS = "설정 열기";
export const DIRTY_TITLE = "저장 안 된 문서";
export const DIRTY_SAVE = "저장하고 스테이징";
export const DIRTY_KEEP = "저장하지 않고 스테이징";

/** 프로젝트에서 나온 저장소의 스크립트를 처음 실행할 때 */
export function untrustedMessage(repo: RepoCandidate): string {
  return `스크립트 위치: ${REPO_SOURCE_LABELS[repo.source]}. 허용하면 미리 세기와 스테이징에 사용, 선택은 앱 설정에 저장됨`;
}

/** 못 찾았을 때 본문 */
export function missingMessage(searched: readonly RepoCandidate[]): string {
  const where = searched.map((c) => `  ${c.script} (${REPO_SOURCE_LABELS[c.source]})`).join("\n");
  return `android/prepare_assets.sh 가 있는 엔진 저장소(Initial2D 체크아웃) 필요. 설정의 "엔진 저장소" 에 경로 입력 필요.\n탐색한 경로:\n${where}`;
}

export function dirtyMessage(count: number): string {
  return `저장 안 된 문서 ${count}개. 스테이징은 디스크의 파일을 복사함`;
}

type CountState = { kind: "idle" } | { kind: "counting" } | { kind: "done"; value: DryRunSummary } | { kind: "error"; message: string };

export interface StageChoice {
  withRtp: boolean;
}

export const StageConfirmBody = observer(function StageConfirmBody({
  store,
  repo,
  project,
  onDone,
}: {
  store: AndroidStageStore;
  repo: FoundRepo;
  project: string;
  onDone: (choice: StageChoice | null) => void;
}) {
  const [withRtp, setWithRtp] = useState(false);
  const [trusted, setTrusted] = useState(() => store.isTrusted(repo));
  const [count, setCount] = useState<CountState>({ kind: "idle" });
  useEffect(() => {
    if (!trusted) return;
    let live = true;
    setCount({ kind: "counting" });
    store.count(repo, withRtp).then(
      (value) => {
        if (live) setCount({ kind: "done", value });
      },
      (e: unknown) => {
        if (live) setCount({ kind: "error", message: (e as Error).message });
      },
    );
    return () => {
      live = false;
    };
  }, [store, repo, withRtp, trusted]);

  const ready = trusted && count.kind === "done";
  return (
    <>
      <div className="modal-body" data-testid="android-stage">
        <div className="form-row">
          <label>원본</label>
          <code className="android-stage-path" data-testid="android-stage-project">{project}</code>
        </div>
        <div className="form-row">
          <label>대상</label>
          <code className="android-stage-path" data-testid="android-stage-dest">{stageDestPath(repo.repo)}</code>
          <div className="form-help">{DEST_NOTE}</div>
        </div>
        <div className="form-row">
          <label>스크립트</label>
          <code className="android-stage-path" data-testid="android-stage-script">{repo.script}</code>
          <div className="form-help">출처: {REPO_SOURCE_LABELS[repo.source]}</div>
        </div>
        {!trusted && (
          <div className="form-row" data-testid="android-stage-untrusted">
            <label>실행 확인</label>
            <div className="form-help">{untrustedMessage(repo)}</div>
            <div>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  store.trust(repo);
                  setTrusted(true);
                }}
                data-testid="android-stage-allow"
              >
                {ALLOW_SCRIPT}
              </button>
            </div>
          </div>
        )}
        <div className="form-row">
          <label>미리 세기</label>
          <span data-testid="android-stage-count" data-kind={count.kind}>
            {count.kind === "done" ? countText(count.value) : count.kind === "counting" ? COUNTING : count.kind === "error" ? count.message : "스크립트 실행을 허용하면 미리 세기 실행"}
          </span>
        </div>
        <div className="form-row">
          <label>RTP</label>
          <label className="checkbox">
            <input type="checkbox" checked={withRtp} onChange={(e) => setWithRtp(e.target.checked)} data-testid="android-stage-rtp" /> {RTP_LABEL}
          </label>
          {withRtp && (
            <div className="form-help android-stage-warning" data-testid="android-stage-rtp-warning">
              {RTP_CHECK_WARNING}
            </div>
          )}
        </div>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={() => onDone(null)} data-autofocus>
          취소
        </button>
        <button type="button" className="btn btn-primary" disabled={!ready} onClick={() => onDone({ withRtp })} data-testid="android-stage-ok">
          {STAGE_OK}
        </button>
      </div>
    </>
  );
});

/** 확인 대화상자. 스테이징을 고르면 선택을, 아니면 null */
export function askStageConfirm(modals: ModalStore, store: AndroidStageStore, repo: FoundRepo, project: string): Promise<StageChoice | null> {
  let choice: StageChoice | null = null;
  return modals
    .custom({
      title: STAGE_TITLE,
      width: 600,
      render: (close) => (
        <StageConfirmBody
          store={store}
          repo={repo}
          project={project}
          onDone={(c) => {
            choice = c;
            close();
          }}
        />
      ),
    })
    .then(() => choice);
}

/** 저장소를 못 찾았을 때. 설정 열기를 누르면 true */
export function askMissingRepo(modals: ModalStore, searched: readonly RepoCandidate[]): Promise<boolean> {
  let openSettings = false;
  return modals
    .custom({
      title: MISSING_TITLE,
      width: 600,
      render: (close) => (
        <>
          <div className="modal-body" data-testid="android-stage-missing">
            {missingMessage(searched)}
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={close} data-autofocus>
              닫기
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                openSettings = true;
                close();
              }}
            >
              {OPEN_SETTINGS}
            </button>
          </div>
        </>
      ),
    })
    .then(() => openSettings);
}

export type { DirtyChoice } from "../dirtyChoice";

/** 저장하지 않은 문서가 있을 때. Escape 나 가림막은 취소 */
export function askDirtyBeforeStage(modals: ModalStore, count: number): Promise<DirtyChoice> {
  return askDirtyChoice(modals, { title: DIRTY_TITLE, message: dirtyMessage(count), keepLabel: DIRTY_KEEP, saveLabel: DIRTY_SAVE, testId: "android-stage-dirty", focus: "cancel" });
}
