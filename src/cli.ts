import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { extractTranscriptMap } from "./services/extract-transcript-map.js";

async function main(): Promise<void> {
  const transcriptPath = process.argv[2];
  const explicitTitle = process.argv[3];

  if (!transcriptPath) {
    throw new Error(
      "Usage: npm run extract -- /absolute/or/relative/path/to/transcript.txt \"Optional Title\""
    );
  }

  const absolutePath = resolve(process.cwd(), transcriptPath);
  const transcript = await readFile(absolutePath, "utf8");

  const result = await extractTranscriptMap(
    explicitTitle
      ? {
          transcript,
          title: explicitTitle
        }
      : {
          transcript
        }
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(message);
  process.exitCode = 1;
});
