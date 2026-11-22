# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Only the version in flight is written out in full. A released version keeps its
heading and its link -- the entries live in the GitHub release for its tag,
which is where anyone comparing two deployments will look. This file stays
short enough to read in one screen.

## [2.1.1]

### Added

- The project site tells search engines and link previews what it is: a descriptive
  title, a canonical link, Open Graph and Twitter tags, schema.org structured data, a
  favicon, and `sitemap.xml`. `npm run site:check` checks them against each other and
  against the files in `site/`.
- A social preview image, `site/images/social-preview.png` (1280x640), rendered from
  `scripts/social-preview.html`: the image a link to the site shows, and the one to
  upload as the repository's social preview on GitHub.

### Security

- CodeQL 2.27.5 reported the plan API's JSON and YAML responses as reflected
  cross-site scripting (code scanning alerts 13-15), because they echo request text:
  `deploymentName` and validation and planning error messages. The responses are never
  HTML and are sent with `X-Content-Type-Options: nosniff`, so the alerts were false
  positives. The routes now set their content type in a way CodeQL recognizes;
  responses are unchanged.

## [2.1.0]

## [2.0.1]

## [2.0.0]

## [1.0.0]

---

[2.1.1]: https://github.com/nicholashoule/subnet-splitter/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/nicholashoule/subnet-splitter/compare/v2.0.1...v2.1.0
[2.0.1]: https://github.com/nicholashoule/subnet-splitter/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/nicholashoule/subnet-splitter/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/nicholashoule/subnet-splitter/releases/tag/v1.0.0
