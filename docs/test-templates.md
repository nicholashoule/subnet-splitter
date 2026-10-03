# Test Templates & Patterns

This file contains detailed test templates, examples, and API testing workflows extracted from the project's instruction files.

## Unit Test Template

```typescript
import { describe, it, expect } from "vitest";
import { functionToTest } from "@/lib/module";

describe("Module Name", () => {
  it("should do something specific", () => {
    const result = functionToTest(input);
    expect(result).toBe(expected);
  });

  it("should handle edge cases", () => {
    expect(() => functionToTest(invalidInput)).toThrow("Expected error message");
  });
});
```

## Integration Test Template

```typescript
import { describe, it, expect } from "vitest";
import request from "supertest";

describe("API Endpoint", () => {
  it("should return valid response", async () => {
    const res = await request(app)
      .post("/api/endpoint")
      .send({ key: "value" })
      .expect(200);

    expect(res.body).toHaveProperty("result");
  });

  it("should reject invalid input", async () => {
    const res = await request(app)
      .post("/api/endpoint")
      .send({})
      .expect(400);

    expect(res.body).toHaveProperty("error");
  });
});
```

## Test Organization Rules

- **File naming:** `{module}.test.ts` or `{feature}.test.ts`
- **Location:** `tests/unit/` for pure functions, `tests/integration/` for system features
- **Imports:** Use `@/` (client/src) and `@shared/` aliases; import server code, test helpers, and `package.json` relatively (they have no alias)
- **Grouping:** `describe()` blocks for related tests
- **Description:** Clear, specific `it()` descriptions stating expected behavior
- **Scope:** Each test verifies one thing

## Assertion Best Practices

```typescript
// Preferred: specific matchers
expect(value).toBe(42);              // Exact primitive match
expect(obj).toEqual({ a: 1 });       // Deep equality
expect(arr).toHaveLength(3);         // Array/string length
expect(fn).toThrow("message");       // Error with message

// Avoid: vague matchers
expect(value).toBeTruthy();          // Use toBe(true) or specific value
expect(value).toBeDefined();         // Use specific value check
```

## API Testing Workflow (Manual)

### Start Development Server

```bash
npm run dev
# Wait for the "Server started" log line (127.0.0.1:5000)
```

### Test JSON Output (Default)

```bash
curl -X POST http://127.0.0.1:5000/api/kubernetes/network-plan \
  -H "Content-Type: application/json" \
  -d '{"deploymentSize":"professional","provider":"eks"}'
```

### Test YAML Output

```bash
curl -X POST "http://127.0.0.1:5000/api/kubernetes/network-plan?format=yaml" \
  -H "Content-Type: application/json" \
  -d '{"deploymentSize":"enterprise","provider":"gke","vpcCidr":"10.0.0.0/16"}'
```

### Test Overrides and Zones

```bash
# Second cluster in the same network: explicit pod and service ranges
curl -X POST http://127.0.0.1:5000/api/kubernetes/network-plan \
  -H "Content-Type: application/json" \
  -d '{"deploymentSize":"professional","provider":"gke","vpcCidr":"10.1.0.0/16","podsCidr":"172.16.64.0/18","servicesCidr":"192.168.16.0/20"}'

# EKS with the zones your account has
curl -X POST http://127.0.0.1:5000/api/kubernetes/network-plan \
  -H "Content-Type: application/json" \
  -d '{"deploymentSize":"professional","provider":"eks","region":"ap-northeast-1","vpcCidr":"10.10.0.0/16","availabilityZones":["ap-northeast-1a","ap-northeast-1c"]}'
```

### Test Private Network Mode

