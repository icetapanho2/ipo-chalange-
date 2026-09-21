import fs from "node:fs";

/**
 * Parser CSV mínimo: separador ';', aspas duplas ao estilo RFC 4180,
 * ficheiros UTF-8 com BOM. Suficiente para os dados gerados por gerar_dados.py.
 */
function parseLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      fields.push(field);
      field = "";
    } else {
      field += c;
    }
  }
  fields.push(field);
  return fields;
}

export function readCsv<T extends Record<string, string>>(
  filePath: string,
  delimiter = ";",
): T[] {
  let raw = fs.readFileSync(filePath, "utf-8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  const lines = raw.split(/\r\n|\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const header = parseLine(lines[0], delimiter);
  const rows: T[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i], delimiter);
    const row: Record<string, string> = {};
    header.forEach((key, idx) => {
      row[key] = values[idx] ?? "";
    });
    rows.push(row as T);
  }
  return rows;
}

export function readJson<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as T;
}
