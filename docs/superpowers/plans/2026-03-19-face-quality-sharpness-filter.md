# Face Quality & Sharpness Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store face quality attributes (pose + sharpness) during scanning and add a sharpness slider to filter out low-quality faces in the people view.

**Architecture:** Add 4 columns to the `faces` table (pitch, yaw, roll, sharpness), extract them from InsightFace's already-computed face attributes during scanning, and expose a `min_sharpness` query param on `GET /faces/persons` that the frontend drives via a debounced slider in PeopleToolbar.

**Tech Stack:** Python/FastAPI, SQLite (aiosqlite), InsightFace (buffalo_l), React 19, TanStack Query, Zustand, Tailwind CSS v4

**Spec:** `docs/superpowers/specs/2026-03-19-face-quality-sharpness-filter-design.md`

**Note:** The spec says to store `minSharpness` in URL search params. However, the existing similarity slider uses Zustand (`appStore.similarityThreshold`), not URL params. This plan follows the existing pattern (Zustand) for consistency. The spec can be updated to reflect this.

---

### Task 1: Database schema — add face quality columns

**Files:**
- Modify: `backend/database.py:83-95` (SCHEMA faces table)
- Modify: `backend/database.py:172-185` (`_migrate_to_autoincrement` faces section)
- Modify: `backend/database.py:191-208` (`init_db` migration list)
- Modify: `backend/database.py:1016-1035` (`insert_faces_batch`)
- Test: `backend/tests/test_face_scanner.py`

- [ ] **Step 1: Add columns to SCHEMA constant**

In the `faces` table CREATE TABLE in SCHEMA (~line 83), add after `crop_path TEXT,`:

```python
    pitch           REAL,
    yaw             REAL,
    roll            REAL,
    sharpness       REAL,
```

- [ ] **Step 2: Add ALTER TABLE migrations in `init_db`**

In the migrations list in `init_db()` (~line 195), append:

```python
"ALTER TABLE faces ADD COLUMN pitch REAL",
"ALTER TABLE faces ADD COLUMN yaw REAL",
"ALTER TABLE faces ADD COLUMN roll REAL",
"ALTER TABLE faces ADD COLUMN sharpness REAL",
```

- [ ] **Step 3: Update `_migrate_to_autoincrement` faces schema**

In the `_migrate_to_autoincrement` function (~line 172), update the `faces_new` CREATE TABLE to include the new columns:

```python
"""CREATE TABLE faces_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    media_id INTEGER NOT NULL, person_id INTEGER,
    embedding BLOB NOT NULL,
    bbox_x REAL NOT NULL, bbox_y REAL NOT NULL,
    bbox_w REAL NOT NULL, bbox_h REAL NOT NULL,
    confidence REAL NOT NULL, crop_path TEXT,
    created_at DATETIME NOT NULL,
    pitch REAL, yaw REAL, roll REAL, sharpness REAL
)""",
```

- [ ] **Step 4: Update `insert_faces_batch`**

In `insert_faces_batch()` (~line 1016), update the column list and keys:

```python
cols = "media_id, embedding, bbox_x, bbox_y, bbox_w, bbox_h, confidence, crop_path, created_at, pitch, yaw, roll, sharpness"
keys = ["media_id", "embedding", "bbox_x", "bbox_y", "bbox_w", "bbox_h",
        "confidence", "crop_path", "created_at", "pitch", "yaw", "roll", "sharpness"]
```

