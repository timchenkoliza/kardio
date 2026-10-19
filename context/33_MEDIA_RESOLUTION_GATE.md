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

Every resolved asset remains:

```text
rightsState = unknown
productEligibility = blocked_rights_unknown
```

until a separate rights decision exists. Missing or ambiguous transport stays blocked as well.

## Current Drive observation

The cardiology Telegram export root contains transport folders including `photos`, `video_files`, `gifs`, `thumbs`, `files`, `round_video_messages` and `webpage_thumbs`, plus `messages.html`.

At the time of this gate, Drive listing of the cardiology `photos`, `video_files` and `gifs` folders returned no child files. This is a transport/archive completeness issue, not a reason to substitute unrelated media.

## Inspector

Run with local Postgres available:

```bash
npm run resolution:media-inspect
```

Optional source override:

```bash
MEDIA_RESOLUTION_SOURCE=cardiology_channel_02 npm run resolution:media-inspect
```

The inspector is privacy-safe: it reports hrefs, media kinds and resolution state only. It does not print Telegram body text.

## Acceptance for the next gate

Before automatic real-media rendering from Telegram archive:

1. raw inventory must contain the actual binary children referenced by Telegram HTML;
2. transport resolution must be deterministic and non-ambiguous;
3. rights state must be explicitly reviewed;
4. only then can a runtime media endpoint materialize the approved file;
5. diagnostic images must remain untinted by product palette.
