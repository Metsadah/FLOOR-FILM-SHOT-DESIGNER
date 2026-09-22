# Rooms — the room library and its format

A **room** is a scouted space: walls with doors, windows and openings, plus
the furniture that is part of the location. Rooms live in one library per
account, independent of productions, so a space scanned in March is there
for the shoot in June. Floorboard (web / iPad) saves rooms drawn by hand;
the **Floorboard Scout** app (iPhone, step 2) adds scans — LiDAR / RoomPlan
on Pro devices, ARKit "tap the corners" on everything else.

## Where rooms are stored

Key-value rows, exactly like productions:

| mode  | store                         | key                | value        |
|-------|-------------------------------|--------------------|--------------|
| local | IndexedDB (`window.storage`)  | `sd:room:<id>`     | JSON string  |
| cloud | Supabase table `kv`           | `sd:room:<id>`     | JSON string  |

`kv` is `(user_id, key, value, updated_at)` with row-level security on
`user_id`. The Scout app signs in with the same Supabase account and
upserts `{user_id, key:'sd:room:<id>', value:JSON}` — nothing else to set up.
Listing = `select key from kv where key like 'sd:room:%'`.

## Format (v1)

Units are **centimetres**, y grows downwards (screen convention), and the
room is normalised so the bounding-box centre is at `(0,0)`.

```json
{
  "v": 1,
  "id": "k7f3…",                       // any unique string
  "name": "Kitchen",
  "location": "Zeeburgerpad 12, Amsterdam",
  "source": "manual",                   // manual | roomplan | arkit | import
  "createdAt": "2026-09-22T10:00:00.000Z",
  "updatedAt": "2026-09-22T10:00:00.000Z",
  "walls": [
    { "x1": -300, "y1": -200, "x2": 300, "y2": -200,
      "openings": [ { "t": 0.5, "w": 90, "type": "door", "flip": false } ] }
  ],
  "props": [
    { "kind": "sofa", "x": 0, "y": 120, "rot": 0, "w": 200, "h": 90, "label": "" }
  ],
  "notes": "",
  "thumb": "data:image/jpeg;base64,…",   // ~220 px plan, optional
  "bbox": { "w": 600, "h": 400 }
}
```

- **walls**: straight segments. `openings[].t` is the position along the
  wall (0 = start, 1 = end), `w` the width in cm, `type` one of `door`,
  `window`, `gap` (an opening without a door), `flip` mirrors a door swing.
- **props**: furniture as Floorboard prop kinds (`sofa`, `table`, `chair`,
  `bed`, `kitchen`, `bath`, `toilet`, `sink`, `desk`, `plant`, `tv`…; see
  `PROPS` in `js/00-catalog.js`). Unknown kinds may be sent as `"box"` with
  a `label` — they still show as a block of the right size.
- Everything else (cameras, cast, lights) is deliberately not part of a
  room: those belong to a shot, not a location.

## RoomPlan → room (for the Scout app)

`CapturedRoom` gives walls, doors, windows, openings and objects as
oriented boxes in metres. Mapping:

1. Project onto the floor plane; use the wall's transform to get the two end
   points of its length axis; multiply by 100 → cm; flip the y axis.
2. Doors / windows / openings carry a `parentIdentifier` (their wall):
   `t` = distance of the box centre from the wall start ÷ wall length,
   `w` = the box width × 100.
3. Objects → props: `storage` → `cabinet`, `sofa`, `table`, `chair`, `bed`,
   `stove` → `kitchen`, `bathtub` → `bath`, `toilet`, `sink`, `television`
   → `tv`; everything else `box` with the category as label.
4. Normalise (bbox centre to 0,0), render a thumb, `source:"roomplan"`.

ARKit without LiDAR: let the user tap floor corners in order (plane
anchors), close the polygon, then add doors/windows by tapping wall points;
`source:"arkit"`. Same JSON.

## In the app

- Shot designer toolbar → **Room library** button (house icon): save the
  current scene's walls + furniture as a room, or insert a saved room at
  the middle of the view (optionally replacing the scene's walls).
- Inserted furniture becomes ordinary props; walls become ordinary walls.
