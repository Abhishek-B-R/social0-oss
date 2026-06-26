import { Outlet, useNavigate } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "sonner";
import { useSession } from "@/lib/auth-client";

export function RootLayout() {
  const { data: session } = useSession();
  const navigate = useNavigate();

  return (
    <ThemeProvider>
      <Outlet context={{ session, navigate }} />
      <Toaster position="top-center" richColors />
    </ThemeProvider>
  );
}
