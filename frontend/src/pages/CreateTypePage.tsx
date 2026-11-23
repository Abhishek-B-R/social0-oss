import { Navigate, useLocation, useParams } from "react-router-dom";
import { useDashboardPath } from "@/components/app";
import { NewPostPage } from "@/features/dashboard/create/NewPostPage";
import { isContentTypeSlug } from "@/features/dashboard/composer/content-type";

/**
 * Old `/dashboard/create/:type` forms (text, image, video, threads,
 * collection). All of them now open the one-screen composer, keeping
 * `?edit=`, `?draft=` and `?scheduled=`; `threads` starts with a second
 * post. Unknown types go to `/new`.
 */
export function CreateTypePage() {
  const { type = "" } = useParams();
  const { search } = useLocation();
  const dash = useDashboardPath();
  if (!isContentTypeSlug(type)) {
    return <Navigate to={`${dash("new")}${search}`} replace />;
  }
  return <NewPostPage startAsThread={type === "threads"} />;
}
