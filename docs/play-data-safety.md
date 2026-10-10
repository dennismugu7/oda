# Play Console: data safety answer sheet (M11 CP4, decision #93 D12)

For filling in **Play Console → App content → Data safety** for the seller app
`com.mugulabs.oda`. Taken from the code and the approved privacy policy
(`apps/web/app/privacy/page.tsx`, decision #98). The owner fills in the form; this sheet only
saves looking things up. If the app starts collecting, sharing or keeping data differently,
update this sheet and the privacy policy in the same PR.

Play asks about data **the app** collects or shares. The buyer web shop isn't part of the app,
but buyer details a seller types into the app (manual orders) and buyer details the app shows
are included below.

## Overview questions

| Question | Answer |
| --- | --- |
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** (HTTPS only; the app talks only to `https://oda.mugu-labs.com`, Expo and Sentry) |
| Which of the following methods of account creation does your app support? | **Username and password** (email + password, with an emailed code). No sign-in with Google or others. |
| Do you provide a way for users to request that their data is deleted? | **Yes**: in the app (More → Settings → Delete account) and on the web |
| Delete account URL | `https://oda.mugu-labs.com/delete-account` |
| Privacy policy URL | `https://oda.mugu-labs.com/privacy` |
| Does your app share user data with third parties? | **No.** Play doesn't count service providers that process data for oda (Neon, Vercel, Resend, Sentry, Expo/Firebase) as sharing, nor data the seller chooses to publish on their own shop page. |
| Independent security review | No |
| Families / children | Not designed for children (sellers 18+, terms) |

## Data types

Every type below is **collected**, **not shared**, **not processed ephemerally** (it's stored),
and kept until the seller deletes their account (then removed 30 days later; backups 14 more
days), except where noted.

| Play category → type | What it is in oda | Required or optional | Purposes to tick |
| --- | --- | --- | --- |
| Personal info → **Name** | Seller's first and last name; buyers' names on orders (manual orders are typed in the app) | Required (seller name at sign-up; buyer name on an order) | App functionality, Account management |
| Personal info → **Email address** | Seller's sign-in email; a buyer's email if they gave one (not shown in the app) | Required | App functionality, Account management, Developer communications (account emails only: codes, resets, deletion) |
| Personal info → **Phone number** | Shop WhatsApp number, recovery phone (optional), buyers' phone / WhatsApp numbers on orders | Required (shop WhatsApp; buyer phone on an order) | App functionality |
| Personal info → **Address** | Buyers' delivery addresses on orders; the shop's location and pickup details as typed (text, not GPS) | Optional | App functionality |
| Personal info → **Other info** | Setup answers (what you sell, where you sell), social handles | Optional | App functionality |
| Financial info → **Other financial info** | The shop's M-Pesa Till / Paybill / Pochi number and name, and the M-Pesa codes buyers enter after paying. No cards, no bank accounts, no money passes through oda. | Optional (a shop can take pay on delivery only) | App functionality |
| Financial info → **Purchase history** | The shop's orders and sales figures (Insights, Customers) | Required (it's what the app is for) | App functionality |
| Photos and videos → **Photos** | Product photos, shop logo, an optional screenshot with feedback. Photos with location data are refused. | Optional | App functionality |
| Messages → **Other in-app messages** | Replies to reviews; the private cancel note | Optional | App functionality |
| App activity → **Other user-generated content** | Product names, descriptions, prices, categories, delivery areas, feedback text | Required (a shop needs products) | App functionality |
| App info and performance → **Crash logs** | Sentry error reports (EU), with emails, phones, codes, links and tokens removed before sending; kept by Sentry for a limited time | Required (can't be turned off in the app) | App functionality (fixing errors) |
| App info and performance → **Diagnostics** | Same Sentry reports: app version, device model, Android version | Required | App functionality |
| Device or other IDs → **Device or other IDs** | The Expo push token, so new orders reach the seller's phone; sign-in records keep the device type and IP address for security (60 days without use) | Required for notifications; sign-in records required | App functionality, Fraud prevention, security and compliance |

## Not collected (leave unticked)

- **Location** (precise or approximate): the app never reads the phone's location. Typed shop
  and delivery addresses are listed under Address above.
- **Contacts**, **Calendar**, **SMS / call logs**, **Files and docs** (other than the photos
  above), **Audio**, **Health and fitness**, **Web browsing**, **Installed apps**,
  **Search history** (the order search runs on the shop's own orders), **Race, religion,
  political or sexual orientation**, **User payment info** (no cards or bank accounts).
- **Advertising or marketing**, **Analytics**, **Personalisation**: no purpose of this kind
  anywhere. oda has no ads, analytics or tracking tools.

## Notes for the owner

- The push notification text can contain a buyer's name, the amount and an M-Pesa code;
  it goes through Expo and Firebase only to deliver the notification (service providers, not
  sharing).
- If Play asks why "Financial info" is collected: sellers enter their own M-Pesa details so
  buyers know where to pay; oda never receives or holds money (terms).
- Unsaved form text kept for state restoration (decision #100: encrypted in SecureStore on the
  phone, at most 12 hours, removed on sign-out) never leaves the phone, so it isn't "collected"
  in Play's sense.
