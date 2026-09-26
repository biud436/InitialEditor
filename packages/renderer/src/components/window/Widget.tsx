import { Box } from '@components/atomics/Box';
import styled from 'styled-components';
import classnames from 'classnames';
import { WidgetProvider } from '@context/window.providers';
import { Toast } from '@components/Toast';

type WidgetLayoutProps = {
  children?: React.ReactNode;
};

const WidgetWrapper = styled.div`
  .widget {
    z-index: 1;
    position: absolute;
    left: 0;
    top: 0;
  }
`;

export default function Widget({ children }: WidgetLayoutProps) {
  return (
    <WidgetWrapper>
      <Box className={classnames('widget')}>
        {children}
        <WidgetProvider />
        <Toast />
      </Box>
    </WidgetWrapper>
  );
}
