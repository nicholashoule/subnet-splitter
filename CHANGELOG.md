# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Only the version in flight is written out in full. A released version keeps its
heading and its link -- the entries live in the GitHub release for its tag,
which is where anyone comparing two deployments will look. This file stays
short enough to read in one screen.

## [2.1.0]

### Changed

- Every tier now holds its stated node count on every provider. Plans report
  `metadata.version` `"2.1"`:
  - Hyperscale's pod range is `/11` (was `/13`): 8,192 nodes at a `/24` per node,
    enough for 5,000 nodes on AKS, GKE, and self-hosted clusters by default. For a
    VPC in `10.0.0.0/8` the pods are `100.64.0.0/11`.
  - GKE hyperscale gets one `/19` node subnet (8,188 nodes) instead of 3 x `/20`,
    since a GKE cluster takes its nodes from one subnet.
  - EKS professional gets `/22` node subnets (minimum VPC `/20`, was `/21`), so the
    default VPC CNI holds 18 nodes at 110 pods per node, above the tier's 10.
- A plan request with a non-JSON `Content-Type` gets `415` "Content-Type must be
  application/json", and one with no body gets `400` "Request body must be a JSON
  object", instead of a schema error about `undefined`.
- API request validation now uses Zod 4. Invalid or missing enum fields name the
  accepted values, e.g. `deploymentSize: Invalid option: expected one of
  "micro"|"standard"|"professional"|"enterprise"|"hyperscale"` (previously
  `deploymentSize: Required`). The `INVALID_REQUEST` code and 400 status are
  unchanged.

### Security

- Update the `qs` override to 6.16.1, the patched release; `npm audit` reports 0
  vulnerabilities.
- Update `express-rate-limit` to 8.7.3 and Zod to 4.6.7, along with Vite 8.3.6,
  Vitest 5.1.0, and Tailwind CSS 4.3.4.

### Fixed

- The calculator labels `0.0.0.0/8` and `127.0.0.0/8` networks, and subnets of them,
  as Class A instead of "Unknown" (RFC 791: Class A is every address with a leading
  0 bit).
- The API reference shows the validation messages the API returns with Zod 4.

### Documentation

- The README is a short overview. Setup, build, configuration, testing, CI, and
  contributing move to `docs/development.md`, and API detail lives in `docs/api.md`.
- `docs/security.md` (was `docs/compliance/security-reference.md`) holds the security
  configuration, and `SECURITY.md` keeps the policy and links to it.
- `docs/kubernetes.md` (was `docs/compliance/kubernetes-network-reference.md`)
  explains how plans are laid out, the tiers, and the sizing formulas.
- `docs/compliance/README.md` (was `ip-allocation-cross-reference.md`) compares the
  providers and links to each audit; the audits drop their region lists (linking to
  each provider's own), roadmaps, and status logs.
- Docs no longer carry figures that go stale: test counts, pass rates, grades, and
  dates. The test inventory is in `tests/README.md`.
- Release headings in this file no longer carry dates; each release's date is on its
  GitHub release.

### Added

- A project site on GitHub Pages, published from `site/` by the Pages workflow, with
  `npm run site:check` to check the page and every file it references.

## [2.0.1]

## [2.0.0]

## [1.0.0]

---

[2.1.0]: https://github.com/nicholashoule/subnet-splitter/compare/v2.0.1...v2.1.0
[2.0.1]: https://github.com/nicholashoule/subnet-splitter/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/nicholashoule/subnet-splitter/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/nicholashoule/subnet-splitter/releases/tag/v1.0.0
