# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Only the version in flight is written out in full. A released version keeps its
heading and its link -- the entries live in the GitHub release for its tag,
which is where anyone comparing two deployments will look. This file stays
short enough to read in one screen.

## [2.0.1] - in flight

- **The rate limiters no longer run a vulnerable IPv6 parser on client addresses.** `ip-address`, which `express-rate-limit` uses to key IPv6 clients, moves from 10.7.2 to 10.7.4 (GHSA-rxp7-6hxx-x8q5: a long zone identifier was matched in quadratic time). Only a deployment with `TRUST_PROXY=true` let a client choose that address, through `X-Forwarded-For`; the default, a hop count and a proxy list take it from the socket or from the proxy you trust. The same update moves Express to 5.3.0 and `express-rate-limit` to 8.7.1.
- **Vite 8.3.5 and Vitest 5.0.5 close the open Dependabot alerts.** Vite 8.3.0 had six advisories: three in its bundled `launch-editor` (Dependabot #46-#48: GHSA-587h-7wmj-h5pm, high, and GHSA-698v-4r3x-3vcv on Windows; GHSA-r825-w8mm-5pxw) and three in the dev server (GHSA-9jrq-w75r-8gcw, GHSA-rq7h-c2jc-7f22, GHSA-vfpm-58rq-9qcg). Vitest 5.0.1 had two in `@vitest/mocker` (GHSA-qxg6-89mg-rqv8, GHSA-xp26-3454-mjgp). Neither package is loaded by the production server; they matter to anyone running `npm run dev`, the build or the tests. `npm audit` reports 0 vulnerabilities.
- **Plan requests that pass `podsCidr` or `servicesCidr` without `vpcCidr` no longer fail at random.** The generated VPC was chosen before those ranges were read, so it could land inside them, and the request got 400 `NETWORK_GENERATION_ERROR` ("podsCidr 10.0.0.0/8 overlaps the VPC 10.39.128.0/18") for a VPC the caller never chose: about one request in three with `podsCidr` `10.0.0.0/8` or `servicesCidr` `192.168.0.0/16`, and about 4% with the hyperscale AKS `/11` pod range the API docs recommend. The random `/18` now avoids both ranges and skips an RFC 1918 block they fill.
- **A plan that fails the generator's own output check is answered 500 and logged**, not 400 "Invalid request", which blamed the caller for a bug. No input is known to reach it.
- **repogov replaces the hand-written instruction-file workflow, and the pre-commit hook runs it before the emoji check.** `npm run governance:check` (repogov v0.9.0, configured in `.github/repogov-config.json`) keeps what `validate-instructions.yml` enforced (`applyTo` front matter on `.github/instructions/*.instructions.md`, at most 200 lines each, at most 10 for `.github/copilot-instructions.md`) and adds a check of its config, the `.github/` layout and every Markdown file's line limit (500 unless the config sets one; the longest docs have their own). The old workflow's loop skipped files whose names held glob characters, such as `[a].instructions.md`, and only ran when instruction files changed; repogov runs on every push and pull request. CI's `repo-checks` job and the hook run repogov, then demojify, and stop at the first failure; the hook checks only the staged files and skips a tool it cannot build. The old workflow's check that instruction files never mention ssh is dropped.
- **The emoji check runs demojify v1.2.0**, whose `-fix` and `-sub` no longer delete a zero width joiner inside script text such as Devanagari. Flags, exit codes and findings on emoji are unchanged.
- **Development and CI hardening from a security review.** `npm run dev` no longer exits when a request makes Vite log an error (one GET to `/index.html?html-proxy&index=0.js` stopped it). `vite.config.ts` drops a `server.fs.deny` list the dev server never applied and that, used directly, would have replaced Vite's default list (which refuses `.git`, `.env` and key files). CI checkouts set `persist-credentials: false`, so later steps cannot read the job token from `.git/config`. `scripts/build.ts` works from the repo root wherever it is started; started elsewhere, it deleted that directory's `dist`. The API docs state the real 415 rule: a `Content-Type` charset must be a UTF encoding (`latin1` and `us-ascii` get 415). SECURITY.md notes that the pre-commit hook runs the checked-out branch's code.

## [2.0.0] - 2026-10-03

## [1.0.0] - 2026-09-29

---

[2.0.1]: https://github.com/nicholashoule/subnet-splitter/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/nicholashoule/subnet-splitter/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/nicholashoule/subnet-splitter/releases/tag/v1.0.0
