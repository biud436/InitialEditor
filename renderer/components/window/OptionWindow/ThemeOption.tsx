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
        <option value={value} selected={selected.theme === value}>
            {text}
        </option>
    );
}
