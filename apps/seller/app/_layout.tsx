import {
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from '@expo-google-fonts/bricolage-grotesque';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useRouteMemory } from '@/restore/useRouteMemory';
import { initSentry, wrapRoot } from '@/sentry';
import { colors } from '@/theme';

initSentry();
SplashScreen.preventAutoHideAsync();

function RootLayout() {
  // Inter for text, Bricolage Grotesque for headings and names (decision #102). Loaded in JS,
  // so a font change ships as an EAS Update.
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
  });
  // Remember the screen when oda goes to the background (decision #100).
  useRouteMemory();

  useEffect(() => {
    // On a font error we still show the app (system font) rather than hang on the splash.
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}
      />
    </>
  );
}

export default wrapRoot(RootLayout);
