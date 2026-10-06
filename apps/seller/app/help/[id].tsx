// One help guide (20b-help → guide): its sections, with button names in bold and config values
// (the web delete page, the support email) filled in.
import { displayUrl } from '@oda/shared';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { SHOP_BASE_URL } from '@/config';
import { GUIDES } from '@/help/guides';
import { boldSegments, fillVars } from '@/help/search';
import { FALLBACK_SUPPORT, supportCache } from '@/help/support';
import { growApi } from '@/insights/api';
import { goBack, SettingsLayout } from '@/settings/SettingsLayout';
import { useLoaded } from '@/settings/useLoaded';
import { Card } from '@/ui/rows';
import { colors, spacing, text } from '@/theme';

export default function GuideScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const guide = GUIDES.find((g) => g.id === id);
  const { data } = useLoaded(growApi.support, supportCache);
  const vars = {
    deleteAccountUrl: displayUrl(SHOP_BASE_URL, 'delete-account'),
    supportEmail: (data ?? FALLBACK_SUPPORT).email,
  };
  return (
    <SettingsLayout
      title={guide?.title ?? 'Help'}
      subtitle={guide?.summary ?? null}
      loaded={!!guide}
      error={guide ? null : 'This guide isn’t here any more.'}
      onRetry={() => goBack('/help')}
      back={() => goBack('/help')}
    >
      {guide
        ? guide.sections.map((section) => (
            <Card padded key={section.heading}>
              <Text style={styles.heading} accessibilityRole="header">
                {section.heading}
              </Text>
              <Text style={styles.body}>
                {boldSegments(fillVars(section.body, vars)).map((part, i) => (
                  <Text key={i} style={part.bold ? styles.bold : undefined}>
                    {part.text}
                  </Text>
                ))}
              </Text>
            </Card>
          ))
        : null}
    </SettingsLayout>
  );
}

const styles = StyleSheet.create({
  heading: { ...text('subtitle'), fontFamily: 'Poppins_700Bold', color: colors.navy },
  body: { ...text('body'), color: colors.text, marginTop: spacing.xs },
  bold: { fontFamily: 'Poppins_700Bold', color: colors.navy },
});
