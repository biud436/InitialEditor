import { IconItem } from "@components/atomics/IconItem";
import { Paragraph } from "@components/atomics/Paragraph";
import { Span } from "@components/atomics/Span";
import { Division } from "@components/atomics/Wrapper";

export function ClosePanel({ close }: { close: () => void }) {
    return (
        <Division className="tilesetWindow__control-box">
            <Paragraph>
                <Span>
                    <IconItem
                        className="far fa-window-close"
                        id="action-close"
                        onClick={close}
                    ></IconItem>
                </Span>
            </Paragraph>
        </Division>
    );
}
