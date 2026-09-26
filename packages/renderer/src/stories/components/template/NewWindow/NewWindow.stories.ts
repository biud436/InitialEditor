import { Meta, StoryObj } from '@storybook/react';
import { NewWindowStoryContainer } from './NewWindow';

const meta = {
    title: '디자인 시스템/템플릿/NewWindow',
    component: NewWindowStoryContainer,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
} satisfies Meta<typeof NewWindowStoryContainer>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Primary: Story = {
    args: {},
};
