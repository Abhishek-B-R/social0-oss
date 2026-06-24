import { apiGet, apiPost, apiPut } from "@/lib/api-client";

export interface PresignResponse {
  uploadUrl: string;
  mediaId: string;
  key: string;
}

export const mediaService = {
  presign(input: {
    filename: string;
    contentType: string;
    fileSize: number;
  }): Promise<PresignResponse> {
    return apiPost<PresignResponse>("/api/media/presign", input);
  },

  confirm(mediaId: string): Promise<{ ok: boolean; jobId?: string }> {
    return apiPost("/api/media/confirm", { mediaId });
  },

  async uploadFile(
    file: File,
    onProgress?: (pct: number) => void,
  ): Promise<{ mediaId: string }> {
    const presign = await mediaService.presign({
      filename: file.name,
      contentType: file.type,
      fileSize: file.size,
    });

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", presign.uploadUrl);
      xhr.setRequestHeader("Content-Type", file.type);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error(`Upload failed: ${xhr.status}`));
      xhr.onerror = () => reject(new Error("Upload failed"));
      xhr.send(file);
    });

    await mediaService.confirm(presign.mediaId);
    return { mediaId: presign.mediaId };
  },
};

export const pinterestService = {
  boards(accountId: string): Promise<{ id: string; name: string }[]> {
    return apiGet(`/api/pinterest/boards?accountId=${accountId}`);
  },

  setDefaultBoard(accountId: string, boardId: string): Promise<void> {
    return apiPut("/api/pinterest/default-board", { accountId, boardId });
  },
};
