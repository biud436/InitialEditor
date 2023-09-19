import type { Preview } from '@storybook/react';
import React from 'react';
import { RecoilRoot } from 'recoil';
import { GlobalStyle } from '../src/styles/global-style';
import { withThemeFromJSXProvider } from '@storybook/addon-styling';

const preview: Preview = {
    parameters: {
        actions: { argTypesRegex: '^on[A-Z].*' },
        controls: {
            matchers: {
                color: /(background|color)$/i,
                date: /Date$/,
            },
        },
    },
    decorators: [
        withThemeFromJSXProvider({
            GlobalStyles: GlobalStyle,
        }),
        Story => (
            <RecoilRoot>
                <Story />
            </RecoilRoot>
        ),
    ],
};

export default preview;
