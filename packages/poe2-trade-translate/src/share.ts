import fs from "node:fs";
import * as csv from "csv/sync";

export const textsPath = "../../docs/poe2/trade-texts.csv";

export interface TextData {
    key: string;
    original: string;
    translate: string | undefined;
    needCheck: boolean | undefined;
}

export function readTexts() {
    if (!fs.existsSync(textsPath)) {
        return;
    }
    
    const backendTextsCsv = fs.readFileSync(textsPath, { encoding: "utf8" });
    return csv.parse(backendTextsCsv, {
        columns: true,
        skip_empty_lines: true,
        objname: "key",
        bom: true
    }) as unknown as Record<string, TextData>;
}

export function writeTexts(texts: TextData[]) {
    texts.sort((a, b) => a.key.localeCompare(b.key));
    fs.writeFileSync(textsPath, csv.stringify(texts, {
        bom: true,
        header: true,
    }),);
}

