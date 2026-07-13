import { readFileSync } from "node:fs";
import { basename } from "node:path";
import ora from "ora";
import { uploadMediaBuffer } from "../api/media.js";
import { printOutput, success } from "../utils/output.js";
import { exitWithError } from "../utils/errors.js";
import { guessMimeType } from "../utils/files.js";
import { applyGlobalOptions, getFormat } from "./helpers.js";
import type { GlobalOptions } from "../types/index.js";

export async function uploadCommand(
  files: string[],
  opts: GlobalOptions,
): Promise<void> {
  applyGlobalOptions(opts);
  const format = getFormat(opts);

  if (files.length === 0) {
    console.error("Usage: social0 upload <file> [files...]");
    process.exit(1);
  }

  const results: Array<{ filename: string; id: string; url: string }> = [];

  try {
    for (const file of files) {
      const filename = basename(file);
      const buffer = readFileSync(file);
      const mimeType = guessMimeType(filename);
      const spinner = ora(`Uploading ${filename}...`).start();

      const result = await uploadMediaBuffer({
        buffer,
        filename,
        mimeType,
        onProgress: (pct) => {
          spinner.text = `Uploading ${filename}... ${pct}%`;
        },
      });

      spinner.succeed(`Uploaded ${filename}`);
      results.push({ filename, id: result.id, url: result.url });
    }

    if (format === "table") {
      printOutput(
        results.map((r) => ({ FILENAME: r.filename, "MEDIA ID": r.id.slice(0, 12) + "...", URL: r.url })),
        "table",
      );
    } else {
      printOutput(results, format);
    }
  } catch (err) {
    exitWithError(err);
  }
}
