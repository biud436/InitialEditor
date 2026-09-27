// 엔진 신뢰 확인 (docs/plans/e6-packaging.md 2.3 절). 프로젝트가 가리키는 실행 파일의 절대 경로와 출처를 보이고
// "이 엔진 실행 허용" 과 "앱에 든 엔진만 쓰기" 가운데 고르게 한다. 답은 RunnerStore 가 앱 설정에 남긴다.
// 처음 초점은 실행하지 않는 쪽이다 (Enter 가 실행을 허용하지 않게). Escape 나 가림막은 답 없이 닫는다(이번만 건너뛴다).

import { ENGINE_SOURCE_LABELS } from "./engineCandidates";
import type { TrustAnswer, TrustQuestion } from "./engineTrust";
import type { ModalStore } from "../modals";

export const TRUST_TITLE = "엔진 실행 확인";
export const TRUST_ALLOW = "이 엔진 실행 허용";
export const TRUST_DENY = "앱에 든 엔진만 쓰기";
/** 개발 빌드처럼 앱에 든 엔진이 없을 때의 거절 단추 */
export const TRUST_DENY_NO_BUNDLED = "실행하지 않기";

export function trustMessage(q: TrustQuestion): string {
  return q.candidates.length > 1 ? "이 프로젝트가 가리키는 엔진들을 실행할까?" : "이 프로젝트가 가리키는 엔진을 실행할까?";
}

export function EngineTrustBody({ question, onAnswer }: { question: TrustQuestion; onAnswer: (answer: Exclude<TrustAnswer, null>) => void }) {
  return (
    <>
      <div className="modal-body" data-testid="engine-trust">
        <p>{trustMessage(question)}</p>
        <ul>
          {question.candidates.map((c) => (
            <li key={c.path} data-testid="engine-trust-path">
              <code>{c.path}</code> (출처: {ENGINE_SOURCE_LABELS[c.source]})
            </li>
          ))}
        </ul>
        <p className="form-help">
          허용하면 엔진을 찾을 때와 실행할 때 이 파일을 띄운다. 받은 프로젝트라면 실행하지 않는다. 답은 앱 설정에 남고 설정에서 취소할 수 있다
        </p>
        <p className="form-help">프로젝트: {question.root}</p>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={() => onAnswer("deny")} data-autofocus data-testid="engine-trust-deny">
          {question.hasBundled ? TRUST_DENY : TRUST_DENY_NO_BUNDLED}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => onAnswer("allow")} data-testid="engine-trust-allow">
          {TRUST_ALLOW}
        </button>
      </div>
    </>
  );
}

/** 모달로 묻는다. 단추를 누르지 않고 닫으면 null */
export function askEngineTrust(modals: ModalStore, question: TrustQuestion): Promise<TrustAnswer> {
  let answer: TrustAnswer = null;
  return modals
    .custom({
      title: TRUST_TITLE,
      width: 560,
      render: (close) => (
        <EngineTrustBody
          question={question}
          onAnswer={(a) => {
            answer = a;
            close();
          }}
        />
      ),
    })
    .then(() => answer);
}
