// 모달 호스트. confirm, prompt, custom 을 그린다. Escape 로 닫히고 초점은 대화상자 안에 갇힌다.

import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { useEditor } from "../editor/EditorContext";
import type { ModalSpec } from "../editor/modals";
import "./Modals.css";

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

function ModalFrame({ spec, onClose, children, width }: { spec: ModalSpec; onClose: () => void; children: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const first = el.querySelector<HTMLElement>("[data-autofocus]") ?? el.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
  }, [spec.id]);

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !ref.current) return;
    const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={`modal-title-${spec.id}`} ref={ref} onKeyDown={onKeyDown} style={width ? { width } : undefined} data-testid="modal">
        <div className="modal-title" id={`modal-title-${spec.id}`}>
          {spec.title}
        </div>
        {children}
      </div>
    </div>
  );
}

function ConfirmModal({ spec }: { spec: Extract<ModalSpec, { kind: "confirm" }> }) {
  return (
    <ModalFrame spec={spec} onClose={() => spec.resolve(false)}>
      <div className="modal-body">{spec.message}</div>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={() => spec.resolve(false)}>
          {spec.cancelLabel ?? "취소"}
        </button>
        <button type="button" className={"btn " + (spec.danger ? "btn-danger" : "btn-primary")} onClick={() => spec.resolve(true)} data-autofocus>
          {spec.okLabel ?? "확인"}
        </button>
      </div>
    </ModalFrame>
  );
}

function PromptModal({ spec }: { spec: Extract<ModalSpec, { kind: "prompt" }> }) {
  const [value, setValue] = useState(spec.initial ?? "");
  const error = spec.validate ? spec.validate(value) : null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (error) return;
    spec.resolve(value);
  };
  return (
    <ModalFrame spec={spec} onClose={() => spec.resolve(null)}>
      <form onSubmit={submit}>
        <div className="modal-body">
          {spec.label && <label className="modal-label">{spec.label}</label>}
          <input className="input modal-input" value={value} placeholder={spec.placeholder} onChange={(e) => setValue(e.target.value)} data-autofocus autoFocus onFocus={(e) => e.target.select()} />
          {error && value !== "" && <div className="modal-error">{error}</div>}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={() => spec.resolve(null)}>
            취소
          </button>
          <button type="submit" className="btn btn-primary" disabled={!!error}>
            {spec.okLabel ?? "확인"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

function CustomModal({ spec }: { spec: Extract<ModalSpec, { kind: "custom" }> }) {
  return (
    <ModalFrame spec={spec} onClose={() => spec.resolve()} width={spec.width}>
      {spec.render(() => spec.resolve())}
    </ModalFrame>
  );
}

export const Modals = observer(function Modals() {
  const editor = useEditor();
  const spec = editor.modals.top;
  if (!spec) return null;
  if (spec.kind === "confirm") return <ConfirmModal spec={spec} key={spec.id} />;
  if (spec.kind === "prompt") return <PromptModal spec={spec} key={spec.id} />;
  return <CustomModal spec={spec} key={spec.id} />;
});
