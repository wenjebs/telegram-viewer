# People Tab Fuzzy Name Search

## Overview

Add a fuzzy search input to the PeopleToolbar that filters the person grid by name using Fuse.js.

## Behavior

- Text input in PeopleToolbar with placeholder "Search people..."
- Fuse.js filters on `display_name` with threshold `0.4` (tighter than sidebar's `0.5` because display names are shorter)
- Non-matching people are filtered out; grid reflows
- Instant client-side filtering, no debounce (person count expected under ~500; revisit if list grows large)
- No URL persistence — transient in-view filter
- Empty search shows all people
- When search is active with no matches, show "No matches" (distinct from the no-data "Run a face scan" empty state)
- When search is active, similar group sections are hidden — display flat filtered results only

## Components Changed

### PeopleToolbar.tsx

Add a controlled text input. Accept an `onSearchChange: (query: string) => void` prop to notify the parent of query changes.

### index.tsx (route component)

Owns the search query state and Fuse.js filtering. Filters `data.persons.persons` before passing to `PeopleGrid`. PeopleGrid remains a pure presentational component.

## Fuse.js Configuration

```ts
new Fuse(persons, {
  keys: ['display_name'],
  threshold: 0.4,
  ignoreLocation: true,
  minMatchCharLength: 1,
})
```

Only `display_name` is searched — it always has a value (falls back to "Person {id}") and includes the user-assigned `name` when present.

## Scope Exclusions

- No filtering of similar groups section (hidden when search is active)
- No search history or suggestions
- No keyboard shortcut to focus search
- No URL persistence (transient in-view filter)
- No result count indicator
