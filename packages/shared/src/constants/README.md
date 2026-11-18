## Rules

- **Every name is subject first, then property** — e.g. `SubtitleSource`, `SUBTITLE_SEARCH_DEADLINE`,
  `subtitleDownloadCount`; never a bare `count`, `key`, `data` or `timeout`.
- **Enum name** → `PascalCase` — e.g. `SubtitleSource`, `ErrorCode`
- **Enum member** → `CONSTANT_CASE` — e.g. `SubtitleSource.OPENSUBTITLES_V3`
- **Stored enum value** → lower-case kebab-case — e.g. `opensubtitles-v3`
- **Global constant** → `CONSTANT_CASE` — e.g. `MAX_PAGE_SIZE`
- **Local constant** (inside a function) → `camelCase` — e.g. `calculatedTotal`

## What lives here

- **Enum** (closed set of options: subtitle source, error code) → a single named `Enum`
  object with `CONSTANT_CASE` members. e.g. `ErrorCode.VALIDATION_ERROR`.
- **Constant** (limit / default / magic number) → a direct
  `export const NAME = value`, not a namespace object.
