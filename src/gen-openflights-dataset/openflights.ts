import csv from "csv-parser";
import fs from "node:fs";
import * as v from "valibot";

const numberInString = v.pipe(v.string(), v.transform(Number), v.number());

// https://openflights.org/data.php

export const AirportSchema = v.strictObject({
  id: v.pipe(numberInString, v.safeInteger()),
  name: v.string(),
  city: v.string(),
  country: v.string(),
  iata: v.nullable(v.pipe(v.string(), v.nonEmpty())),
  icao: v.pipe(v.string(), v.nonEmpty()),
  lat: numberInString,
  lon: numberInString,
  alt: numberInString,
  tzOffset: v.nullable(numberInString),
  dst: v.nullable(v.string()),
  tzName: v.nullable(v.string()),
  type: v.string(),
  source: v.string(),
});

export const RouteSchema = v.strictObject({
  airlineCode: v.pipe(v.string(), v.nonEmpty()),
  airlineId: v.nullable(v.pipe(numberInString, v.safeInteger())),
  srcAirportCode: v.pipe(v.string(), v.nonEmpty()),
  srcAirportId: v.nullable(v.pipe(numberInString, v.safeInteger())),
  dstAirportCode: v.pipe(v.string(), v.nonEmpty()),
  dstAirportId: v.nullable(v.pipe(numberInString, v.safeInteger())),
  codeshare: v.pipe(
    v.picklist(["", "Y"]),
    v.transform((str) => str === "Y")
  ),
  stops: v.pipe(numberInString, v.safeInteger()),
  equipment: v.pipe(
    v.string(),
    v.transform((str) => str.split(" "))
  ),
});

export function parse<
  const TEntries extends v.ObjectEntries,
  const TMessage extends v.ErrorMessage<v.StrictObjectIssue> | undefined,
  const TSchema extends v.StrictObjectSchema<TEntries, TMessage>
>(
  path: string,
  schema: TSchema,
  rowCallback: (value: v.InferOutput<TSchema>) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.createReadStream(path)
      .pipe(
        csv({
          headers: Object.keys(schema.entries),
          strict: true,
          mapValues: csvMapNull,
        })
      )
      .on("data", (row) => {
        const result = v.safeParse(schema, row);
        if (!result.success) {
          const issueMessage = result.issues
            .map((issue) => `${issue.message} in ${v.getDotPath(issue)}`)
            .join("\n");

          console.debug("Skipping row:", issueMessage, row);

          return;
        }

        rowCallback(result.output);
      })
      .on("end", () => {
        resolve();
      })
      .on("error", (error) => {
        reject(error);
      });
  });
}

function csvMapNull({
  value,
}: {
  header: string;
  index: number;
  value: string;
}): string | null {
  return value !== "\\N" ? value : null;
}
