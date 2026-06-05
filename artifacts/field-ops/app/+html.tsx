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
            html {
              height: 100%;
              overflow-x: clip;
              overflow-y: hidden;
              max-width: 100vw;
            }
            body {
              height: 100%;
              overflow-x: clip;
              overflow-y: hidden;
              max-width: 100vw;
              margin: 0;
              padding: 0;
              touch-action: pan-y;
              overscroll-behavior-x: none;
            }
            #root {
              position: fixed;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              overflow: hidden;
              display: flex;
            }
            input, textarea, select { font-size: 16px !important; }
          `
        }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
