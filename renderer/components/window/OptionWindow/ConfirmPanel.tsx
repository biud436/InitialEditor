import { Button } from "@components/atomics/Button";
import { Division } from "@components/atomics/Wrapper";

export function ConfirmPanel({
    ok,
    close,
}: {
    ok: () => void;
    close: () => void;
}) {
    return (
        <Division className="tilesetWindow__panel">
            <Button className="ok" onClick={ok}>
                확인
            </Button>
            <Button className="cancel" onClick={close}>
                취소
            </Button>
        </Division>
    );
}
