# Admin-only WAV review batch

The first authenticated admin page load after this feature is deployed captures
all existing track IDs and their normal/Lap 3 BRSTM URL fingerprints. Tracks
without either BRSTM are excluded. Later uploads do not join this batch.

Only the admin page requests or renders review status. The marker is a manual
work label, not a codec or audio-quality detector. An unchanged BRSTM URL pair
retains the label. Changing either BRSTM URL clears the song's label; changing
titles, tags, visibility, or preview MP3 URLs does not. Restoring both original
URLs restores the label, because those files belong to the original batch.

The immutable baseline is created in R2 at
`__admin__/brstm-wav-review-v1.enc` using `If-None-Match: *`, so concurrent tabs
cannot overwrite it. The file body is AES-256-GCM encrypted with a key derived
from the server-only R2 secret; even a public bucket URL cannot reveal the
administration state. The unused-file audit explicitly excludes `__admin__/`.

Do not delete this object or replace it with a new baseline during normal
maintenance. If rotating `R2_SECRET_ACCESS_KEY`, re-encrypt this object with the
new secret before switching credentials (retain the previous secret securely
until migration is verified). Decryption errors fail closed and never reset the
batch. No audio files or database schema are modified by this feature.

Verification: `node --experimental-strip-types --test tests/brstmWavReview.test.ts tests/r2Audit.test.ts tests/r2Usage.test.ts`.