Update chunk_size: 13 columns now, so `chunk_size = 76` (76 * 13 = 988, under SQLite's 999 limit). Update the comment accordingly.

- [ ] **Step 5: Verify existing tests still pass**

Run: `cd backend && uv run pytest tests/test_face_scanner.py tests/test_routes_faces.py -v`
Expected: All existing tests PASS (schema migration is backwards-compatible, `insert_faces_batch` callers that don't provide the new keys will need updating — see Task 1 Step 6)

- [ ] **Step 6: Update `_seed_person` helper in test_routes_faces.py**

The `_seed_person` helper (~line 33) builds face_rows dicts. Add the new columns with defaults:

```python
async def _seed_person(db, *, name=None, face_count=2, media_id=1, sharpness=None):
    """Insert a person with `face_count` faces linked to `media_id`. Returns person_id."""
    now = utc_now_iso()
    face_rows = [
        {
            "media_id": media_id,
            "embedding": _make_embedding(),
            "bbox_x": 0.1,
            "bbox_y": 0.1,
            "bbox_w": 0.2,
            "bbox_h": 0.2,
            "confidence": 0.9,
            "crop_path": f"/tmp/face_crop_{i}.jpg",
            "created_at": now,
            "pitch": None,
            "yaw": None,
            "roll": None,
            "sharpness": sharpness,
        }
        for i in range(face_count)
    ]
    # ... rest of function unchanged
```

Also update any other test helpers that call `insert_faces_batch` with face row dicts — search for `insert_faces_batch` in all test files and add the 4 new keys (defaulting to `None`).

- [ ] **Step 7: Re-run tests**

Run: `cd backend && uv run pytest tests/test_face_scanner.py tests/test_routes_faces.py -v`
Expected: All PASS

- [ ] **Step 8: Commit**

```bash
git add backend/database.py backend/tests/test_face_scanner.py backend/tests/test_routes_faces.py
git commit -m "feat: add pitch/yaw/roll/sharpness columns to faces table"
```

---

### Task 2: Extract face quality attributes during scanning

**Files:**
- Modify: `backend/face_scanner.py:44-72` (`_detect_faces_in_image`)
- Modify: `backend/face_scanner.py:165-178` (`scan_faces` — face_rows dict)
- Test: `backend/tests/test_face_scanner.py`

- [ ] **Step 1: Write failing test for pose + sharpness extraction**

Add to `backend/tests/test_face_scanner.py`:

```python
def test_detect_faces_extracts_quality_attributes(tmp_path):
    """_detect_faces_in_image should extract pitch/yaw/roll/sharpness."""
    import cv2

    # Create a test image with a sharp region (not random noise — use edges for deterministic sharpness)
    img = np.zeros((480, 640, 3), dtype=np.uint8)
    cv2.rectangle(img, (100, 100), (200, 200), (255, 255, 255), 2)  # sharp edges
    img_path = tmp_path / "test.jpg"
    cv2.imwrite(str(img_path), img)

    fake_face = _make_fake_face(bbox=(100, 100, 200, 200))
    fake_face.pose = np.array([5.0, -10.0, 2.0])

    with patch("face_scanner._get_face_app") as mock_app:
        mock_app.return_value.get.return_value = [fake_face]
        from face_scanner import _detect_faces_in_image
        results = _detect_faces_in_image(str(img_path))

    assert len(results) == 1
    r = results[0]
    assert r["pitch"] == pytest.approx(5.0)
    assert r["yaw"] == pytest.approx(-10.0)
    assert r["roll"] == pytest.approx(2.0)
    assert isinstance(r["sharpness"], float)
    assert r["sharpness"] >= 0


def test_detect_faces_handles_missing_pose(tmp_path):
    """If face.pose is None, pitch/yaw/roll should be None."""
    import cv2

    img = np.zeros((480, 640, 3), dtype=np.uint8)
    img_path = tmp_path / "test.jpg"
    cv2.imwrite(str(img_path), img)

    fake_face = _make_fake_face()
    fake_face.pose = None

    with patch("face_scanner._get_face_app") as mock_app:
        mock_app.return_value.get.return_value = [fake_face]
        from face_scanner import _detect_faces_in_image
        results = _detect_faces_in_image(str(img_path))

    assert len(results) == 1
    assert results[0]["pitch"] is None
    assert results[0]["yaw"] is None
    assert results[0]["roll"] is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_face_scanner.py::test_detect_faces_extracts_quality_attributes -v`
Expected: FAIL — KeyError on "pitch"

- [ ] **Step 3: Implement extraction in `_detect_faces_in_image`**

In `_detect_faces_in_image()` (~line 44), after computing bbox values (~line 59), add pose and sharpness extraction. Insert before `results.append(...)`:

```python
# Extract pose (pitch, yaw, roll) from 3D landmarks
pose = getattr(face, "pose", None)
pitch = float(pose[0]) if pose is not None else None
yaw = float(pose[1]) if pose is not None else None
roll_val = float(pose[2]) if pose is not None else None

# Compute sharpness on original-resolution face crop (before 112x112 resize)
x1i, y1i, x2i, y2i = int(x1), int(y1), int(x2), int(y2)
face_region = img[max(0, y1i):y2i, max(0, x1i):x2i]
if face_region.size > 0:
    gray = cv2.cvtColor(face_region, cv2.COLOR_BGR2GRAY)
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
else:
    sharpness = None
```

Update the results dict to include the new fields:

```python
results.append(
    {
        "embedding": face.embedding.astype(np.float32).tobytes(),
        "bbox_x": bbox_x,
        "bbox_y": bbox_y,
        "bbox_w": bbox_w,
        "bbox_h": bbox_h,
        "confidence": float(face.det_score),
        "img": img,
        "bbox_px": (int(x1), int(y1), int(x2), int(y2)),
        "pitch": pitch,
        "yaw": yaw,
        "roll": roll_val,
        "sharpness": sharpness,
    }
)
```

- [ ] **Step 4: Update face_rows in `scan_faces`**

In `scan_faces()` (~line 166), update the face_rows list comprehension to include the new fields:

```python
face_rows = [
    {
        "media_id": media_id,
        "embedding": f["embedding"],
        "bbox_x": f["bbox_x"],
        "bbox_y": f["bbox_y"],
        "bbox_w": f["bbox_w"],
        "bbox_h": f["bbox_h"],
        "confidence": f["confidence"],
        "crop_path": None,
        "created_at": now,
        "pitch": f.get("pitch"),
        "yaw": f.get("yaw"),
        "roll": f.get("roll"),
        "sharpness": f.get("sharpness"),
    }
    for f in qualified
]
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_face_scanner.py -v`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/face_scanner.py backend/tests/test_face_scanner.py
git commit -m "feat: extract pose and sharpness during face scanning"
```

---

### Task 3: Backend — filtered persons endpoint with min_sharpness

**Files:**
- Modify: `backend/database.py` (`get_all_persons` function, ~line 1091)
- Modify: `backend/routes/faces.py` (`list_persons` route, ~line 141)
- Modify: `backend/tests/test_routes_faces.py`

- [ ] **Step 1: Write failing test for min_sharpness filtering**

Add to `backend/tests/test_routes_faces.py`:

```python
@pytest.mark.asyncio
async def test_list_persons_min_sharpness_filter(face_db):
    db, media_id = face_db
    # Seed a sharp person
    media_id2 = await _seed_media(db, msg_id=99, chat_id=1)
    await _seed_person(db, name="Sharp", sharpness=500.0, media_id=media_id)
    await _seed_person(db, name="Blurry", sharpness=10.0, media_id=media_id2)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        # No filter — both visible
        resp = await client.get("/faces/persons")
        assert resp.status_code == 200
        data = resp.json()
        names = {p["display_name"] for p in data["persons"]}
        assert "Sharp" in names
        assert "Blurry" in names
        assert data["max_sharpness"] == pytest.approx(500.0)

        # With min_sharpness=100 — only Sharp visible
        resp = await client.get("/faces/persons?min_sharpness=100")
        assert resp.status_code == 200
        data = resp.json()
        names = {p["display_name"] for p in data["persons"]}
        assert "Sharp" in names
        assert "Blurry" not in names
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_routes_faces.py::test_list_persons_min_sharpness_filter -v`
Expected: FAIL

- [ ] **Step 3: Update `get_all_persons` to accept min_sharpness and return new shape**

In `backend/database.py`, replace `get_all_persons()`:

```python
async def get_all_persons(
    db: aiosqlite.Connection, *, min_sharpness: float = 0
) -> dict:
    """Return persons list and max sharpness. Optionally filter by min face sharpness."""
    # Get max sharpness across all faces (unfiltered, for slider range)
    async with await db.execute("SELECT MAX(sharpness) FROM faces") as cursor:
        row = await cursor.fetchone()
    max_sharpness = row[0] if row and row[0] is not None else 0.0

    if min_sharpness > 0:
        # Filtered query: only include faces meeting sharpness threshold
        # NULL sharpness values are excluded when filtering (SQLite NULL >= x → NULL → excluded)
        async with await db.execute(
            """WITH qualified_faces AS (
                SELECT id, person_id, confidence, crop_path
                FROM faces
                WHERE person_id IS NOT NULL
                  AND sharpness >= ?
            )
            SELECT
                p.id, p.name, p.created_at, p.updated_at,
                COUNT(qf.id) AS face_count,
                (SELECT qf2.id FROM qualified_faces qf2
                 WHERE qf2.person_id = p.id
                 ORDER BY qf2.confidence DESC LIMIT 1) AS representative_face_id,
                (SELECT qf3.crop_path FROM qualified_faces qf3
                 WHERE qf3.person_id = p.id
                 ORDER BY qf3.confidence DESC LIMIT 1) AS avatar_crop_path
            FROM persons p
            JOIN qualified_faces qf ON qf.person_id = p.id
            GROUP BY p.id
            HAVING COUNT(qf.id) > 0
            ORDER BY face_count DESC""",
            (min_sharpness,),
        ) as cursor:
            rows = await cursor.fetchall()
    else:
        async with await db.execute(
            """SELECT p.*, f.crop_path as avatar_crop_path
               FROM persons p
               LEFT JOIN faces f ON f.id = p.representative_face_id
               ORDER BY p.face_count DESC"""
        ) as cursor:
            rows = await cursor.fetchall()

    result = []
    for r in rows:
        d = dict(r)
        d["display_name"] = d["name"] or f"Person {d['id']}"
        result.append(d)

    return {"persons": result, "max_sharpness": float(max_sharpness)}
```

- [ ] **Step 4: Update `list_persons` route**

In `backend/routes/faces.py`:

```python
@router.get("/persons")
async def list_persons(
    min_sharpness: float = 0,
    db: aiosqlite.Connection = Depends(get_db),
):
    data = await get_all_persons(db, min_sharpness=min_sharpness)
    return data
```

- [ ] **Step 5: Fix broken existing tests**

The response shape changed from `list` to `{"persons": list, "max_sharpness": float}`. Two tests need updating:

**`test_list_persons_empty` (~line 200):**
```python
# Before:
assert resp.json() == []
# After:
data = resp.json()
assert data["persons"] == []
assert "max_sharpness" in data
```

**`test_list_persons_returns_data` (~line 210):**
```python
# Before:
data = resp.json()
assert len(data) == 1
assert data[0]["name"] == "Alice"
# After:
data = resp.json()["persons"]
assert len(data) == 1
assert data[0]["name"] == "Alice"
```

- [ ] **Step 6: Search for other callers of `get_all_persons`**

Run: `grep -r "get_all_persons" backend/` — check if any code besides `routes/faces.py` calls it. If so, update those callers to handle the new return shape.

- [ ] **Step 7: Run full backend test suite**

Run: `cd backend && uv run pytest -v`
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
git add backend/database.py backend/routes/faces.py backend/tests/test_routes_faces.py
git commit -m "feat: add min_sharpness filter to GET /faces/persons"
```

---

### Task 4: Frontend — update API client and Zod schema

**Files:**
- Modify: `frontend/src/api/schemas.ts` (add PersonsResponse)
- Modify: `frontend/src/api/client.ts` (update getPersons)
- Modify: `frontend/src/hooks/usePersons.ts` (pass minSharpness, handle new response shape)

- [ ] **Step 1: Add PersonsResponse Zod schema**

In `frontend/src/api/schemas.ts`, add after the Person schema and type (~line 62):

```typescript
export const PersonsResponse = z.object({
  persons: z.array(Person),
  max_sharpness: z.number(),
})
export type PersonsResponse = z.infer<typeof PersonsResponse>
```

- [ ] **Step 2: Update `getPersons` in client.ts**

In `frontend/src/api/client.ts`, update the getPersons function (~line 412):

```typescript
export const getPersons = (minSharpness = 0) =>
  fetchJSON(
    `/faces/persons${minSharpness > 0 ? `?min_sharpness=${minSharpness}` : ''}`,
    PersonsResponse,
  )
```

Add `PersonsResponse` to the import from `#/api/schemas`.

- [ ] **Step 3: Update `usePersons` hook**

In `frontend/src/hooks/usePersons.ts`, add `minSharpness` param and update the return shape:

```typescript
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getPersons, getSimilarGroups } from '#/api/client'

const PERSONS_KEY = ['faces', 'persons'] as const
const SIMILAR_PREFIX = ['faces', 'persons', 'similar-groups'] as const

export function usePersons(
  enabled = false,
  similarityThreshold = 0.4,
  minSharpness = 0,
) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: [...PERSONS_KEY, minSharpness] as const,
    queryFn: () => getPersons(minSharpness),
    enabled,
  })

  const threshold = similarityThreshold
  const similarQuery = useQuery({
    queryKey: [...SIMILAR_PREFIX, threshold] as const,
    queryFn: () => getSimilarGroups(threshold),
    enabled: enabled && (query.data?.persons.length ?? 0) >= 2,
  })

  return {
    persons: query.data?.persons ?? [],
    maxSharpness: query.data?.max_sharpness ?? 0,
    loading: query.isLoading,
    similarGroups: similarQuery.data?.groups ?? [],
    refetch: query.refetch,
    invalidate: () => {
      queryClient.invalidateQueries({ queryKey: PERSONS_KEY })
      queryClient.invalidateQueries({ queryKey: SIMILAR_PREFIX })
    },
  }
}
```

- [ ] **Step 4: Run frontend type check**

Run: `cd frontend && bun run check`
Expected: May show type errors in components that consume `usePersons` — that's expected and will be fixed in Task 5.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/schemas.ts frontend/src/api/client.ts frontend/src/hooks/usePersons.ts
git commit -m "feat: update frontend API layer for sharpness filter"
```

---

### Task 5: Frontend — sharpness slider in PeopleToolbar

**Files:**
- Modify: `frontend/src/stores/appStore.ts` (add minSharpness state)
- Modify: `frontend/src/components/PeopleToolbar.tsx` (add slider)
- Modify: `frontend/src/hooks/useHomeData.ts` (pass minSharpness to usePersons, expose maxSharpness)
- Modify: `frontend/src/routes/index.tsx` (wire up minSharpness + maxSharpness props)
- Modify: `frontend/src/components/__tests__/extracted-components.test.tsx` (add new required props)

- [ ] **Step 1: Add minSharpness to appStore**

In `frontend/src/stores/appStore.ts`, add to the interface and initial state:

```typescript
// In interface AppState (after setSimilarityThreshold):
minSharpness: number
setMinSharpness: (value: number) => void

// In create<AppState> (after setSimilarityThreshold):
minSharpness: 0,
setMinSharpness: (value) => set({ minSharpness: value }),
```

- [ ] **Step 2: Add sharpness slider to PeopleToolbar**

In `frontend/src/components/PeopleToolbar.tsx`:

First, add to the Props interface:

```typescript
minSharpness: number
maxSharpness: number
onSharpnessChange: (value: number) => void
```

Add to the destructured props in the function signature.

Then add the slider JSX after the similarity `</div>` (~line 80) and before the Select/Deselect button (~line 81). Follow the exact same visual pattern as the similarity slider:

```tsx
<div className="flex items-center gap-2">
  <span
    className="text-xs text-text-soft"
    title="Minimum face sharpness to include. Higher values hide blurry faces."
  >
    Sharpness
  </span>
  <span className="text-[10px] text-text-soft/40">all</span>
  <input
    type="range"
    min="0"
    max={maxSharpness || 1}
    step={Math.max(1, Math.round((maxSharpness || 1) / 100))}
    value={minSharpness}
    onChange={(e) => onSharpnessChange(Number(e.target.value))}
    className="h-2 w-28 cursor-pointer appearance-none rounded-full bg-surface-alt accent-accent"
  />
  <span className="text-[10px] text-text-soft/40">sharp</span>
  <input
    type="number"
    min="0"
    max={maxSharpness || 1}
    step="1"
    value={Math.round(minSharpness)}
    onChange={(e) => {
      const v = Number(e.target.value)
      if (v >= 0) onSharpnessChange(v)
    }}
    className="w-14 appearance-none rounded bg-surface-alt px-1.5 py-0.5 text-right text-xs tabular-nums text-text outline-none focus:ring-1 focus:ring-ring [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
  />
</div>
```

- [ ] **Step 3: Wire up in useHomeData**

In `frontend/src/hooks/useHomeData.ts`:

Read minSharpness from the store (near the existing `similarityThreshold` read, ~line 93):

```typescript
const minSharpness = useAppStore((s) => s.minSharpness)
```

Pass it to usePersons (~line 198):

```typescript
const persons = usePersons(
  viewMode === 'people' && authenticated === true,
  similarityThreshold,
  minSharpness,
)
```

Expose `maxSharpness` in the return value — find where `persons` is included in the return object and ensure `maxSharpness` is accessible. The `usePersons` hook now returns `maxSharpness`, so it will be available as `persons.maxSharpness` from the caller.

- [ ] **Step 4: Wire up in index.tsx with debounce**

In `frontend/src/routes/index.tsx`:

Import `useCallback` and `useRef` if not already imported. Read from appStore:

```typescript
const minSharpness = useAppStore((s) => s.minSharpness)
const setMinSharpness = useAppStore((s) => s.setMinSharpness)
```

Add a debounced handler (300ms):

```typescript
const sharpnessTimerRef = useRef<ReturnType<typeof setTimeout>>(null)
const handleSharpnessChange = useCallback(
  (value: number) => {
    // Update slider position immediately (visual feedback)
    setMinSharpness(value)
    // Debounce the actual API call by delaying the query key change
    // Since minSharpness drives the query key in usePersons, the store
    // update triggers the query. To debounce, we need a different approach:
    // Use a local display value + debounced store update.
  },
  [setMinSharpness],
)
```

**Better approach:** Use a local state for the slider display value and debounce the store update:

```typescript
const [sharpnessDisplay, setSharpnessDisplay] = useState(minSharpness)
const sharpnessTimerRef = useRef<ReturnType<typeof setTimeout>>(null)
const handleSharpnessChange = useCallback(
  (value: number) => {
    setSharpnessDisplay(value)
    if (sharpnessTimerRef.current) clearTimeout(sharpnessTimerRef.current)
    sharpnessTimerRef.current = setTimeout(() => setMinSharpness(value), 300)
  },
  [setMinSharpness],
)
```

Pass to PeopleToolbar:

```tsx
<PeopleToolbar
  // ... existing props ...
  minSharpness={sharpnessDisplay}
  maxSharpness={data.persons.maxSharpness}
  onSharpnessChange={handleSharpnessChange}
/>
```

- [ ] **Step 5: Fix broken tests**

Update test files that render `PeopleToolbar` to include the new required props:

```typescript
minSharpness={0}
maxSharpness={100}
onSharpnessChange={() => {}}
```

Search: `grep -r "PeopleToolbar" frontend/src/components/__tests__/` to find which test files need updating.

- [ ] **Step 6: Run frontend checks**

Run: `cd frontend && bun run check`
Expected: PASS

- [ ] **Step 7: Run frontend tests**

Run: `cd frontend && bun run test`
Expected: All PASS

- [ ] **Step 8: Commit**

```bash
git add frontend/src/stores/appStore.ts frontend/src/components/PeopleToolbar.tsx frontend/src/hooks/useHomeData.ts frontend/src/routes/index.tsx frontend/src/components/__tests__/
git commit -m "feat: add sharpness slider to people toolbar"
```

---

### Task 6: End-to-end verification

- [ ] **Step 1: Run full backend test suite**

Run: `cd backend && uv run pytest -v`
Expected: All PASS

- [ ] **Step 2: Run full frontend test suite**

Run: `cd frontend && bun run test`
Expected: All PASS

- [ ] **Step 3: Run frontend checks (lint + format + types)**

Run: `cd frontend && bun run check`
Expected: PASS

- [ ] **Step 4: Manual smoke test (if app is running)**

1. Start the app
2. Navigate to People view
3. Verify the sharpness slider appears next to the similarity slider
4. If faces have been scanned, drag the slider and confirm persons disappear/reappear
5. If no faces scanned yet, trigger a scan and verify the slider works after
6. Verify the slider is responsive (no lag from debounce — visual update is instant, API call is debounced)

- [ ] **Step 5: Commit any remaining fixes**

```bash
git add -A && git commit -m "fix: address issues from e2e verification"
```
