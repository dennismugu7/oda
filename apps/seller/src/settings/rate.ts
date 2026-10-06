// Rate the app (21-rate-app). Play's in-app review only works for an app installed from Google
// Play; the preview APK is sideloaded and oda has no Play listing until M11, where Play would
// silently show nothing. So the review is asked for only once the app config has a Play
// listing (`android.playStoreUrl`, read by expo-store-review's storeUrl()); before that the
// seller gets a clear "not on Google Play yet" (decision #78). Low ratings go to feedback.

export const STAR_LABELS = ['Not good', 'Could be better', 'It’s okay', 'Good', 'Love it!'];

export type RateNext = 'feedback' | 'review' | 'not_on_play';

/** What "Rate" does for this many stars. */
export function rateNext(stars: number, onPlay: boolean): RateNext {
  if (stars <= 3) return 'feedback';
  return onPlay ? 'review' : 'not_on_play';
}

export function rateButtonTitle(stars: number): string {
  return stars <= 3 ? 'Tell us what to improve' : 'Rate on Play Store';
}
