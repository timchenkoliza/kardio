# Media Resolution Gate

Status: ACTIVE — read-only transport resolution

## Goal

Resolve Telegram Desktop local media references such as `photos/...`, `video_files/...` and `gifs/...` to concrete raw archive artifacts without promoting them into the ontology and without assuming media rights.

## Pipeline

```text
DistributionPostCandidateMedia
  ↓
normalize local href
  ↓
resolve exact/suffix transport path inside the same sourceRegistryId
  ↓
coarse source-grounded role
  ↓
rights = unknown
  ↓
product eligibility = blocked until explicit rights review
```

## Semantic roles

The resolver intentionally does not infer diagnoses, anatomy or clinical meaning from post prose. It only assigns coarse roles from the exported media kind:

- photo → `image_candidate`
- video / gif / round video → `cine_candidate`
- file → `document_candidate`
- voice → `audio_candidate`
- webpage thumb / thumbnail → `thumbnail_candidate`
- other / sticker → `unsupported`

A later reviewed layer may add modality such as CT, MRI, echo or angiography when that fact is explicit in source metadata or manually verified.

## Rights boundary

Successful transport resolution does not make an asset product-eligible.

Every resolved archive asset remains:

```text
rightsState = unknown
productEligibility = blocked_rights_unknown
```

until a separate rights decision exists. Missing or ambiguous transport stays blocked as well. Runtime byte availability is not a rights decision.

## Current Drive observation — 2026-10-19

The `cardiology_channel_01` Telegram export root currently contains `photos`, `video_files`, `gifs`, `thumbs`, `files`, `round_video_messages`, `webpage_thumbs`, `css`, `js` and the 6.8 MB `messages.html` export.

The earlier observation that `photos`, `video_files` and `gifs` had no children is now stale. A direct read-only Drive inspection on 2026-10-19 found real binary children in all three inspected transport folders:

- `photos` contains many JPEG children; the bounded listing returned at least 100 entries, including `photo_3813_0.jpg`, `photo_3810_0.jpg` and `photo_3809_0.jpg`;
- `video_files` contains MP4/MOV transport assets; a bounded listing returned at least 20 entries;
- `gifs` currently contains four MP4 transport assets.

This proves current archive byte presence only. Filenames and transport folders do not establish clinical modality, semantic match, publication rights, editorial approval or product eligibility.

The raw Postgres inventory is still the resolver's operational input. If it predates these uploaded Drive children, run the existing read-only/raw inventory sync before interpreting `resolution:media-inspect`; do not treat a stale database miss as proof that Drive bytes are absent.

## Inspector

Run with local Postgres available:

```bash
npm run resolution:media-inspect
```

Optional source override:

```bash
MEDIA_RESOLUTION_SOURCE=cardiology_channel_02 npm run resolution:media-inspect
```

The inspector is privacy-safe: it reports hrefs, media kinds and resolution state only. It does not print Telegram body text. It performs zero ontology and staging writes.

## Release-candidate rendering rule

The product must stay image-free for a slot unless the selected real asset has all of the following:

1. deterministic transport resolution to the source artifact;
2. explicit rights approval;
3. explicit editorial approval;
4. strong or exact semantic match to that slot;
5. runtime availability.

The existing prototype/media path must not weaken this rule. `needs_review` and `unknown` are blocked states, even when bytes are already accessible.

## Acceptance for automatic real-media rendering

Before automatic real-media rendering from the Telegram archive:

1. raw inventory must contain the actual binary children referenced by Telegram HTML;
2. transport resolution must be deterministic and non-ambiguous;
3. rights state must be explicitly reviewed;
4. editorial/semantic placement must be explicitly reviewed;
5. only then can a runtime media endpoint materialize the approved file;
6. diagnostic images must remain untinted by product palette.
