"use client";

import { useCallback, useState } from "react";
import { Upload } from "lucide-react";

type BulkUploadZoneProps = {
  accept: string;
  maxFiles: number;
  maxSizeBytes: number;
  maxSizeLabel: string;
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
};

export function BulkUploadZone({
  accept,
  maxFiles,
  maxSizeBytes,
  maxSizeLabel,
  onFilesSelected,
  disabled = false,
}: BulkUploadZoneProps) {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateAndEmit = useCallback(
    (files: FileList | null) => {
      setError(null);
      if (!files?.length) return;
      const list = Array.from(files);
      if (list.length > maxFiles) {
        setError(`Maximum ${maxFiles} files. You selected ${list.length}.`);
        return;
      }
      const oversized = list.filter((f) => f.size > maxSizeBytes);
      if (oversized.length > 0) {
        setError(
          `${oversized.length} file(s) exceed ${maxSizeLabel}. Please choose smaller files.`,
        );
        return;
      }
      onFilesSelected(list);
    },
    [maxFiles, maxSizeBytes, maxSizeLabel, onFilesSelected],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      if (disabled) return;
      validateAndEmit(e.dataTransfer.files);
    },
    [disabled, validateAndEmit],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      validateAndEmit(e.target.files);
      e.target.value = "";
    },
    [validateAndEmit],
  );

  return (
    <div className="space-y-2">
      <label
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-12 px-6 text-center transition-colors ${
          disabled
            ? "cursor-not-allowed border-border bg-muted"
            : dragActive
              ? "border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/30"
              : "cursor-pointer border-border bg-muted/50 hover:border-emerald-300 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/20 dark:hover:border-emerald-600"
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          type="file"
          accept={accept}
          multiple
          onChange={handleChange}
          disabled={disabled}
          className="hidden"
        />
        <Upload className="h-12 w-12 text-muted-foreground mb-2" />
        <p className="text-sm font-medium text-foreground">
          Click to upload or drag and drop
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {maxSizeLabel}. Max {maxFiles} files.
        </p>
      </label>
      {error && (
        <p className="text-sm text-red-600 font-medium dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
