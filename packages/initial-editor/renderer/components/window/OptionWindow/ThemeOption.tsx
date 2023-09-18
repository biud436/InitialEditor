import { OptionItem } from "@components/atomics/OptionItem";

export function ThemeOption({
    value,
    selected,
    text,
}: {
    value: "dark" | "light";
    selected: {
        theme: string;
    };
    text: string;
}) {
    return (
        <OptionItem value={value} selected={selected.theme === value}>
            {text}
        </OptionItem>
    );
}
