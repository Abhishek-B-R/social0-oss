export type UploadProgressCallback = (fileIndex: number, percent: number) => void;

export function uploadFile(
  file: File,
  fileIndex: number,
  onProgress?: UploadProgressCallback,
): Promise<{ id: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);

    xhr.open("POST", "/api/media/upload");
    xhr.responseType = "json";

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const percent = Math.min(
          90,
          Math.round((event.loaded / event.total) * 90),
        );
        onProgress(fileIndex, percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const body = xhr.response as { id?: string; error?: string } | null;
        if (body?.id) {
          onProgress?.(fileIndex, 100);
          resolve({ id: body.id });
        } else {
          reject(new Error(body?.error ?? "Upload failed: no ID returned"));
        }
      } else {
        const body = xhr.response as { error?: string } | null;
        reject(
          new Error(
            body?.error ?? `Upload failed with status ${xhr.status}`,
          ),
        );
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onabort = () => reject(new Error("Upload was aborted"));

    xhr.send(formData);
  });
}

