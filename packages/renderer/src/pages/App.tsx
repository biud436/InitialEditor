import { Routers } from './';
import React from 'react';
import { RecoilRoot } from 'recoil';
// import '../styles/index.css';
import '../styles/main.scss';

function App() {
    return (
        <RecoilRoot>
            <React.Suspense fallback={<div>Loading...</div>}>
                <Routers />
            </React.Suspense>
        </RecoilRoot>
    );
}

export default App;
