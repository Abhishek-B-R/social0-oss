import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "sonner";
import { useSession } from "@/lib/auth-client";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export function RootLayout() {
  const { data: session } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    document.documentElement.classList.add(geistSans.variable, geistMono.variable);
  }, []);

  return (
    <ThemeProvider>
      <Outlet context={{ session, navigate }} />
      <Toaster position="top-center" richColors />
    </ThemeProvider>
  );
}
