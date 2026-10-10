import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/poppins';
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
  const [loaded, error] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    // Welcome logo and headline (the approved preview uses 800).
    Poppins_800ExtraBold,
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
