# People Tab Fuzzy Name Search

## Overview

Add a fuzzy search input to the PeopleToolbar that filters the person grid by name using Fuse.js.

## Behavior

- Text input in PeopleToolbar with placeholder "Search people..."
- Fuse.js filters on `display_name` with threshold `0.4`, `ignoreLocation: true`
- Non-matching people are filtered out; grid reflows
- Instant client-side filtering, no debounce, no URL persistence
- Empty search shows all people

## Components Changed

### PeopleToolbar.tsx

Add a controlled text input. Accept an `onSearchChange: (query: string) => void` prop (or equivalent) to notify the parent of query changes.

### PeopleGrid.tsx (or parent)

Apply Fuse.js filtering to the `persons` array before passing to the grid. When query is empty, pass all persons. When query is non-empty, pass only Fuse.js matches.

## Fuse.js Configuration

```ts
new Fuse(persons, {
  keys: ['display_name'],
  threshold: 0.4,
  ignoreLocation: true,
  minMatchCharLength: 1,
})
```

## Scope Exclusions

- No filtering of similar groups section
- No search history or suggestions
- No keyboard shortcut to focus search
- No URL persistence (transient in-view filter)
