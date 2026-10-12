// What the staging regression can't automate (decisions #92, #107, #110): the owner does these
// by hand on the phone, with the release APK that has the stack. Printed at the end of every
// run's summary, without ✅ / ❌, since the run never checks them.

export const MANUAL_STEPS: readonly string[] = [
  'M.1 Google sign-in (#107): Continue with Google with a new Google account → onboarding step 1; sign out, then Continue with Google again → back in the same shop.',
  'M.2 Google sign-in with an email that already has a password account (#107): it signs in to that account; Log out shows that account’s full email.',
  'M.3 Log out (#109 a): oda’s sheet “Are you sure you want to log out of <full email>?”; Cancel and a tap outside keep you in, Log out signs out.',
  'M.4 Confirmation sheets (#109 a): delete a delivery area, remove a payment account, pause the shop, leave the product form with changes: each asks in oda’s sheet (no Android alert); Android back cancels.',
  'M.5 Kenya flag (#109 b, #110 h): onboarding “Name your shop” and Settings → Your details show the whole flag before +254.',
  'M.6 TikTok mark (#108): onboarding step 2, Share your shop and Settings → Shop profile show TikTok’s official icon.',
  'M.7 Home banner (#109 c, #110 a): pause the shop → “Your shop isn’t taking orders yet” with “Turn off Pause shop”; resume → the banner goes.',
  'M.8 Optional delivery in the app (#110): an arranged order shows “ARRANGED WITH BUYER”; Mark as sent offers By rider / By parcel / Buyer collects; New order offers “Arrange with buyer”; Delivery says “Delivery is optional”.',
];
