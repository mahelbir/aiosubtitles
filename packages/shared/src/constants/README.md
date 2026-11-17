## Rules

- **Enum name** → `PascalCase` — e.g. `Permission`, `ErrorCode`
- **Enum member** → `CONSTANT_CASE` — e.g. `Permission.ADMIN`
- **Global constant** → `CONSTANT_CASE` — e.g. `MAX_PAGE_SIZE`
- **Local constant** (inside a function) → `camelCase` — e.g. `calculatedTotal`

## What lives here

- **Enum** (closed set of options: permission, error code) → a single named `Enum`
  object with `CONSTANT_CASE` members. e.g. `ErrorCode.VALIDATION_ERROR`.
- **Constant** (limit / default / magic number) → a direct
  `export const NAME = value`, not a namespace object.
