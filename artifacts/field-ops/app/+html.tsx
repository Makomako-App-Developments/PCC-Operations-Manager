import { ScrollViewStyleReset } from "expo-router/html";

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{
          __html: `
            html, body, #root { height: 100%; width: 100%; overflow: hidden; margin: 0; padding: 0; }
            #root { display: flex; flex: 1; }
            /* Prevent iOS Safari from zooming on input focus */
            input, textarea, select { font-size: 16px !important; }
          `
        }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
