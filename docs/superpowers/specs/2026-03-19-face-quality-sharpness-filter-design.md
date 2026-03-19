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
- `sharpness` — compute Laplacian variance on the grayscale face crop: `cv2.Laplacian(gray_crop, cv2.CV_64F).var()`

These are added to the returned dict and inserted into the `faces` table alongside existing fields.

### Migration

- `ALTER TABLE faces ADD COLUMN pitch REAL`
- `ALTER TABLE faces ADD COLUMN yaw REAL`
- `ALTER TABLE faces ADD COLUMN roll REAL`
- `ALTER TABLE faces ADD COLUMN sharpness REAL`

Existing faces get these columns populated on next rescan (`force_rescan=True`). Null values are treated as "unknown quality" and not filtered out.

## Sharpness Slider Filter

### Frontend

- New slider in `PeopleToolbar.tsx`, visually consistent with the existing similarity threshold slider
- Label: "Min Sharpness"
- Range: 0–max (where max is derived from the data, or a sensible fixed upper bound like 1000)
- Default: 0 (show everything)
- Value stored in URL search params (`minSharpness`) for persistence, consistent with existing filter pattern
- Debounced to avoid excessive API calls while dragging

### Backend

- New optional query param on `GET /faces/persons`: `min_sharpness` (float, default 0)
- When `min_sharpness > 0`:
  - Exclude faces where `sharpness < min_sharpness` OR `sharpness IS NULL`
  - Persons whose remaining face count drops to 0 are excluded from the response
  - `face_count` in the response reflects the filtered count
  - `representative_face_id` is recomputed from remaining faces (highest confidence among qualifying faces)

### Clustering

No changes. DBSCAN clustering uses all faces regardless of quality. The sharpness filter is purely a view-layer concern — it controls what the user sees, not how persons are formed.

## Scope

### In scope
- Store pitch/yaw/roll/sharpness during face scanning
- Schema migration for new columns
- Sharpness slider in people toolbar
- Backend filtering on `GET /faces/persons`
- URL param persistence for the slider value

### Out of scope
- Composite quality score (combining sharpness + pose)
- Automatic exclusion from clustering
- Age/gender extraction (trivial to add later)
- Smart representative selection based on quality
- Any changes to the face scanning pipeline beyond storing extra attributes
