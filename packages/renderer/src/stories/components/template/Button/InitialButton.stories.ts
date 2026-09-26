import { Meta, StoryObj } from '@storybook/react';
import { InitialButton } from './InitialButton';

const meta = {
    title: '디자인 시스템/Core/Button',
    component: InitialButton,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
    argTypes: {
        borderRadius: {
            control: 'text',
            description: 'border-radius를 설정합니다.',
            defaultValue: '3px',
        },
    },
} satisfies Meta<typeof InitialButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
    args: {
        borderRadius: '3px',
    },
};
