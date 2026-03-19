# Face Quality & Sharpness Filter

## Problem

InsightFace's `buffalo_l` model computes pose (pitch/yaw/roll) and the face crop contains sharpness information, but we discard all of it. The people grid shows every detected face regardless of quality, cluttering it with blurry, side-angle, and unrecognizable faces.

## Solution

1. Store face quality attributes (pose angles + sharpness) during scanning
2. Add a sharpness slider to the people toolbar that filters out low-quality faces

## Data Foundation

### New columns on `faces` table

| Column | Type | Description |
|--------|------|-------------|
| `pitch` | REAL | Head pitch angle in degrees (up/down) |
| `yaw` | REAL | Head yaw angle in degrees (left/right) |
| `roll` | REAL | Head roll angle in degrees (tilt) |
| `sharpness` | REAL | Laplacian variance of face crop (higher = sharper) |

### Extraction

In `_detect_faces_in_image()`:
- `pitch`, `yaw`, `roll` — already available on `face.pose` (ndarray of 3 floats), computed by the `1k3d68` 3D landmark model that `buffalo_l` includes
- `sharpness` — compute Laplacian variance on the **original-resolution** cropped face region (before the 112x112 resize in `_save_face_crop`). Using the pre-resize crop preserves the true sharpness signal that downscaling would smooth away. Formula: `cv2.Laplacian(gray_crop, cv2.CV_64F).var()`

These are added to the returned dict and stored via `insert_faces_batch()`.

### Database changes

**Migration (ALTER TABLE):**
```sql
ALTER TABLE faces ADD COLUMN pitch REAL;
ALTER TABLE faces ADD COLUMN yaw REAL;
ALTER TABLE faces ADD COLUMN roll REAL;
ALTER TABLE faces ADD COLUMN sharpness REAL;
```

**Functions that hardcode `faces` column lists and must be updated:**
- `insert_faces_batch()` — add the four new columns to the INSERT statement
- `_migrate_to_autoincrement()` — update the hardcoded schema so future migrations preserve the columns

Existing faces get these columns populated on next rescan (`force_rescan=True`). Null values are treated as "unknown quality" and not filtered out.

## Sharpness Slider Filter

### Frontend

- New slider in `PeopleToolbar.tsx`, visually consistent with the existing similarity threshold slider
- Label: "Min Sharpness"
- Range: 0–100 (normalized). Backend returns `max_sharpness` alongside persons list; frontend maps slider 0–100 to 0–max_sharpness linearly. This avoids hardcoding a range that won't match the actual data distribution.
- Default: 0 (show everything)
- Value stored in URL search params (`minSharpness`) for persistence, consistent with existing filter pattern
- Debounced (300ms) to avoid excessive API calls while dragging, matching existing slider behavior
- Update `Person` Zod schema if any new fields are added to the response

### Backend

- New optional query param on `GET /faces/persons`: `min_sharpness` (float, default 0)
- Response includes `max_sharpness` (float) — the maximum sharpness value across all faces in the DB, for slider range calibration
- When `min_sharpness > 0`:
  - Exclude faces where `sharpness < min_sharpness` OR `sharpness IS NULL`
  - Persons whose remaining face count drops to 0 are excluded from the response
  - `face_count` in the response reflects the filtered count
  - `representative_face_id` is recomputed from remaining faces (highest confidence among qualifying faces)

**Filtering approach:** Refactor `get_all_persons()` to accept `min_sharpness` param. Use a CTE or subquery to first filter qualifying faces, then aggregate per person:

```sql
WITH qualified_faces AS (
    SELECT id, person_id, confidence, crop_path
    FROM faces
    WHERE sharpness >= :min_sharpness OR :min_sharpness = 0
)
SELECT
    p.id, p.name, p.created_at, p.updated_at,
    COUNT(qf.id) AS face_count,
    -- representative = highest confidence among qualifying faces
    (SELECT qf2.id FROM qualified_faces qf2
     WHERE qf2.person_id = p.id
     ORDER BY qf2.confidence DESC LIMIT 1) AS representative_face_id
FROM persons p
JOIN qualified_faces qf ON qf.person_id = p.id
GROUP BY p.id
HAVING COUNT(qf.id) > 0
ORDER BY face_count DESC
```

### PersonDetail page

Sharpness filtering applies only to the PeopleGrid (person listing). The PersonDetail page shows all faces for that person regardless of the filter — this lets users see and manage the full set of faces for any person they navigate to.

### Clustering

No changes. DBSCAN clustering uses all faces regardless of quality. The sharpness filter is purely a view-layer concern — it controls what the user sees, not how persons are formed.

## Scope

### In scope
- Store pitch/yaw/roll/sharpness during face scanning
- Schema migration for new columns
- Update `insert_faces_batch()` and `_migrate_to_autoincrement()` column lists
- Sharpness slider in people toolbar
- Backend filtering on `GET /faces/persons` with `min_sharpness` + `max_sharpness` in response
- URL param persistence for the slider value
- Frontend Zod schema updates

### Out of scope
- Composite quality score (combining sharpness + pose)
- Automatic exclusion from clustering
- Age/gender extraction (trivial to add later)
- Smart representative selection based on quality
- Any changes to the face scanning pipeline beyond storing extra attributes
