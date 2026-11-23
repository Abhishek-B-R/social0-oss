
import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="theme"
      // This SPA renders on the client only, so the inline anti-flash script
      // never runs (index.html applies the theme first). Marking it as a data
      // block stops React 19 from logging "Encountered a script tag" on
      // every page load.
      scriptProps={{ type: "application/json" }}
    >
      {children}
    </NextThemesProvider>
  );
}

