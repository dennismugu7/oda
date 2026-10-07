# @oda/ui-tokens

Colours, type, spacing and radii shared by `apps/web` (Tailwind 4 theme) and `apps/seller` (React Native styles). `src/tokens.ts` is the single source; `src/theme.css` is generated from it:

```sh
pnpm --filter @oda/ui-tokens generate
```

A test fails if `theme.css` is out of date.

## How the values were measured

- **Scale.** Seller screens 09–21 are 900×2000 (360 dp at 2.5×). Screens 02–08 are 1080×1920 and 01 is 1080×2400 (3×). Web screens are 1170×2532 (390 CSS px at 3×). Pixel measurements are divided by the scale and snapped to a 4-point grid.
- **Colours.** Median of a 7×7 patch at the centre of flat regions (never on edges), sampled with `sharp`. Text colours use the darkest pixel inside a glyph region.
- **Font.** Poppins (400/500/600/700). Screens 03–08 and the button on 02 use other fonts in the mockups; Poppins is used everywhere.

| Token             | Value                 | Sampled from (file @ x,y in image pixels)                                             |
| ----------------- | --------------------- | ------------------------------------------------------------------------------------- |
| primary           | `#D94A27`             | 09 Next button @450,1850; 16 today bar @763,1320; web 01 View cart @745,2330          |
| primaryTint       | `#FDF0EA`             | 01 "Create new shop" @540,2140                                                        |
| primarySoft       | `#F2C7B9`             | 16 chart bar @135,1320                                                                |
| navy              | `#1C1A2E`             | 09 header @450,90; 09 heading glyphs; 11 focused input border                         |
| navyRaised        | `#2D2B3E`             | 14 link field @560,500                                                                |
| navyMuted         | `#444353`             | 09 inactive progress segment @245,228                                                 |
| green             | `#1F7A55`             | 11 Chat button @672,612; 16 progress @200,1692; 17b toggle @750,1622; web 03 progress |
| greenBright       | `#2FAE74`             | 14 success circle @70,245; logo dot on navy (09 @488,150)                             |
| greenTint         | `#E4F2EC`             | 09 info card @450,1620; 16 "+22%" chip; web 02 "Save 22%"                             |
| background        | `#F7F7F8`             | 09 page @450,1720                                                                     |
| surface           | `#FFFFFF`             | cards, inputs; web page background                                                    |
| surfaceMuted      | `#F1F1F4`             | 17b close button @790,870; 16 count pill (`#EFEFF3`)                                  |
| beige             | `#EFE8E0`             | 11 "what buyers see" card @450,440                                                    |
| peach             | `#FBE9E3`             | 09 selected icon tile @100,620; 16 avatar @110,690                                    |
| border            | `#E3E2E8`             | 09 card edge scan @464,594–600; 12 input edge @300,1136                               |
| track             | `#ECECF1`             | 16 progress track @650,1692                                                           |
| toggleOff         | `#D9D8E0`             | 20b-settings toggle @790,882                                                          |
| textSecondary     | `#55536A`             | 09 subtitle; 16 "#1042 · KSh 2,500"; tab labels                                       |
| textMuted         | `#717081` (M10, #84)  | 12 "Optional"; 17b-mark-sent placeholder                                              |
| warningTint       | `#FBF1DC`             | 16 "Says paid" chip; 17 payment card @450,420; 17b refund box                         |
| warningText       | `#936511` (M10, #84)  | 16 "Says paid" text                                                                   |
| warningTextStrong | `#6B4A0C`             | 17 "Wanjiku says she paid" heading                                                    |
| warningAccent     | `#CC9B44`             | 17 stepper ring @350,238                                                              |
| danger            | `#B3261E`             | 17b "Cancel order" @450,1760                                                          |
| star              | `#E0A52B`             | 20b-reviews rating bar @500,441 (web 02 star is brighter, `#F2A413`)                  |
| info / infoTint   | `#2D5FA8` / `#E6EDF8` | 16 "B" avatar                                                                         |

| Geometry             | Value                       | Measured                                                         |
| -------------------- | --------------------------- | ---------------------------------------------------------------- |
| Button height        | 48                          | 09 Next: 121 px tall at 2.5×                                     |
| Input height         | 44                          | 12 name input: ~106 px at 2.5× (rounded up to the 44 tap target) |
| Border               | 1 (2 when focused/selected) | 12 input edge ~2 px, 11 focused ~5 px at 2.5×                    |
| Header bottom radius | 24                          | 16 header corner: ~54 px radius at 2.5×                          |
| Card radius          | 20                          | 09 option cards                                                  |
| Input radius         | 16                          | 12, 18-edit-product inputs                                       |
| Screen side padding  | 20                          | 09 content starts at x=50 (2.5×)                                 |
