# Person View Delete Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add delete person and hide photos capabilities to the PersonDetail view.

**Architecture:** Two new backend endpoints (`DELETE /faces/persons/{id}` and `POST /faces/persons/conflicts`), reuse existing `useSelectMode` + `SelectionBar` for photo selection in person view, new context menu and cross-person warning modal components.

**Tech Stack:** Python/FastAPI/aiosqlite (backend), React 19/TanStack Query/Tailwind CSS v4 (frontend), Vitest/React Testing Library (frontend tests), pytest/httpx (backend tests)

**Spec:** `docs/superpowers/specs/2026-03-18-person-view-delete-design.md`

---

### Task 1: Backend — `delete_person` database function

**Files:**
- Modify: `backend/database.py` (add function near line 1091, after `remove_face_from_person`)
- Test: `backend/tests/test_database.py`

- [ ] **Step 1: Write the failing test**

In `backend/tests/test_database.py`, add:

```python
from database import delete_person, get_person, insert_faces_batch, bulk_assign_persons
from utils import utc_now_iso
import numpy as np


def _make_embedding():
    return np.random.default_rng(42).standard_normal(512).astype(np.float32).tobytes()


async def _seed_person_with_media(db, media_id=1, face_count=2, name=None):
    """Insert a person with faces linked to a media item. Returns person_id."""
    now = utc_now_iso()
    face_rows = [
        {
            "media_id": media_id,
            "embedding": _make_embedding(),
            "bbox_x": 0.1, "bbox_y": 0.1, "bbox_w": 0.2, "bbox_h": 0.2,
            "confidence": 0.9,
            "crop_path": f"/tmp/face_{media_id}_{i}.jpg",
            "created_at": now,
        }
        for i in range(face_count)
    ]
    face_ids = await insert_faces_batch(db, face_rows)
    clusters = [{"face_ids": face_ids, "representative_face_id": face_ids[0]}]
    await bulk_assign_persons(db, clusters)
    await db.commit()
    cursor = await db.execute("SELECT person_id FROM faces WHERE id = ?", (face_ids[0],))
    row = await cursor.fetchone()
    person_id = row[0]
    if name:
        await db.execute("UPDATE persons SET name = ? WHERE id = ?", (name, person_id))
        await db.commit()
    return person_id


class TestDeletePerson:
    async def test_deletes_person_and_faces(self, db):
        """Person row and all face rows are removed."""
        from helpers import make_media_item
        from database import insert_media_item

        await insert_media_item(db, make_media_item(message_id=1, chat_id=1, chat_name="G"))
        person_id = await _seed_person_with_media(db, media_id=1, face_count=3)

        crop_paths = await delete_person(db, person_id)

        assert await get_person(db, person_id) is None
        cursor = await db.execute("SELECT COUNT(*) FROM faces WHERE person_id = ?", (person_id,))
        assert (await cursor.fetchone())[0] == 0
        assert len(crop_paths) == 3

    async def test_recounts_media_face_count(self, db):
        """media_items.face_count is recounted after faces are deleted."""
        from helpers import make_media_item
        from database import insert_media_item

        await insert_media_item(db, make_media_item(message_id=1, chat_id=1, chat_name="G"))
        # Two persons share the same media
        p1 = await _seed_person_with_media(db, media_id=1, face_count=2)
        p2 = await _seed_person_with_media(db, media_id=1, face_count=1)

        await delete_person(db, p1)

        cursor = await db.execute("SELECT face_count FROM media_items WHERE id = 1")
        row = await cursor.fetchone()
        # Only p2's face remains
        assert row[0] == 1

    async def test_returns_empty_for_nonexistent(self, db):
        """Deleting a nonexistent person returns empty list."""
        result = await delete_person(db, 99999)
        assert result == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_database.py::TestDeletePerson -v`
Expected: FAIL — `ImportError: cannot import name 'delete_person'`

- [ ] **Step 3: Write the implementation**

In `backend/database.py`, after `remove_face_from_person`, add:

