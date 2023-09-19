import { Button } from '@components/atomics/Button';

type ButtonProps = React.ComponentProps<typeof Button> & {
    borderRadius?: string;
};

export const InitialButton = ({ borderRadius, ...props }: ButtonProps) => {
    return (
        <Button {...props} borderRadius={borderRadius}>
            확인
        </Button>
    );
};
