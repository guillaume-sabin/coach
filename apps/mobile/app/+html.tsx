import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

/** Coquille HTML du build web : méta PWA pour l'installation sur l'écran d'accueil iPhone. */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Coach" />
        <meta name="theme-color" content="#f6f7f9" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#0f1115" media="(prefers-color-scheme: dark)" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: "body{background:#f6f7f9}@media(prefers-color-scheme:dark){body{background:#0f1115}}" }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