```python
async def delete_person(db: aiosqlite.Connection, person_id: int) -> list[str]:
    """Delete a person and all associated face data. Returns crop paths for cleanup.

    Photos (media_items) are NOT deleted — only face linkage is removed.
    """
    # Check person exists
    async with await db.execute(
        "SELECT id FROM persons WHERE id = ?", (person_id,)
    ) as cursor:
        if not await cursor.fetchone():
            return []

    # Collect crop paths before deleting
    async with await db.execute(
        "SELECT crop_path FROM faces WHERE person_id = ? AND crop_path IS NOT NULL",
        (person_id,),
    ) as cursor:
        crop_paths = [row[0] for row in await cursor.fetchall()]

    # Collect affected media IDs
    async with await db.execute(
        "SELECT DISTINCT media_id FROM faces WHERE person_id = ?",
        (person_id,),
    ) as cursor:
        media_ids = [row[0] for row in await cursor.fetchall()]

    # Delete faces
    await db.execute("DELETE FROM faces WHERE person_id = ?", (person_id,))

    # Recount face_count for affected media
    if media_ids:
        placeholders = ", ".join("?" for _ in media_ids)
        await db.execute(
            f"""UPDATE media_items SET face_count = (
                SELECT COUNT(*) FROM faces WHERE media_id = media_items.id
            ) WHERE id IN ({placeholders})""",
            media_ids,
        )

    # Delete person
    await db.execute("DELETE FROM persons WHERE id = ?", (person_id,))
    await db.commit()

    return crop_paths
```

Also add `delete_person` to the imports in `backend/routes/faces.py` (done in Task 3).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_database.py::TestDeletePerson -v`
Expected: all 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/database.py backend/tests/test_database.py
git commit -m "feat(faces): add delete_person database function"
```

---

### Task 2: Backend — `get_cross_person_conflicts` database function

**Files:**
- Modify: `backend/database.py` (add function after `delete_person`)
- Test: `backend/tests/test_database.py`

- [ ] **Step 1: Write the failing test**

In `backend/tests/test_database.py`, add:

```python
from database import get_cross_person_conflicts


class TestGetCrossPersonConflicts:
    async def test_finds_other_persons(self, db):
        """Returns other persons that share photos with the given media IDs."""
        from helpers import make_media_item
        from database import insert_media_item

        await insert_media_item(db, make_media_item(message_id=1, chat_id=1, chat_name="G"))
        # Two persons share media_id=1
        p1 = await _seed_person_with_media(db, media_id=1, face_count=1, name="Alice")
        p2 = await _seed_person_with_media(db, media_id=1, face_count=1, name="Bob")

        conflicts = await get_cross_person_conflicts(db, [1], exclude_person_id=p1)

        assert len(conflicts) == 1
        assert conflicts[0]["media_id"] == 1
        assert any(p["id"] == p2 for p in conflicts[0]["persons"])
        assert any(p["display_name"] == "Bob" for p in conflicts[0]["persons"])

    async def test_no_conflicts_when_solo(self, db):
        """Returns empty when no other persons share the photos."""
        from helpers import make_media_item
        from database import insert_media_item

        await insert_media_item(db, make_media_item(message_id=1, chat_id=1, chat_name="G"))
        p1 = await _seed_person_with_media(db, media_id=1, face_count=1)

        conflicts = await get_cross_person_conflicts(db, [1], exclude_person_id=p1)

        assert conflicts == []

    async def test_excludes_specified_person(self, db):
        """The excluded person never appears in conflict results."""
        from helpers import make_media_item
        from database import insert_media_item

        await insert_media_item(db, make_media_item(message_id=1, chat_id=1, chat_name="G"))
        p1 = await _seed_person_with_media(db, media_id=1, face_count=1, name="Alice")
        _p2 = await _seed_person_with_media(db, media_id=1, face_count=1, name="Bob")

        conflicts = await get_cross_person_conflicts(db, [1], exclude_person_id=p1)

        for c in conflicts:
            assert all(p["id"] != p1 for p in c["persons"])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_database.py::TestGetCrossPersonConflicts -v`
Expected: FAIL — `ImportError`

- [ ] **Step 3: Write the implementation**

In `backend/database.py`, after `delete_person`:

```python
async def get_cross_person_conflicts(
    db: aiosqlite.Connection,
    media_ids: list[int],
    exclude_person_id: int,
) -> list[dict]:
    """Find other persons that have faces in the given media items.

    Returns a list of {media_id, persons: [{id, display_name}]} for media
    that have faces belonging to persons other than exclude_person_id.
    """
    if not media_ids:
        return []
    placeholders = ", ".join("?" for _ in media_ids)
    async with await db.execute(
        f"""SELECT f.media_id, p.id, p.name
            FROM faces f
            JOIN persons p ON f.person_id = p.id
            WHERE f.media_id IN ({placeholders})
              AND f.person_id != ?""",
        [*media_ids, exclude_person_id],
    ) as cursor:
        rows = await cursor.fetchall()

    if not rows:
        return []

    # Group by media_id
    by_media: dict[int, list[dict]] = {}
    for row in rows:
        mid = row[0]
        if mid not in by_media:
            by_media[mid] = []
        person = {"id": row[1], "display_name": row[2] or f"Person {row[1]}"}
        # Deduplicate (a person may have multiple faces in same photo)
        if not any(p["id"] == person["id"] for p in by_media[mid]):
            by_media[mid].append(person)

    return [{"media_id": mid, "persons": persons} for mid, persons in by_media.items()]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_database.py::TestGetCrossPersonConflicts -v`
