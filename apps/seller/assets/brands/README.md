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

TikTok: TikTok's developer guidelines forbid using its logo without written permission, so
the TikTok button and choice use a neutral music-note icon with the word "TikTok".
WhatsApp Status uses oda's own ring drawing in WhatsApp green (not a logo).
