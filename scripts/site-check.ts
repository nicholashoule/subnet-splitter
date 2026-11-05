/**
 * Checks the GitHub Pages site in site/ before it is published: the page exists, is
 * bounded in size, declares a title, a language, a viewport, and a description, every
 * relative link or source is a file inside site/, and no link uses plain HTTP or runs
 * script. The site is hand-written HTML with no build step, so this is its only check.
 *
 * Usage: npm run site:check [-- DIR], where DIR defaults to site.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// A hand-written page is tens of kilobytes.
const MAX_PAGE = 4 << 20;

const REQUIRED: Array<[marker: string, what: string]> = [
  ["<title>", "a <title>"],
  ["<html lang=", "a lang attribute on <html>"],
  ['name="viewport"', "a viewport meta tag, for phones"],
  ['name="description"', "a description meta tag"],
];

/** Returns the problems with the site in dir; throws when the page cannot be read. */
export function checkSite(dir: string): string[] {
  const page = path.join(dir, "index.html");
  const size = statSync(page).size;
  if (size > MAX_PAGE) {
    throw new Error(`${page} is ${size} bytes, larger than ${MAX_PAGE}`);
  }
  const html = readFileSync(page, "utf8");
  const problems: string[] = [];
  for (const [marker, what] of REQUIRED) {
    if (!html.includes(marker)) problems.push(`index.html lacks ${what}`);
  }
  for (const ref of references(html)) {
    const problem = checkReference(dir, ref);
    if (problem) problems.push(problem);
  }
  return problems;
}

/**
 * Returns the problem with one reference, or "". Other sites must use HTTPS; schemes
 * that can carry script are refused; any other scheme, such as mailto:, is left alone.
 * Everything else names a file, which must exist inside dir, since only dir is published.
 */
export function checkReference(dir: string, raw: string): string {
  const ref = raw.trim();
  const lower = ref.toLowerCase();
  if (ref === "" || ref.startsWith("#")) return "";
  if (lower.startsWith("http:")) return `plain HTTP link: ${ref}`;
  if (lower.startsWith("javascript:") || lower.startsWith("vbscript:")) {
    return `script link, which runs code when followed: ${ref}`;
  }
  if (lower.startsWith("data:")) return `data: URL, which can carry script; make it a file in ${dir}: ${ref}`;
  if (ref.startsWith("//")) return `protocol-relative link, which may load over plain HTTP: ${ref}`;
  if (/^[a-z][a-z0-9+.-]*:/i.test(ref)) return "";
  if (ref.startsWith("/")) return `absolute path, which breaks under a project page's prefix: ${ref}`;

  const local = ref.split("#")[0].split("?")[0];
  let decoded: string;
  try {
    decoded = decodeURIComponent(local);
  } catch {
    return `badly percent-encoded reference: ${ref}`;
  }
  const root = path.resolve(dir);
  const target = path.resolve(root, decoded);
  const rel = path.relative(root, target);
  if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    return `references a file outside ${dir}, which is not published: ${ref}`;
  }
  if (!existsSync(target)) return `references a file that is not in ${dir}: ${ref}`;
  return "";
}

/**
 * Returns the value of every href and src attribute, in any case, quoted or not. The
 * page is hand-written, so a scan is enough. An attribute counts only after whitespace,
 * so data-src is not src.
 */
export function references(html: string): string[] {
  const refs: string[] = [];
  const attr = /\s(?:href|src)=(?:"([^"]*)"?|'([^']*)'?|([^\s>]*))/gi;
  for (const m of html.matchAll(attr)) {
    refs.push(m[1] ?? m[2] ?? m[3] ?? "");
  }
  return refs;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const dir = process.argv[2] ?? "site";
  try {
    const problems = checkSite(dir);
    for (const p of problems) console.error(`site: ${p}`);
    if (problems.length > 0) process.exit(1);
    console.log(`ok   ${dir}: index.html and every file it references`);
  } catch (err) {
    console.error(`site: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }
}