Expected: all 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/database.py backend/tests/test_database.py
git commit -m "feat(faces): add get_cross_person_conflicts database function"
```

---

### Task 3: Backend — Route endpoints

**Files:**
- Modify: `backend/routes/faces.py` (add 2 endpoints + 1 Pydantic model)
- Test: `backend/tests/test_routes_faces.py`

- [ ] **Step 1: Write the failing tests**

In `backend/tests/test_routes_faces.py`, add:

```python
class TestDeletePersonEndpoint:
    async def test_delete_person_success(self, client, real_db_app):
        db = real_db_app
        await _seed_media(db, msg_id=1, chat_id=1)
        person_id = await _seed_person(db, name="Alice", face_count=2, media_id=1)

        resp = await client.delete(f"/api/faces/persons/{person_id}")

        assert resp.status_code == 200
        assert resp.json() == {"success": True}
        # Person should be gone
        resp2 = await client.get(f"/api/faces/persons/{person_id}")
        assert resp2.status_code == 404

    async def test_delete_person_not_found(self, client, real_db_app):
        resp = await client.delete("/api/faces/persons/99999")
        assert resp.status_code == 404


class TestConflictsEndpoint:
    async def test_returns_conflicts(self, client, real_db_app):
        db = real_db_app
        await _seed_media(db, msg_id=1, chat_id=1)
        p1 = await _seed_person(db, name="Alice", face_count=1, media_id=1)
        p2 = await _seed_person(db, name="Bob", face_count=1, media_id=1)

        resp = await client.post(
            "/api/faces/persons/conflicts",
            json={"media_ids": [1], "exclude_person_id": p1},
        )

        assert resp.status_code == 200
        data = resp.json()
        assert len(data["conflicts"]) == 1
        assert any(p["display_name"] == "Bob" for p in data["conflicts"][0]["persons"])

    async def test_no_conflicts(self, client, real_db_app):
        db = real_db_app
        await _seed_media(db, msg_id=1, chat_id=1)
        p1 = await _seed_person(db, name="Alice", face_count=1, media_id=1)

        resp = await client.post(
            "/api/faces/persons/conflicts",
            json={"media_ids": [1], "exclude_person_id": p1},
        )

        assert resp.status_code == 200
        assert resp.json() == {"conflicts": []}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_routes_faces.py::TestDeletePersonEndpoint tests/test_routes_faces.py::TestConflictsEndpoint -v`
Expected: FAIL — 404 (endpoints don't exist yet)

- [ ] **Step 3: Write the implementation**

In `backend/routes/faces.py`:

Add to imports:
```python
from database import (
    # ... existing imports ...
    delete_person,
    get_cross_person_conflicts,
)
```

Add Pydantic model (in the models region):
```python
class ConflictsRequest(BaseModel):
    media_ids: list[int]
    exclude_person_id: int
```

Add endpoints. The conflicts endpoint goes in the static routes region (before parameterized routes). The delete endpoint goes in the parameterized routes region:

```python
# In static routes region, before "# endregion" (before parameterized routes)
@router.post("/persons/conflicts")
async def check_conflicts(
    req: ConflictsRequest,
    db: aiosqlite.Connection = Depends(get_db),
):
    conflicts = await get_cross_person_conflicts(
        db, req.media_ids, req.exclude_person_id
    )
    return {"conflicts": conflicts}
