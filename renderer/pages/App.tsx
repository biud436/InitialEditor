import { Routers } from "./";
import React from "react";
import { RecoilRoot } from "recoil";

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
