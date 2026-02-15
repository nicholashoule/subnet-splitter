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
- **Imports:** Always use `@/` path aliases, never relative paths
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
# Wait for: "serving on 127.0.0.1:5000"
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

### Test Tier Info Endpoint

```bash
curl http://127.0.0.1:5000/api/kubernetes/tiers
curl "http://127.0.0.1:5000/api/kubernetes/tiers?format=yaml"
```

### Validation Checklist

- JSON: parses correctly with `JSON.parse()`
- YAML: valid structure (keys with colons, proper indentation)
- Both formats have identical data structure
- All subnet details present in output
- Error responses use requested format

## Running Specific Test Subsets

```bash
# All API tests (33 tests)
npm run test -- tests/integration/kubernetes-network-api.test.ts --run

# Filter by test name
npm run test -- tests/integration/kubernetes-network-api.test.ts -t "Output Format" --run

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
| Framework | Vitest 3+ (^3.0.0) |
| Discovery | `tests/**/*.test.ts` |
| Environment | Node.js |
| Globals | `describe`, `it`, `expect` available without imports |
| Module resolution | `@/` prefix path aliases |
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
