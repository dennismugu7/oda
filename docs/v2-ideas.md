# V2 ideas

Things deliberately left out of v1, kept so they aren't lost. Not planned or approved: each one
needs the owner's go-ahead (and usually a plan) before any work. Newest first. See also
`spec.md` §9 (out of scope for v1).

| Idea | Why it waits | Decided |
|---|---|---|
| **Move Google sign-in to Credential Manager** (Google's replacement for the legacy Android Google Sign-In API) | v1 uses the free `@react-native-google-signin/google-signin` "original" API on Google's deprecated legacy SDK, kept in `src/auth/google.ts`. Move if Google announces a removal date, or if the paid "Universal" module or another maintained Credential Manager library becomes the better choice. One file plus a native build. | Decision #107 (owner, review stop A) |
| **Maestro device tests for the seller app** (end-to-end flows on an emulator or the Redmi) | A CLI + Java, hundreds of MB; v1 uses `jest-expo` + React Native Testing Library plus the phone regression script. | Decision #81 (owner Step 89) |
| **QR code image on the Share screen** ("For your stall": a printable QR of the shop link, tagged `?s=qr`) | The QR packages pull in extra downloads; v1 ships New in + Collection. The `?s=qr` source tag already exists. | Decision #79 (owner Step 87) |
