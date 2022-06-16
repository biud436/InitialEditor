export function ConfirmPanel({
    ok,
    close,
}: {
    ok: () => void;
    close: () => void;
}) {
    return (
        <div className="tilesetWindow__panel">
            <button className="ok" onClick={ok}>
                확인
            </button>
            <button className="cancel" onClick={close}>
                취소
            </button>
        </div>
    );
}
