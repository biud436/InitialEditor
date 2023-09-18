import { createContext } from 'react';
import App from '../types/app';

export const AppContext = createContext<App>(null!);

export function AppGuard({
    children,
    app,
}: {
    children: React.ReactNode;
    app: App;
}) {
    return <AppContext.Provider value={app}>{children}</AppContext.Provider>;
}
