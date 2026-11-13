/**
 * tests/unit/site-check.test.ts
 *
 * The GitHub Pages site check (scripts/site-check.ts): the real site passes, and each
 * kind of bad reference, missing tag, or broken link preview is reported.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { checkReference, checkSharing, checkSite, metaContent, references } from "../../scripts/site-check";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const siteDir = path.resolve(__dirname, "../../site");

const BASE = "https://example.org/site/";

/** A page that passes beside SOUND_SITEMAP and a 1280x640 card.png; tests break one thing in a copy. */
const SOUND_PAGE = `<!doctype html><html lang="en"><head>
<meta name="viewport" content="width=device-width"><meta name="description" content="x">
<title>t</title>
<link rel="canonical" href="${BASE}">
<meta property="og:type" content="website">
<meta property="og:url" content="${BASE}">
<meta property="og:title" content="t">
<meta property="og:description" content="x">
<meta property="og:image" content="${BASE}card.png">
<meta property="og:image:width" content="1280">
<meta property="og:image:height" content="640">
<meta property="og:image:alt" content="a">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite"}</script>
</head><body><img src="a.png"><a href="#top">top</a></body></html>`;

const SOUND_SITEMAP = `<urlset><url><loc>${BASE}</loc></url></urlset>`;

/** The first 24 bytes of a PNG of this size, which is all the check reads. */
function pngHeader(width: number, height: number): Buffer {
  const head = Buffer.alloc(24);
  head.writeUInt32BE(0x89504e47, 0);
  head.writeUInt32BE(0x0d0a1a0a, 4);
  head.writeUInt32BE(13, 8);
  head.write("IHDR", 12, "latin1");
  head.writeUInt32BE(width, 16);
  head.writeUInt32BE(height, 20);
  return head;
}

