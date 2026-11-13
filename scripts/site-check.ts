/**
 * Checks the GitHub Pages site in site/ before it is published: the page exists, is
 * bounded in size, declares a title, a language, a viewport, and a description, every
 * relative link or source is a file inside site/, and no link uses plain HTTP or runs
 * script. It also checks what search engines and link previews read: the canonical URL,
 * the Open Graph and Twitter tags, the preview image, structured data, and the sitemap.
 * The site is hand-written HTML with no build step, so this is its only check.
 *
 * Usage: npm run site:check [-- DIR], where DIR defaults to site.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// A hand-written page is tens of kilobytes.
const MAX_PAGE = 4 << 20;

// Search results cut a description off near this many characters.
const MAX_DESCRIPTION = 160;

// GitHub's social preview takes at most 1 MB, and some link previews drop larger images.
const MAX_PREVIEW_IMAGE = 1 << 20;

const REQUIRED: Array<[marker: string, what: string]> = [
  ["<title>", "a <title>"],
  ["<html lang=", "a lang attribute on <html>"],
  ['name="viewport"', "a viewport meta tag, for phones"],
  ['name="description"', "a description meta tag"],
];

// Without these a shared link shows as a bare URL. X reads the Open Graph tags for
// everything but the card type.
const REQUIRED_PREVIEW = ["og:type", "og:url", "og:title", "og:description", "og:image", "og:image:alt", "twitter:card"];

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
  problems.push(...checkSharing(dir, html));
  for (const ref of references(html)) {
    const problem = checkReference(dir, ref);
    if (problem) problems.push(problem);
  }
  return problems;
}

/**
 * Returns the problems with what search engines and link previews read from the page.
 * The canonical link says where the site is published. Previews do not resolve relative
 * addresses, so og:url must repeat it and each preview image must be a file in dir
 * addressed under it; a declared image size must be the file's real size. Structured
 * data must parse, and sitemap.xml must list the canonical URL.
 */
export function checkSharing(dir: string, html: string): string[] {
  const problems: string[] = [];

  const description = metaContent(html, "description");
  if (description !== undefined && description.length > MAX_DESCRIPTION) {
    problems.push(`description is ${description.length} characters; search results cut it off near ${MAX_DESCRIPTION}`);
  }

  let canonical = linkHref(html, "canonical");
  if (canonical === undefined) {
    problems.push("index.html lacks a canonical link");
  } else if (!/^https:\/\/[^/?#]+\/([^?#]*\/)?$/.test(canonical)) {
    problems.push(`canonical link must be an HTTPS URL that ends in /: ${canonical}`);
    canonical = undefined;
  }
  for (const key of REQUIRED_PREVIEW) {
    if (metaContent(html, key) === undefined) problems.push(`index.html lacks a ${key} meta tag`);
  }

  const jsonLd = /<script\b[^>]*\stype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(jsonLd)) {
    try {
      JSON.parse(m[1]);
    } catch (err) {
      problems.push(`structured data is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // The rest compares addresses with the canonical URL, so it waits for a sound one.
  if (canonical === undefined) return problems;

  const url = metaContent(html, "og:url");
  if (url !== undefined && url !== canonical) {
    problems.push(`og:url differs from the canonical link ${canonical}: ${url}`);
  }
  for (const key of ["og:image", "twitter:image"]) {
    const image = metaContent(html, key);
    if (image !== undefined) problems.push(...checkPreviewImage(dir, html, canonical, key, image));
  }

  const sitemap = path.join(dir, "sitemap.xml");
  if (!existsSync(sitemap)) {
    problems.push(`sitemap.xml is not in ${dir}`);
  } else if (!readFileSync(sitemap, "utf8").includes(`<loc>${canonical}</loc>`)) {
    problems.push(`sitemap.xml does not list the canonical URL ${canonical}`);
  }
  return problems;
}

/** Returns the problems with one preview image, named by the meta tag key. */
function checkPreviewImage(dir: string, html: string, canonical: string, key: string, image: string): string[] {
  const local = image.startsWith(canonical) ? image.slice(canonical.length) : "";
  if (local === "") {
    return [`${key} must be the full URL of a file under ${canonical}, since previews do not resolve relative addresses: ${image}`];
  }
  const problem = checkReference(dir, local);
  if (problem) return [`${key} ${problem}`];

  const problems: string[] = [];
  const file = path.resolve(dir, decodeURIComponent(local.split("#")[0].split("?")[0]));
  const stat = statSync(file);
  if (!stat.isFile()) return [`${key} is not a file: ${local}`];
  if (stat.size > MAX_PREVIEW_IMAGE) {
    problems.push(`${key} is ${stat.size} bytes, larger than ${MAX_PREVIEW_IMAGE}: ${local}`);
  }
  const size = pngSize(file);
  const width = metaContent(html, `${key}:width`);
  const height = metaContent(html, `${key}:height`);
  if (size && (width !== undefined || height !== undefined) && (width !== String(size.width) || height !== String(size.height))) {
    problems.push(`${key}:width and ${key}:height say ${width ?? "?"}x${height ?? "?"}, but ${local} is ${size.width}x${size.height}`);
  }
  return problems;
}

/** Returns a PNG's size in pixels from its header, or undefined when the file is not a PNG. */
function pngSize(file: string): { width: number; height: number } | undefined {
  const head = readFileSync(file).subarray(0, 24);
  if (head.length < 24 || head.readUInt32BE(0) !== 0x89504e47 || head.toString("latin1", 12, 16) !== "IHDR") {
    return undefined;
  }
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

/**
 * Returns the content of the first meta tag whose name or property is key, or undefined
 * when there is none. Open Graph tags use property; the rest use name.
 */
export function metaContent(html: string, key: string): string | undefined {
  for (const tag of tags(html, "meta")) {
    if ((attribute(tag, "property") ?? attribute(tag, "name")) === key) return attribute(tag, "content");
  }
  return undefined;
}

/** Returns the href of the first link tag whose rel is rel, or undefined when there is none. */
function linkHref(html: string, rel: string): string | undefined {
  for (const tag of tags(html, "link")) {
    if (attribute(tag, "rel") === rel) return attribute(tag, "href");
  }
  return undefined;
}

/** Returns every opening tag with this name. A quoted value may contain ">". */
function tags(html: string, name: string): string[] {
  return html.match(new RegExp(`<${name}\\b(?:"[^"]*"|'[^']*'|[^>"'])*>`, "gi")) ?? [];
}

/** Returns the quoted value of an attribute in a tag, or undefined when it is absent. */
function attribute(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}=(?:"([^"]*)"|'([^']*)')`, "i").exec(tag);
  return m ? (m[1] ?? m[2]) : undefined;
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
    console.log(`ok   ${dir}: index.html, its link preview tags, and every file it references`);
  } catch (err) {
    console.error(`site: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }
}
