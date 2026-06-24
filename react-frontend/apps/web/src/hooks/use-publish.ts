import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { accountsService } from "@/services/accounts.service";
import { publishService } from "@/services/publish.service";
import { usePublishStore } from "@/stores/publish.store";
import type { PublishInput } from "@/services/publish.service";
import { toast } from "sonner";

export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: () => accountsService.list(),
  });
}

export function usePublishPost() {
  const queryClient = useQueryClient();
  const { setTrackingId, setPublishing, updateFromEvent, reset } = usePublishStore();

  return useMutation({
    mutationFn: (input: PublishInput) => publishService.publish(input),
    onMutate: () => {
      reset();
      setPublishing(true);
    },
    onSuccess: (data) => {
      if ("streamUrl" in data && data.trackingId) {
        setTrackingId(data.trackingId);
        publishService.subscribeToProgress(
          data.trackingId,
          (event) => {
            updateFromEvent(event);
            if (event.phase === "completed") {
              toast.success("Published successfully");
              setPublishing(false);
              void queryClient.invalidateQueries({ queryKey: ["posts"] });
            }
            if (event.phase === "failed") {
              toast.error(event.message ?? "Publish failed");
              setPublishing(false);
            }
          },
          () => setPublishing(false),
          (err) => {
            toast.error(err.message);
            setPublishing(false);
          },
        );
        return;
      }
      if ("status" in data && data.status === "scheduled") {
        toast.success(`Scheduled for ${new Date(data.scheduledAt).toLocaleString()}`);
        setPublishing(false);
        void queryClient.invalidateQueries({ queryKey: ["posts"] });
      }
    },
    onError: (err: Error) => {
      toast.error(err.message);
      setPublishing(false);
    },
  });
}
