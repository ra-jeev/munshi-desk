#!/usr/bin/env node
/**
 * Compares the flattened message keys of app/i18n/en-US.ts and
 * app/i18n/hi-IN.ts. Fails (exit 1) if any key exists in one locale but
 * not in the other. Run: node scripts/check-i18n-parity.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function load(file) {
  const src = readFileSync(file, "utf8");
  const body = src
    .replace(/export\s+default\s+messages\s*;?/m, "")
    .replace(/const\s+messages\s*=\s*/, "return ");
  const fn = new Function(`${body}`);
  const messages = fn();
  return flatten(messages);
}

function flatten(obj, prefix = "", out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      flatten(value, path, out);
    } else {
      out[path] = value;
    }
  }
  return out;
}

const en = load(join(root, "app/i18n/en-US.ts"));
const hi = load(join(root, "app/i18n/hi-IN.ts"));

const missingInHi = Object.keys(en).filter((k) => !(k in hi));
const missingInEn = Object.keys(hi).filter((k) => !(k in en));
const emptyInHi = Object.keys(hi).filter(
  (k) => typeof hi[k] !== "string" || hi[k].trim() === "",
);

if (missingInHi.length || missingInEn.length || emptyInHi.length) {
  if (missingInHi.length) {
    console.error(`Missing in hi-IN (${missingInHi.length}):`);
    for (const k of missingInHi) console.error(`  ${k}`);
  }
  if (missingInEn.length) {
    console.error(`Missing in en-US (${missingInEn.length}):`);
    for (const k of missingInEn) console.error(`  ${k}`);
  }
  if (emptyInHi.length) {
    console.error(`Empty values in hi-IN (${emptyInHi.length}):`);
    for (const k of emptyInHi) console.error(`  ${k}`);
  }
  process.exit(1);
}

console.log(`i18n parity OK: ${Object.keys(en).length} keys in both en-US and hi-IN.`);
