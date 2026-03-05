export type UploadProgressCallback = (fileIndex: number, percent: number) => void;

export function uploadFile(
  file: File,
  fileIndex: number,
  onProgress?: UploadProgressCallback,
): Promise<{ id: string; url: string }> {
  return new Promise((resolve, reject) => {
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
        });

        if (!presignRes.ok) {
          const err = await presignRes.json().catch(() => ({}));
          return reject(new Error(err?.error ?? "Failed to get upload URL"));
        }

        const { presignedUrl, key, storageFilename } = await presignRes.json();

        // Phase 1: Upload directly to R2 via XHR (progress tracking works)
        const xhr = new XMLHttpRequest();

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && onProgress) {
            // Scale to 0-90% during upload, reserve 90-100% for confirm step
            const percent = Math.min(
              90,
              Math.round((event.loaded / event.total) * 90),
            );
            onProgress(fileIndex, percent);
          }
        };

        xhr.onload = async () => {
          if (xhr.status === 200) {
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
            reject(new Error(`R2 upload failed with status ${xhr.status}`));
          }
        };

        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.onabort = () => reject(new Error("Upload was aborted"));

        xhr.open("PUT", presignedUrl);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.send(file);
      } catch (e) {
        reject(e);
      }
    })();
  });
}
