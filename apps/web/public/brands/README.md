# Third-party brand assets (web)

Used by the shop page's "Chat with … on WhatsApp" button (next to Share).

- `whatsapp-glyph-green.svg`: a byte-for-byte copy of
  `apps/seller/assets/brands/whatsapp-glyph-green.svg` (WhatsApp Brand Resource Center; that
  folder's README gives the pack and file). Official glyph with its colours unchanged (green
  glyph on a white circle), scaled proportionally, never recoloured, cropped or outlined.
  `apps/web/test/brandAssets.test.ts` checks the two files stay identical.
- `tiktok-icon-black-circle.png`: a byte-for-byte copy of
  `apps/seller/assets/brands/tiktok-icon-black-circle.png` (TikTok's developer logo pack,
  `TikTok – Icons/TikTok_Icon_Black_Circle.png`, downloaded 2026-10-11; sha256
  `a21b43e31bb9def6d01c8c433a577353ae3efc8003a6257e8f3db3fd2dc94e61`; that folder's README has
  the source URL and the pack's hash; decision #108). The web shows no TikTok mark yet; the
  copy keeps app and web on the same file. The same test checks both copies and the hash.
