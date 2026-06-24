export type UploadProgressCallback = (fileIndex: number, percent: number) => void;

const DEFAULT_UPLOAD_TIMEOUT_MS = 60_000;

export type UploadFileOptions = {
  /** AbortSignal to cancel the upload (e.g. from AbortController) */
  signal?: AbortSignal;
  /** Timeout in ms; on exceed upload is aborted and rejected. Default 60s */
  timeoutMs?: number;
};

export function uploadFile(
  file: File,
  fileIndex: number,
  onProgress?: UploadProgressCallback,
  options?: UploadFileOptions,
): Promise<{ id: string; url: string }> {
  const { signal, timeoutMs = DEFAULT_UPLOAD_TIMEOUT_MS } = options ?? {};

  return new Promise((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let xhr: XMLHttpRequest | null = null;

    const cleanup = () => {
      if (timeoutId != null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const fail = (message: string) => {
      cleanup();
      if (xhr) {
        try {
          xhr.abort();
        } catch {
          // ignore
        }
        xhr = null;
      }
      reject(new Error(message));
    };

    const onAbort = () => fail("Upload was cancelled");

    if (signal?.aborted) {
      return reject(new Error("Upload was cancelled"));
    }
    signal?.addEventListener("abort", onAbort, { once: true });

    timeoutId = setTimeout(() => {
      cleanup();
      signal?.removeEventListener("abort", onAbort);
      if (xhr) {
        xhr.abort();
        xhr = null;
      }
      reject(new Error("Upload timed out. Please try again."));
    }, timeoutMs);

    (async () => {
      try {
        // Phase 0: Get presigned URL from backend (~20ms)
        const presignRes = await fetch("/api/media/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            fileSize: file.size,
          }),
          signal,
        });

        if (!presignRes.ok) {
          const err = await presignRes.json().catch(() => ({}));
          cleanup();
          signal?.removeEventListener("abort", onAbort);
          return reject(new Error(err?.error ?? "Failed to get upload URL"));
        }

        const { presignedUrl, key, storageFilename } = await presignRes.json();

        // Phase 1: Upload directly to R2 via XHR (progress tracking works)
        xhr = new XMLHttpRequest();

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && onProgress) {
            // Cap at 95% so UI can show "Finalizing upload..." until server responds
            const percent = Math.min(
              95,
              Math.round((event.loaded / event.total) * 95),
            );
            onProgress(fileIndex, percent);
          }
        };

        xhr.onload = async () => {
          if (timeoutId != null) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          signal?.removeEventListener("abort", onAbort);

          if (xhr?.status === 200) {
            try {
              // Phase 2: Confirm upload, save DB record (~20ms)
              const confirmRes = await fetch("/api/media/confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  key,
                  storageFilename,
                  originalFilename: file.name,
                  contentType: file.type,
                  fileSize: file.size,
                }),
                signal,
              });

              if (!confirmRes.ok) {
                const err = await confirmRes.json().catch(() => ({}));
                return reject(new Error(err?.error ?? "Failed to confirm upload"));
              }

              const media = await confirmRes.json();
              onProgress?.(fileIndex, 100);
              resolve({ id: media.id, url: media.url ?? "" });
            } catch (e) {
              reject(e);
            }
          } else {
            reject(
              new Error(`Upload failed with status ${xhr?.status ?? "unknown"}`),
            );
          }
        };

        xhr.onerror = () => {
          cleanup();
          signal?.removeEventListener("abort", onAbort);
          reject(new Error("Network error during upload"));
        };
        xhr.onabort = () => {
          cleanup();
          signal?.removeEventListener("abort", onAbort);
          reject(new Error("Upload was cancelled"));
        };

        xhr.open("PUT", presignedUrl);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.send(file);
      } catch (e) {
        cleanup();
        signal?.removeEventListener("abort", onAbort);
        reject(e);
      }
    })();
  });
}
