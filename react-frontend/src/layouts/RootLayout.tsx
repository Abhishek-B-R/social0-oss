import { Outlet, useNavigate } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import { RouteSeo } from "@/components/seo/RouteSeo";
import { Toaster } from "sonner";
import { useSession } from "@/lib/auth-client";

export function RootLayout() {
  const { data: session } = useSession();
  const navigate = useNavigate();

  return (
    <ThemeProvider>
      <RouteSeo />
      <Outlet context={{ session, navigate }} />
      <Toaster position="top-center" richColors />
    </ThemeProvider>
  );
}
