# Third-party brand assets

Used only to label share buttons and the "Where do you sell today?" choices (decision #55).
Each file is copied byte for byte from the brand owner's official pack; the app scales them
proportionally and never recolours, crops, outlines or distorts them. The SVG text is
embedded in `src/ui/brandSvgs.ts`, and a test checks it is identical to these files.

| File                        | Source (pack → file)                                                                                                                                                         | Rules followed                                                                                                                                                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `whatsapp-glyph-green.svg`  | WhatsApp Brand Resource Center (meta.com/brand/resources/whatsapp/whatsapp-brand), downloaded 2026-10-04 → `01_Glyph/01_Digital RGB/03_SVG/Digital_Glyph_Green_RGB_2026.svg` | Only official assets; colours unchanged (green glyph on a white circle); not the most prominent element on the screen; clear space kept around it.                                                                       |
| `instagram-glyph-black.svg` | Instagram brand asset pack 2023 (meta.com/brand/resources/instagram/instagram-brand) → `01 Static Glyph/03 Black Glyph/Instagram_Glyph_Black.svg`                            | Official black glyph, unmodified. The pack's gradient SVG is a 10.9 MB embedded raster (the PNG is 5000 px), too heavy for the app, so the official black variant is used. No implied partnership.                       |
| `facebook-logo-primary.png` | Facebook Brand Asset Pack (meta.com/brand/resources/facebook/logo) → `Logo/Primary Logo/Facebook_Logo_Primary.png` (2084 × 2084)                                             | Primary logo (Facebook Blue with a white "f"); no recolouring, outlines or effects; shown at 26 dp or more (minimum 16 px); clear space of at least ¼ of the logo's width. The pack has no SVG, only this PNG and `.ai`. |

`google-g.svg`: Google's standard multicolour "G" for "Sign in with Google" buttons (decision #107), as published in Google's Sign in with Google branding guidelines (developers.google.com/identity/branding-guidelines): four official colours, never recoloured, outlined or distorted, on a white button with Google's button wording ("Sign up with Google", "Continue with Google"). The path data is the published standard "G"; compare it with the "Sign in with Google" pack before the public launch if in doubt.

`tiktok-icon-black-circle.png` (decision #108, amends #101 c): TikTok's official full-colour icon on its black circle, copied byte for byte from TikTok's developer logo pack.

- Source: https://developers.tiktok.com/doc/getting-started-design-guidelines → "logo-pack.zip" (https://sf16-va.tiktokcdn.com/obj/eden-va2/uvzhqeh7nuhd/tt4d/logo-pack.zip, 6,588,461 bytes, sha256 `b3f31728ceb6ce6fc1a0ae8c635a0223e35ac2f7d203b2743e713541bf2085cd`), downloaded 2026-10-11.
- File in the pack: `Dev Portal Logo Pack/TikTok Logo Pack/TikTok – Icons/TikTok_Icon_Black_Circle.png` (1200 × 1200, 18,423 bytes), sha256 `a21b43e31bb9def6d01c8c433a577353ae3efc8003a6257e8f3db3fd2dc94e61` (a test checks it).
- Why this file: the pack has no full-colour icon on its own for light backgrounds (the icon SVGs in the button pack are one colour; the light-background colour logos include the "TikTok" wordmark; the rest are `.ai` files). The owner chose the black circle, used unmodified.
- Shown at 24 dp on the same light tiles and white circles as the other marks, next to the word "TikTok"; scaled only, never recoloured, outlined or cropped.
- TikTok's guidelines say its logos need prior written permission. The owner knows and accepts this (#108); the permission request (`docs/tiktok-logo-request.md`) is still to be sent. The zip is not in the repo.
  WhatsApp Status uses oda's own ring drawing in WhatsApp green (not a logo).