```

Note: `Path` (from `pathlib`) and `logger` are already imported in `faces.py`.

```python
# In parameterized routes region, after get_person_endpoint
@router.delete("/persons/{person_id}")
async def delete_person_endpoint(
    person_id: int,
    db: aiosqlite.Connection = Depends(get_db),
):
    person = await get_person(db, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    crop_paths = await delete_person(db, person_id)
    # Clean up crop files (after DB commit, following established pattern)
    for path in crop_paths:
        try:
            Path(path).unlink(missing_ok=True)
        except OSError:
            logger.warning("Failed to delete crop file: %s", path)
    return {"success": True}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_routes_faces.py::TestDeletePersonEndpoint tests/test_routes_faces.py::TestConflictsEndpoint -v`
Expected: all 4 tests PASS

- [ ] **Step 5: Run full backend test suite**

Run: `cd backend && uv run pytest -v`
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/routes/faces.py backend/tests/test_routes_faces.py
git commit -m "feat(faces): add delete person and conflicts endpoints"
```

---

### Task 4: Frontend — API client + schemas

**Files:**
- Modify: `frontend/src/api/schemas.ts` (add `ConflictsResponse` schema)
- Modify: `frontend/src/api/client.ts` (add `deletePerson` and `getCrossPersonConflicts` functions)

- [ ] **Step 1: Add schema**

In `frontend/src/api/schemas.ts`, before the inferred types section:

```typescript
export const ConflictPerson = z.object({
  id: z.number(),
  display_name: z.string(),
})

export const ConflictsResponse = z.object({
  conflicts: z.array(
    z.object({
      media_id: z.number(),
      persons: z.array(ConflictPerson),
    }),
  ),
})
```

Add inferred types:
```typescript
export type ConflictPerson = z.infer<typeof ConflictPerson>
export type ConflictsResponse = z.infer<typeof ConflictsResponse>
```

- [ ] **Step 2: Add API functions**

In `frontend/src/api/client.ts`, in the Faces section, add:

```typescript
export const deletePerson = (personId: number) =>
  fetchJSON(`/faces/persons/${personId}`, SuccessResponse, {
    method: 'DELETE',
  })

export const getCrossPersonConflicts = (
  mediaIds: number[],
  excludePersonId: number,
) =>
  fetchJSON('/faces/persons/conflicts', ConflictsResponse, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      media_ids: mediaIds,
      exclude_person_id: excludePersonId,
    }),
  })
```

Update the import from schemas to include `ConflictsResponse`.

- [ ] **Step 3: Verify types compile**

Run: `cd frontend && bunx --bun tsgo --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/schemas.ts frontend/src/api/client.ts
git commit -m "feat(api): add deletePerson and getCrossPersonConflicts client functions"
```

---

### Task 5: Frontend — PersonDetail delete button

**Files:**
- Modify: `frontend/src/components/PersonDetail.tsx`
- Modify: `frontend/src/components/__tests__/PersonDetail.test.tsx`

- [ ] **Step 1: Write the failing test**

In `frontend/src/components/__tests__/PersonDetail.test.tsx`:

First, update the existing `defaultProps` to include `onDelete` (since the Props interface will require it):

```typescript
const defaultProps = {
  person,
  onBack: vi.fn(),
  onRename: vi.fn(),
  onMerge: vi.fn(),
  onDelete: vi.fn(),
}
```

Then add new tests:

```typescript
it('renders delete button', () => {
  render(<PersonDetail {...defaultProps} />)
  expect(screen.getByText('Delete')).toBeTruthy()
})

it('shows confirmation dialog on delete click', () => {
  render(<PersonDetail {...defaultProps} />)
  fireEvent.click(screen.getByText('Delete'))
  expect(
    screen.getByText(/Delete Alice\?/),
  ).toBeTruthy()
})

it('calls onDelete on confirm', () => {
  const onDelete = vi.fn()
  render(<PersonDetail {...defaultProps} onDelete={onDelete} />)
  fireEvent.click(screen.getByText('Delete'))
  fireEvent.click(screen.getByText('Delete person'))
  expect(onDelete).toHaveBeenCalled()
})

it('hides dialog on cancel', () => {
  render(<PersonDetail {...defaultProps} />)
  fireEvent.click(screen.getByText('Delete'))
  fireEvent.click(screen.getByText('Cancel'))
  expect(screen.queryByText(/Delete Alice\?/)).toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && bun run vitest run src/components/__tests__/PersonDetail.test.tsx`
Expected: FAIL — `onDelete` not a prop yet

- [ ] **Step 3: Write the implementation**

Update `frontend/src/components/PersonDetail.tsx`:

```typescript
import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { Person } from '#/api/schemas'
import { getFaceCropUrl } from '#/api/client'

interface Props {
  person: Person
  onBack: () => void
  onRename: (name: string) => void
  onMerge: () => void
  onDelete: () => void
}

export default function PersonDetail({
  person,
  onBack,
  onRename,
  onMerge,
  onDelete,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [nameInput, setNameInput] = useState(person.display_name)
  const [showConfirm, setShowConfirm] = useState(false)

  const save = () => {
    const trimmed = nameInput.trim()
    if (trimmed && trimmed !== person.display_name) {
      onRename(trimmed)
    }
    setEditing(false)
  }

  return (
    <div className="flex items-center gap-3 border-b border-border p-4">
      <button className="text-text-soft hover:text-text" onClick={onBack}>
        <ArrowLeft className="h-5 w-5" />
      </button>

      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-surface-alt">
        {person.representative_face_id != null ? (
          <img
            src={getFaceCropUrl(
              person.representative_face_id,
              person.updated_at,
            )}
            alt={person.display_name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-lg text-text-soft">
            ?
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') {
                setNameInput(person.display_name)
                setEditing(false)
              }
            }}
            onBlur={save}
            className="rounded bg-surface-alt px-2 py-1 text-sm text-text outline-none ring-1 ring-border-soft focus:ring-ring"
          />
        ) : (
          <button
            className="text-sm font-medium text-text hover:text-sky-400"
            onClick={() => {
              setNameInput(person.display_name)
              setEditing(true)
            }}
          >
            {person.display_name}
          </button>
        )}
        <p className="text-xs text-text-soft">
          {person.face_count === 1 ? '1 photo' : `${person.face_count} photos`}
        </p>
      </div>

      <button
        className="rounded px-2 py-1 text-xs text-text-soft hover:bg-hover hover:text-text"
        onClick={onMerge}
      >
        Merge...
      </button>
      <button
        className="rounded px-2 py-1 text-xs text-text-soft hover:bg-hover hover:text-danger"
        onClick={() => setShowConfirm(true)}
      >
        Delete
      </button>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 max-w-sm rounded-xl border border-border bg-surface p-6 shadow-2xl">
            <p className="text-sm text-text">
              Delete {person.display_name}? This removes all face data
              for this person. Photos will remain in your gallery.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-lg px-4 py-1.5 text-sm text-text-soft hover:bg-hover"
                onClick={() => setShowConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="rounded-lg bg-danger px-4 py-1.5 text-sm font-semibold text-white hover:bg-danger/80"
                onClick={() => {
                  setShowConfirm(false)
                  onDelete()
                }}
              >
                Delete person
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && bun run vitest run src/components/__tests__/PersonDetail.test.tsx`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PersonDetail.tsx frontend/src/components/__tests__/PersonDetail.test.tsx
git commit -m "feat(people): add delete button to PersonDetail with confirmation"
```

---

### Task 6: Frontend — Wire delete person into route

**Files:**
- Modify: `frontend/src/routes/index.tsx`

- [ ] **Step 1: Add deletePerson import and handler**

In `frontend/src/routes/index.tsx`, add `deletePerson` to the imports from `#/api/client`.

Then in the JSX where `PersonDetail` is rendered (around line 338), add the `onDelete` prop:

```tsx
<PersonDetail
  key={data.selectedPerson.id}
  person={data.selectedPerson}
  onBack={() => data.setSelectedPersonId(undefined)}
  onRename={async (name) => {
    try {
      await renamePerson(data.selectedPerson!.id, name)
      data.persons.invalidate()
    } catch {
      toast.error('Failed to rename person')
    }
  }}
  onMerge={() => setShowMergeModal(true)}
  onDelete={async () => {
    try {
      const name = data.selectedPerson!.display_name
      await deletePerson(data.selectedPerson!.id)
      data.setSelectedPersonId(undefined)
      data.persons.invalidate()
      toast.success(`Deleted ${name}`)
    } catch {
      toast.error('Failed to delete person')
    }
  }}
/>
```

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && bunx --bun tsgo --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/routes/index.tsx
git commit -m "feat(people): wire delete person action into route"
```

---

### Task 7: Frontend — CrossPersonWarningModal component

**Files:**
- Create: `frontend/src/components/CrossPersonWarningModal.tsx`
- Create: `frontend/src/components/__tests__/CrossPersonWarningModal.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/__tests__/CrossPersonWarningModal.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import CrossPersonWarningModal from '#/components/CrossPersonWarningModal'

describe('CrossPersonWarningModal', () => {
  const conflicts = [
    {
      media_id: 1,
      persons: [
        { id: 10, display_name: 'Alice' },
        { id: 20, display_name: 'Bob' },
      ],
    },
    {
      media_id: 2,
      persons: [{ id: 10, display_name: 'Alice' }],
    },
  ]

  it('shows affected persons with photo counts', () => {
    render(
      <CrossPersonWarningModal
        conflicts={conflicts}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    // Alice appears in 2 photos, Bob in 1
    expect(screen.getByText(/Alice/)).toBeTruthy()
    expect(screen.getByText(/Bob/)).toBeTruthy()
  })

  it('calls onConfirm when Hide anyway clicked', () => {
    const onConfirm = vi.fn()
    render(
      <CrossPersonWarningModal
        conflicts={conflicts}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('Hide anyway'))
    expect(onConfirm).toHaveBeenCalled()
  })

  it('calls onCancel when Cancel clicked', () => {
    const onCancel = vi.fn()
    render(
      <CrossPersonWarningModal
        conflicts={conflicts}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    )
    fireEvent.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && bun run vitest run src/components/__tests__/CrossPersonWarningModal.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Create `frontend/src/components/CrossPersonWarningModal.tsx`:

```typescript
import type { ConflictsResponse } from '#/api/schemas'

interface Props {
  conflicts: ConflictsResponse['conflicts']
  onConfirm: () => void
  onCancel: () => void
}

export default function CrossPersonWarningModal({
  conflicts,
  onConfirm,
  onCancel,
}: Props) {
  // Aggregate: count photos per person across all conflicts
  const personCounts = new Map<number, { name: string; count: number }>()
  for (const c of conflicts) {
    for (const p of c.persons) {
      const existing = personCounts.get(p.id)
      if (existing) {
        existing.count++
      } else {
        personCounts.set(p.id, { name: p.display_name, count: 1 })
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 max-w-sm rounded-xl border border-border bg-surface p-6 shadow-2xl">
        <p className="text-sm font-medium text-text">
          These photos also appear in other people's views:
        </p>
        <ul className="mt-3 space-y-1">
          {[...personCounts.values()].map((p) => (
            <li key={p.name} className="text-sm text-text-soft">
              {p.name}{' '}
              <span className="text-text-softer">
                ({p.count} {p.count === 1 ? 'photo' : 'photos'})
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-text-softer">
          Hiding will remove them from those views too.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            className="rounded-lg px-4 py-1.5 text-sm text-text-soft hover:bg-hover"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="rounded-lg bg-danger px-4 py-1.5 text-sm font-semibold text-white hover:bg-danger/80"
            onClick={onConfirm}
          >
            Hide anyway
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && bun run vitest run src/components/__tests__/CrossPersonWarningModal.test.tsx`
Expected: all 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/CrossPersonWarningModal.tsx frontend/src/components/__tests__/CrossPersonWarningModal.test.tsx
git commit -m "feat(people): add CrossPersonWarningModal component"
```

---

### Task 8: Frontend — PhotoContextMenu component

**Files:**
- Create: `frontend/src/components/PhotoContextMenu.tsx`
- Create: `frontend/src/components/__tests__/PhotoContextMenu.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/__tests__/PhotoContextMenu.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import PhotoContextMenu from '#/components/PhotoContextMenu'

describe('PhotoContextMenu', () => {
  const defaultProps = {
    x: 100,
    y: 200,
    onHide: vi.fn(),
    onClose: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders Hide photo option', () => {
    render(<PhotoContextMenu {...defaultProps} />)
    expect(screen.getByText('Hide photo')).toBeTruthy()
  })

  it('calls onHide when clicked', () => {
    const onHide = vi.fn()
    render(<PhotoContextMenu {...defaultProps} onHide={onHide} />)
    fireEvent.click(screen.getByText('Hide photo'))
    expect(onHide).toHaveBeenCalled()
  })

  it('calls onClose on Escape', () => {
    const onClose = vi.fn()
    render(<PhotoContextMenu {...defaultProps} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && bun run vitest run src/components/__tests__/PhotoContextMenu.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Create `frontend/src/components/PhotoContextMenu.tsx`:

```typescript
import { useEffect, useRef } from 'react'

interface Props {
  x: number
  y: number
  onHide: () => void
  onClose: () => void
}

export default function PhotoContextMenu({
  x,
  y,
  onHide,
  onClose,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const handleScroll = () => onClose()

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [onClose])

  // Clamp to viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(x, window.innerWidth - 160),
    top: Math.min(y, window.innerHeight - 48),
    zIndex: 50,
  }

  return (
    <div ref={menuRef} style={style}>
      <div className="min-w-[140px] rounded-lg border border-border bg-surface py-1 shadow-xl">
        <button
          className="w-full px-3 py-1.5 text-left text-sm text-text hover:bg-hover"
          onClick={onHide}
        >
          Hide photo
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && bun run vitest run src/components/__tests__/PhotoContextMenu.test.tsx`
Expected: all 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PhotoContextMenu.tsx frontend/src/components/__tests__/PhotoContextMenu.test.tsx
git commit -m "feat(people): add PhotoContextMenu component"
```

---

### Task 9: Frontend — SelectionBar people mode

**Files:**
- Modify: `frontend/src/components/SelectionBar.tsx`
- Modify: `frontend/src/components/__tests__/SelectionBar.test.tsx`

- [ ] **Step 1: Write the failing test**

In `frontend/src/components/__tests__/SelectionBar.test.tsx`, add:

```typescript
it('suppresses Favorite button in people mode', () => {
  render(
    <SelectionBar
      selectedCount={1}
      onSelectAll={vi.fn()}
      onDeselectAll={vi.fn()}
      onDownload={vi.fn()}
      onCancel={vi.fn()}
      selectedIds={new Set([1])}
      viewMode="people"
    />,
  )
  expect(screen.queryByText(/Favorite/)).toBeNull()
  expect(screen.getByText('Hide')).toBeTruthy()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && bun run vitest run src/components/__tests__/SelectionBar.test.tsx`
Expected: FAIL — Favorite button is present in people mode

- [ ] **Step 3: Write the implementation**

In `frontend/src/components/SelectionBar.tsx`:

**3a.** Add `onBeforeHide` to the `Props` interface:

```typescript
onBeforeHide?: () => Promise<boolean> | boolean
```

And destructure it in the component parameters.

**3b.** In the `handleHide` function, add interception before the `setHiding(true)` call. Replace the existing `handleHide`:

```typescript
const handleHide = async () => {
  if (selectedCount === 0 || hiding) return
  if (onBeforeHide) {
    const proceed = await onBeforeHide()
    if (!proceed) return
  }
  setHiding(true)
  try {
    await hideMediaBatch([...selectedIds])
    toast.success(`${selectedCount} items hidden`)
    onHide?.()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Hide failed')
  } finally {
    setHiding(false)
  }
}
```

**3c.** In the JSX render, replace the entire block from `{viewMode === 'favorites' ? (` through the closing of the Favorite ternary (lines 184-212 in the original) with:

```tsx
{viewMode !== 'people' && (
  viewMode === 'favorites' ? (
    <button
      className="rounded-lg bg-surface-strong px-4 py-1.5 text-sm font-semibold text-white hover:bg-surface-alt disabled:opacity-50"
      onClick={handleUnfavorite}
      disabled={selectedCount === 0 || unfavoriting}
    >
      {unfavoriting ? (
        'Removing...'
      ) : (
        <>
          Unfavorite{' '}
          <span className="text-xs text-white/40">F</span>
        </>
      )}
    </button>
  ) : (
    <button
      className="rounded-lg bg-danger/80 px-4 py-1.5 text-sm font-semibold text-white hover:bg-danger disabled:opacity-50"
      onClick={handleFavorite}
      disabled={selectedCount === 0 || favoriting}
    >
      {favoriting ? (
        'Saving...'
      ) : (
        <>
          ♥ Favorite{' '}
          <span className="text-xs text-white/40">F</span>
        </>
      )}
    </button>
  )
)}
```

This wraps the Favorite/Unfavorite buttons in a `viewMode !== 'people'` guard, suppressing them in people mode while keeping Hide and Download visible.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && bun run vitest run src/components/__tests__/SelectionBar.test.tsx`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SelectionBar.tsx frontend/src/components/__tests__/SelectionBar.test.tsx
git commit -m "feat(people): add people mode to SelectionBar with onBeforeHide"
```

---

### Task 10: Frontend — Wire selection + context menu + warning into route

**Files:**
- Modify: `frontend/src/routes/index.tsx`

This is the integration task. It wires together: context menu, cross-person conflict check, warning modal, and hide action.

**Note on selection mode:** The existing `useSelectMode()` in the route already handles photo selection for the person media grid — `handleToggle`, `handleLongPress`, and `handleItemClick` work for all view modes including people. The `SelectionBar` is already rendered when `data.selectMode.active` is true. No additional wiring is needed for selection mode entry (cmd+click / long-press already work).

- [ ] **Step 1: Add imports**

Add to imports in `frontend/src/routes/index.tsx`:

```typescript
import { getCrossPersonConflicts, hideMediaBatch } from '#/api/client'
import type { ConflictsResponse } from '#/api/schemas'

const PhotoContextMenu = lazy(() => import('#/components/PhotoContextMenu'))
const CrossPersonWarningModal = lazy(
  () => import('#/components/CrossPersonWarningModal'),
)
```

- [ ] **Step 2: Add state for context menu and warning modal**

Inside the `Home` component, add state:

```typescript
const [contextMenu, setContextMenu] = useState<{
  x: number
  y: number
  mediaId: number
} | null>(null)
const [conflicts, setConflicts] = useState<
  ConflictsResponse['conflicts'] | null
>(null)
const [pendingHideIds, setPendingHideIds] = useState<number[]>([])
```

- [ ] **Step 3: Add the hide-with-conflict-check handler**

```typescript
const handlePersonViewHide = useCallback(
  async (mediaIds: number[]) => {
    if (!data.selectedPerson || mediaIds.length === 0) return
    try {
      const { conflicts } = await getCrossPersonConflicts(
        mediaIds,
        data.selectedPerson.id,
      )
      if (conflicts.length > 0) {
        setConflicts(conflicts)
        setPendingHideIds(mediaIds)
      } else {
        await hideMediaBatch(mediaIds)
        data.selectMode.exitSelectMode()
        data.invalidateActiveMedia()
        data.persons.invalidate()
        toast.success(
          `${mediaIds.length} ${mediaIds.length === 1 ? 'photo' : 'photos'} hidden`,
        )
      }
    } catch {
      toast.error('Failed to hide photos')
    }
  },
  [data.selectedPerson, data.selectMode, data.invalidateActiveMedia, data.persons],
)

const confirmHide = useCallback(async () => {
  try {
    await hideMediaBatch(pendingHideIds)
    setConflicts(null)
    setPendingHideIds([])
    data.selectMode.exitSelectMode()
    data.invalidateActiveMedia()
    data.persons.invalidate()
    toast.success(
      `${pendingHideIds.length} ${pendingHideIds.length === 1 ? 'photo' : 'photos'} hidden`,
    )
  } catch {
    toast.error('Failed to hide photos')
  }
}, [pendingHideIds, data.selectMode, data.invalidateActiveMedia, data.persons])
```

- [ ] **Step 4: Add context menu handler to MediaGrid**

In the person media grid section (where `MediaGrid` is rendered inside the `data.viewMode === 'people' && data.selectedPerson` block), add `onContextMenu` handling.

Add a wrapper around `handleItemClick` for the person view that handles right-click:

On the `MediaGrid` container div (or pass as a prop), add a `onContextMenu` handler. Since `MediaGrid` doesn't have a context menu prop, we wrap the grid area. Add to the grid container div that wraps `MediaGrid` when in person view:

```tsx
onContextMenu={(e: React.MouseEvent) => {
  if (data.viewMode !== 'people' || !data.selectedPerson) return
  if (data.selectMode.active) return
  const card = (e.target as HTMLElement).closest('[data-item-id]')
  if (!card) return
  e.preventDefault()
  const mediaId = Number(card.getAttribute('data-item-id'))
  setContextMenu({ x: e.clientX, y: e.clientY, mediaId })
}}
```

Note: This requires `MediaCard` to have a `data-item-id` attribute. Check if it does — if not, add `data-item-id={item.id}` to the root element of `MediaCard`.

- [ ] **Step 5: Wire SelectionBar onBeforeHide for person view**

In the `SelectionBar` usage, add:

```tsx
onBeforeHide={
  data.viewMode === 'people' && data.selectedPerson
    ? async () => {
        await handlePersonViewHide([...data.selectMode.selectedIds])
        return false // We handle everything ourselves
      }
    : undefined
}
```

- [ ] **Step 6: Render context menu and warning modal**

Add before the closing `</div>` of the main layout:

```tsx
{contextMenu && (
  <Suspense>
    <PhotoContextMenu
      x={contextMenu.x}
      y={contextMenu.y}
      onHide={() => {
        handlePersonViewHide([contextMenu.mediaId])
        setContextMenu(null)
      }}
      onClose={() => setContextMenu(null)}
    />
  </Suspense>
)}
{conflicts && (
  <Suspense>
    <CrossPersonWarningModal
      conflicts={conflicts}
      onConfirm={confirmHide}
      onCancel={() => {
        setConflicts(null)
        setPendingHideIds([])
      }}
    />
  </Suspense>
)}
```

- [ ] **Step 7: Verify data-item-id on MediaCard**

`MediaCard` already has `data-item-id={item.id}` on its root div — no changes needed. The context menu handler in Step 4 uses `closest('[data-item-id]')` to find the media ID.

- [ ] **Step 8: Verify types compile**

Run: `cd frontend && bunx --bun tsgo --noEmit`
Expected: no errors

- [ ] **Step 9: Run lint/format**

Run: `cd frontend && bun run check`
Expected: passes

- [ ] **Step 10: Commit**

```bash
git add frontend/src/routes/index.tsx frontend/src/components/MediaCard.tsx
git commit -m "feat(people): wire selection, context menu, and hide flow into person view"
```

---

### Task 11: Manual testing + polish

**Files:** None new — this is a verification pass.

- [ ] **Step 1: Run full backend test suite**

Run: `cd backend && uv run pytest -v`
Expected: all tests PASS

- [ ] **Step 2: Run full frontend test suite**

Run: `cd frontend && bun run vitest run`
Expected: all tests PASS

- [ ] **Step 3: Run frontend lint/format**

Run: `cd frontend && bun run check`
Expected: passes

- [ ] **Step 4: Verify types**

Run: `cd frontend && bunx --bun tsgo --noEmit`
Expected: no errors

- [ ] **Step 5: Commit any fixes**

If any fixes were needed:
```bash
git add -A && git commit -m "fix: address test/lint issues from person view delete"
```
