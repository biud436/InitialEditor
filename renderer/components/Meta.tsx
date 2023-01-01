import Head from "next/head";

interface MetaProps {
    title: string;
    description?: string;
}

export const Meta = ({ title, description }: MetaProps) => {
    return (
        <Head>
            <title>{title}</title>

            <meta charSet="UTF-8" />
            <meta
                name="viewport"
                content="width=device-width, initial-scale=1.0"
            />
            <meta name="description" content={description} />
        </Head>
    );
};
