import Document, {
    Head,
    Main,
    NextScript,
    DocumentContext,
} from "next/document";
import { ServerStyleSheet } from "styled-components";
import Script from "next/script";
import { Meta } from "@components/Meta";

export default class MyDocument extends Document {
    static async getInitialProps(ctx: DocumentContext) {
        const serverStyleSheet = new ServerStyleSheet();
        const originalRenderPage = ctx.renderPage;

        try {
            ctx.renderPage = () =>
                originalRenderPage({
                    enhanceApp: (App) => (props) =>
                        serverStyleSheet.collectStyles(<App {...props} />),
                });

            const initialProps = await Document.getInitialProps(ctx);

            return {
                ...initialProps,
                styles: (
                    <>
                        {initialProps.styles}
                        {serverStyleSheet.getStyleElement()}
                    </>
                ),
            };
        } finally {
            serverStyleSheet.seal();
        }
    }

    render() {
        return (
            <html>
                <Head>
                    <Meta title="Initial Editor" />
                    <link
                        href="https://fonts.googleapis.com/css2?family=Nanum+Gothic&display=swap"
                        rel="stylesheet"
                    />
                    <link
                        rel="stylesheet"
                        href="https://use.fontawesome.com/releases/v5.14.0/css/all.css"
                        integrity="sha384-HzLeBuhoNPvSl5KYnjx0BT+WB0QEEqLprO+NBkkk5gbc67FTaL7XIGa2w1L0Xbgc"
                        crossOrigin="anonymous"
                    />
                    <script
                        type="text/javascript"
                        src="/static/js/jquery-3.5.1.js"
                    />
                    <script type="text/javascript" src="/static/js/pixi.js" />
                    <script
                        type="text/javascript"
                        src="/static/js/initial-editor.js"
                    ></script>
                </Head>
                <body data-theme="dark">
                    <Main />
                    <NextScript />
                </body>
            </html>
        );
    }
}
