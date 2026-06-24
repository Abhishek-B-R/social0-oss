import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export function TeamsPage() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/dashboard/more", { replace: true });
  }, [navigate]);
  return null;
}
