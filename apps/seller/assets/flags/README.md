# Flags

`ke.svg`: Kenya's flag, shown before every +254 phone prefix (decision #109 b): onboarding
"Name your shop", Settings → Your details, and (a byte-identical copy in
`apps/web/public/flags/`) the web checkout.

- Source: [flag-icons](https://github.com/lipis/flag-icons) by Panayiotis Lipiridis, version
  **7.2.3**, file `flags/4x3/ke.svg`, downloaded 2026-10-11 from
  https://cdn.jsdelivr.net/npm/flag-icons@7.2.3/flags/4x3/ke.svg
- Licence: MIT; the licence text is `LICENSE-flag-icons` in this folder (copied from the same
  package).
- sha256 `699163d87382eb969d8a26d4ce1a99a00264e8b7b95276abf585476506f46e82` (1,421 bytes, CRLF
  line endings as published; `.gitattributes` keeps it byte for byte). Tests check both copies.
- Unmodified: black, white, red, white, green with the Maasai shield and spears. The app embeds
  the same text in `src/ui/flagSvgs.ts` (a test checks it is identical) and draws it with
  react-native-svg at 20 × 14 dp, rounded 3; the 4:3 flag fills that box (only a sliver of the
  top and bottom stripes is outside it). The web shows the file with `<img>` at the same size.
