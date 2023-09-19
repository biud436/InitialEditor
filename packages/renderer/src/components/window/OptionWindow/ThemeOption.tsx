import { OptionItem } from '@components/atomics/OptionItem';

interface ThemeOptionProps {
    value: 'dark' | 'light';
    selected: {
        theme: string;
    };
    text: string;
}

export function ThemeOption({ value, selected, text }: ThemeOptionProps) {
    return (
        <OptionItem value={value} selected={selected.theme === value}>
            {text}
        </OptionItem>
    );
}
