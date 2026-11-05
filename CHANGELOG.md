# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Only the version in flight is written out in full. A released version keeps its
heading and its link -- the entries live in the GitHub release for its tag,
which is where anyone comparing two deployments will look. This file stays
short enough to read in one screen.

## [2.0.2]

### Security

- Update the `qs` override to 6.16.1, the patched release; `npm audit` reports 0
  vulnerabilities.
- Update `express-rate-limit` to 8.7.3 and Zod to 4.6.7, along with Vite 8.3.6,
  Vitest 5.1.0, and Tailwind CSS 4.3.4.

### Changed

- API request validation now uses Zod 4. Invalid or missing enum fields name the
  accepted values, e.g. `deploymentSize: Invalid option: expected one of
  "micro"|"standard"|"professional"|"enterprise"|"hyperscale"` (previously
  `deploymentSize: Required`). The `INVALID_REQUEST` code and 400 status are
  unchanged.

### Fixed

- The calculator labels `0.0.0.0/8` and `127.0.0.0/8` networks, and subnets of them,
  as Class A instead of "Unknown" (RFC 791: Class A is every address with a leading
  0 bit).
- The API reference shows the validation messages the API returns with Zod 4.

### Documentation

- The README is a short overview. Setup, build, configuration, testing, CI, and
  contributing move to `docs/development.md`, and API detail lives in `docs/api.md`.
- Docs no longer carry figures that go stale: test counts, pass rates, grades, and
  "Last Updated" dates. The test inventory is in `tests/README.md`.
- Release headings in this file no longer carry dates; each release's date is on its
  GitHub release.

### Added

- A project site on GitHub Pages, published from `site/` by the Pages workflow, with
  `npm run site:check` to check the page and every file it references.

## [2.0.1]

## [2.0.0]

## [1.0.0]

---

[2.0.2]: https://github.com/nicholashoule/subnet-splitter/compare/v2.0.1...v2.0.2
[2.0.1]: https://github.com/nicholashoule/subnet-splitter/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/nicholashoule/subnet-splitter/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/nicholashoule/subnet-splitter/releases/tag/v1.0.0
