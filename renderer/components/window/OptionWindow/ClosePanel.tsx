export function ClosePanel({ close }: { close: () => void }) {
    return (
        <div className="tilesetWindow__control-box">
            <p>
                <span>
                    <i
                        className="far fa-window-close"
                        id="action-close"
                        onClick={close}
                    ></i>
                </span>
            </p>
        </div>
    );
}
