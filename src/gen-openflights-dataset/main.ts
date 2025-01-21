import * as fs from "node:fs/promises";
import * as path from "node:path";

import { datasetGen } from "./dataset-gen";

export async function main(): Promise<void> {
  const args = process.argv.slice(2);

  for (const arg of args) {
    if (arg === "-h" || arg === "--help") {
      console.info(helpText());
      process.exit(0);
    }
  }

  if (args.length !== 2) {
    console.error(helpText());
    process.exit(1);
  }

  const dataDirectory = args[0]!;
  const outputPath = args[1]!;

  await createParentDirectory(outputPath);

  const dataset = await datasetGen(dataDirectory);

  const datasetJson = JSON.stringify(dataset);
  await fs.writeFile(outputPath, datasetJson);
}

function helpText(): string {
  return "USAGE: gen-openflights-dataset <openflights-data-directory> <output-directory>/openflights-dataset.json";
}

async function createParentDirectory(filePath: string): Promise<void> {
  const parentDirectory = path.dirname(filePath);
  await fs.mkdir(parentDirectory, { recursive: true });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
