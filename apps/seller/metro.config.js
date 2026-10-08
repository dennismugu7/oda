// Metro: Expo's default config plus Sentry's serializer, which writes a Debug ID into every
// bundle and its source map, so errors from an EAS Update map back to the source once the
// eas-update-preview workflow has uploaded that update's maps (decision #90). Bundling only:
// no native change.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
