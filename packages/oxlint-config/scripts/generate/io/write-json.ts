import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

/**
 * Write `data` as JSON (pretty-print) to `outputPath`
 *
 * This writes atomically, via a temp file and rename.
 */
export async function writeJson(
  outputPath: string,
  data: unknown,
): Promise<void> {
  const outputDirectory = dirname(outputPath);
  const temporaryPath = join(
    outputDirectory,
    `.${basename(outputPath)}.${process.pid}.${randomUUID()}.tmp`,
  );

  await mkdir(outputDirectory, { recursive: true });

  try {
    await writeFile(
      temporaryPath,
      `${JSON.stringify(data, undefined, 2)}\n`,
      "utf8",
    );
    await rename(temporaryPath, outputPath);
  } catch (error) {
    try {
      await unlink(temporaryPath);
    } catch {
      // The temp file may never have been created; that is not the failure
      // worth reporting here.
    }

    throw error;
  }
}
