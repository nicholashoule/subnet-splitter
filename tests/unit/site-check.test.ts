/**
 * tests/unit/site-check.test.ts
 *
 * The GitHub Pages site check (scripts/site-check.ts): the real site passes, and each
 * kind of bad reference or missing meta tag is reported.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { checkReference, checkSite, references } from "../../scripts/site-check";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const siteDir = path.resolve(__dirname, "../../site");

const SOUND_PAGE = `<!doctype html><html lang="en"><head>
<meta name="viewport" content="width=device-width"><meta name="description" content="x">
<title>t</title></head><body><img src="a.png"><a href="#top">top</a></body></html>`;

describe("site check", () => {
  let dir: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "site-check-"));
    fs.writeFileSync(path.join(dir, "a.png"), "");
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("passes the published site", () => {
    expect(checkSite(siteDir)).toEqual([]);
  });

  it("passes a sound page", () => {
    fs.writeFileSync(path.join(dir, "index.html"), SOUND_PAGE);
    expect(checkSite(dir)).toEqual([]);
  });

  it("reports each missing meta tag", () => {
    fs.writeFileSync(path.join(dir, "index.html"), "<html><body></body></html>");
    expect(checkSite(dir)).toEqual([
      "index.html lacks a <title>",
      "index.html lacks a lang attribute on <html>",
      "index.html lacks a viewport meta tag, for phones",
      "index.html lacks a description meta tag",
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
});
