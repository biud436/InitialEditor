import { createContext } from 'react';
import App from '../types/app';

export const AppContext = createContext<App>(null!);

export interface AppGuardProps {
    children: React.ReactNode;
    app: App;
}

export function AppGuard({ children, app }: AppGuardProps) {
    return <AppContext.Provider value={app}>{children}</AppContext.Provider>;
}
