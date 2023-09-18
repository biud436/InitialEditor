import { useContext } from 'react';
import { AppContext } from '../context/app.providers';

export function useApp() {
    return useContext(AppContext);
}