```bash
# GKE private: subnets.public is [], subnets.loadBalancer has one regional proxy-only-sized subnet
curl -X POST http://127.0.0.1:5000/api/kubernetes/network-plan \
  -H "Content-Type: application/json" \
  -d '{"deploymentSize":"enterprise","provider":"gke","region":"us-central1","vpcCidr":"10.20.0.0/16","networkMode":"private"}'

# EKS private: internal load-balancer subnets in two AZs
curl -X POST http://127.0.0.1:5000/api/kubernetes/network-plan \
  -H "Content-Type: application/json" \
  -d '{"deploymentSize":"professional","provider":"eks","region":"us-east-1","vpcCidr":"10.30.0.0/16","networkMode":"private"}'
```

### Test Tier Info Endpoint

```bash
curl http://127.0.0.1:5000/api/kubernetes/tiers
curl "http://127.0.0.1:5000/api/kubernetes/tiers?provider=eks"
curl "http://127.0.0.1:5000/api/kubernetes/tiers?provider=gke&networkMode=private"
curl "http://127.0.0.1:5000/api/kubernetes/tiers?format=yaml"
curl "http://127.0.0.1:5000/api/kubernetes/tiers?provider=foo"        # 400 INVALID_REQUEST
curl "http://127.0.0.1:5000/api/kubernetes/tiers?networkMode=isolated" # 400 INVALID_REQUEST (names networkMode)
```

### Validation Checklist

- JSON: parses correctly with `JSON.parse()`
- YAML: valid structure (keys with colons, proper indentation)
- Both formats have identical data structure
- All subnet details present in output (`subnets.public`, `subnets.private`, `subnets.loadBalancer`, `subnets.controlPlane`), plus top-level `networkMode`
- No two ranges overlap; pods and services are outside the VPC
- `metadata.version` is `"2.0"`; `warnings` appears only for a VPC overlapping `172.17.0.0/16`
- GKE and AKS subnets have no `availabilityZone`; EKS subnets span at least two AZs
- Control plane is one network: one `/28` for GKE, AKS, and generic; exactly two contiguous `/28`s (one `/27`) in two AZs for EKS
- Public mode: `subnets.loadBalancer` is `[]`. Private mode: `subnets.public` is `[]` and `subnets.loadBalancer` holds `load-balancer` subnets (GKE and AKS: exactly one; EKS: one per AZ, at least two)
- Error responses use requested format

## Running Specific Test Subsets

```bash
# All API tests (48 tests)
npm run test -- tests/integration/kubernetes-network-api.test.ts --run

# Filter by test name
npm run test -- tests/integration/kubernetes-network-api.test.ts -t "Output Format" --run

# Control-plane and private-mode invariants
npm run test -- tests/unit/network-separation.test.ts -t "Control plane is one network" --run
npm run test -- tests/unit/network-separation.test.ts -t "Private network mode" --run

# All unit tests
npm run test -- tests/unit/ --run

# All integration tests
npm run test -- tests/integration/ --run

# Emoji detection only
npm run test:emoji
```

## Test Configuration Details

| Setting | Value |
|---------|-------|
| Framework | Vitest 5 (^5.0.0) |
| Discovery | `tests/**/*.test.ts` |
| Environment | Node.js |
| Globals | `describe`, `it`, `expect` available without imports |
| Module resolution | `@/` (client/src) and `@shared/` aliases, shared with `vite.config.ts` |
| Type checking | TypeScript strict mode |
| Config file | `vitest.config.ts` |

## Git Commit Convention Examples

Full examples for commit messages (referenced from general instructions):

```
feat(validation): validate network address matches CIDR prefix

- Ensure IP address is the network address for given prefix
- Reject inputs like 192.168.1.5/24 (must be 192.168.1.0/24)
- Add clear error messages to guide users
- Use custom SubnetCalculationError for specific handling
```

```
fix(errors): prevent invalid state transitions in split operations

- Add state validation before splitting subnets
- Check subnet exists, can be split, and has no children
- Log validation failures for debugging
- Show toast notification for failed operations
```

```
chore: expand .gitignore for cross-platform coverage

- Add comprehensive macOS file exclusions
- Add Windows and Linux specific patterns
- Organize with clear section headers
```