describe("site check", () => {
  let dir: string;
  let bare: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "site-check-"));
    fs.writeFileSync(path.join(dir, "a.png"), "");
    fs.writeFileSync(path.join(dir, "card.png"), pngHeader(1280, 640));
    fs.writeFileSync(path.join(dir, "big.png"), Buffer.concat([pngHeader(1280, 640), Buffer.alloc(1 << 20)]));
    fs.writeFileSync(path.join(dir, "sitemap.xml"), SOUND_SITEMAP);
    fs.mkdirSync(path.join(dir, "images"));
    // The same site without a sitemap.
    bare = fs.mkdtempSync(path.join(os.tmpdir(), "site-check-bare-"));
    fs.writeFileSync(path.join(bare, "card.png"), pngHeader(1280, 640));
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(bare, { recursive: true, force: true });
  });

  it("passes the published site", () => {
    expect(checkSite(siteDir)).toEqual([]);
  });

  it("passes a sound page", () => {
    fs.writeFileSync(path.join(dir, "index.html"), SOUND_PAGE);
    expect(checkSite(dir)).toEqual([]);
  });

  it("reports each missing tag", () => {
    fs.writeFileSync(path.join(dir, "index.html"), "<html><body></body></html>");
    expect(checkSite(dir)).toEqual([
      "index.html lacks a <title>",
      "index.html lacks a lang attribute on <html>",
      "index.html lacks a viewport meta tag, for phones",
      "index.html lacks a description meta tag",
      "index.html lacks a canonical link",
      "index.html lacks a og:type meta tag",
      "index.html lacks a og:url meta tag",
      "index.html lacks a og:title meta tag",
      "index.html lacks a og:description meta tag",
      "index.html lacks a og:image meta tag",
      "index.html lacks a og:image:alt meta tag",
      "index.html lacks a twitter:card meta tag",
    ]);
  });

  it("finds href and src in any case and quoting, but not data-src", () => {
    expect(references(`<a HREF="x"> <img src='y'> <a href=z> <img data-src="no">`)).toEqual(["x", "y", "z"]);
  });

  it.each([
    ["http://example.com", "plain HTTP link"],
    ["javascript:alert(1)", "script link"],
    ["VBScript:x", "script link"],
    ["data:text/html,x", "data: URL"],
    ["//example.com/a.js", "protocol-relative link"],
    ["/images/a.png", "absolute path"],
    ["../package.json", "outside"],
    ["missing.png", "not in"],
    ["%E0%A4%A.png", "badly percent-encoded"],
  ])("refuses %s", (ref, problem) => {
    expect(checkReference(dir, ref)).toContain(problem);
  });

  it.each(["#top", "https://github.com", "mailto:a@b.c", "a.png", "a.png#x", "a%2Epng"])("accepts %s", (ref) => {
    expect(checkReference(dir, ref)).toBe("");
  });

  describe("search and link previews", () => {
    /** The one problem checkSharing finds once `from` in the sound page is replaced with `to`. */
    function problemAfter(from: string, to: string, site = dir): string {
      expect(SOUND_PAGE).toContain(from);
      const problems = checkSharing(site, SOUND_PAGE.replace(from, to));
      expect(problems).toHaveLength(1);
      return problems[0];
    }

    it("reads a meta tag by name or property, in either quoting and attribute order", () => {
      const html = `<meta name="description" content="a > b"><META content='c' property='og:title'><meta name="empty">`;
      expect(metaContent(html, "description")).toBe("a > b");
      expect(metaContent(html, "og:title")).toBe("c");
      expect(metaContent(html, "empty")).toBeUndefined();
      expect(metaContent(html, "og:image")).toBeUndefined();
    });

    it("reports a description that search results would cut off", () => {
      const long = "x".repeat(161);
      expect(problemAfter('name="description" content="x"', `name="description" content="${long}"`)).toContain(
        "description is 161 characters",
      );
      const longest = "x".repeat(160);
      expect(checkSharing(dir, SOUND_PAGE.replace('name="description" content="x"', `name="description" content="${longest}"`))).toEqual([]);
    });

    it.each([
      "http://example.org/site/",
      "https://example.org/site",
      "https://example.org/site/?page=1",
      "/site/",
    ])("refuses the canonical link %s", (canonical) => {
      expect(problemAfter(`rel="canonical" href="${BASE}"`, `rel="canonical" href="${canonical}"`)).toContain(
        "canonical link must be an HTTPS URL that ends in /",
      );
    });

    it("reports an og:url that is not the canonical link", () => {
      expect(problemAfter(`og:url" content="${BASE}"`, `og:url" content="${BASE}index.html"`)).toContain(
        "og:url differs from the canonical link",
      );
    });

    it.each([
      ["card.png", "must be the full URL of a file under"],
      ["https://other.example/card.png", "must be the full URL of a file under"],
      [BASE, "must be the full URL of a file under"],
      [`${BASE}missing.png`, "og:image references a file that is not in"],
      [`${BASE}../card.png`, "og:image references a file outside"],
      [`${BASE}images`, "og:image is not a file"],
      [`${BASE}big.png`, "larger than 1048576"],
    ])("refuses the preview image %s", (image, problem) => {
      expect(problemAfter(`og:image" content="${BASE}card.png"`, `og:image" content="${image}"`)).toContain(problem);
    });

    it("reports a declared image size that is not the file's", () => {
      expect(problemAfter('og:image:height" content="640"', 'og:image:height" content="630"')).toBe(
        "og:image:width and og:image:height say 1280x630, but card.png is 1280x640",
      );
    });

    it("checks twitter:image the way it checks og:image", () => {
      const tag = '<meta name="twitter:card" content="summary_large_image">';
      expect(checkSharing(dir, SOUND_PAGE.replace(tag, `${tag}<meta name="twitter:image" content="${BASE}card.png">`))).toEqual([]);
      expect(problemAfter(tag, `${tag}<meta name="twitter:image" content="${BASE}missing.png">`)).toContain(
        "twitter:image references a file that is not in",
      );
    });

    it("reports structured data that is not JSON", () => {
      expect(problemAfter('"@type":"WebSite"}', '"@type":"WebSite",}')).toContain("structured data is not valid JSON");
    });

    it("reports a sitemap that is missing or does not list the canonical URL", () => {
      expect(checkSharing(bare, SOUND_PAGE)).toEqual([`sitemap.xml is not in ${bare}`]);
      fs.writeFileSync(path.join(bare, "sitemap.xml"), SOUND_SITEMAP.replace(BASE, `${BASE}other/`));
      expect(checkSharing(bare, SOUND_PAGE)).toEqual([`sitemap.xml does not list the canonical URL ${BASE}`]);
    });
  });
});
