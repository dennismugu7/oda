// Help and support (design 20b-help, decision #77): search the bundled guides, talk to us
// (email only for now; a "Chat on WhatsApp" button appears when the server is configured with a
// number), the guides, and Report a problem / Suggest an idea (the feedback screen).
import Feather from '@expo/vector-icons/Feather';
import { waLink } from '@oda/shared';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GUIDES } from '@/help/guides';
import { searchGuides } from '@/help/search';
import { FALLBACK_SUPPORT, supportCache } from '@/help/support';
import { growApi } from '@/insights/api';
import { goBack } from '@/settings/SettingsLayout';
import { useLoaded } from '@/settings/useLoaded';
import { Button } from '@/ui/auth';
import { Card, Row, rowStyles, Section } from '@/ui/rows';
import { ScreenHeader } from '@/ui/screenHeader';
import { colors, radii, spacing, text } from '@/theme';

export default function HelpScreen() {
  const insets = useSafeAreaInsets();
  const { data } = useLoaded(growApi.support, supportCache);
  const support = data ?? FALLBACK_SUPPORT;
  const [query, setQuery] = useState('');
  const guides = useMemo(() => searchGuides(GUIDES, query), [query]);
  const searching = query.trim().length > 0;

  const email = () =>
    Linking.openURL(`mailto:${support.email}?subject=${encodeURIComponent('oda help')}`).catch(
      () => {},
    );

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Help and support"
        subtitle="Guides, and a real person when you need one"
        onBack={() => goBack('/more')}
      >
        <View style={styles.search}>
          <Feather name="search" size={20} color={colors.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder='Search help, e.g. "refund"'
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Search help"
            returnKeyType="search"
            style={styles.searchInput}
          />
          {searching ? (
            <Feather
              name="x"
              size={20}
              color={colors.textSecondary}
              accessibilityLabel="Clear search"
              onPress={() => setQuery('')}
            />
          ) : null}
        </View>
      </ScreenHeader>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        {!searching ? (
          <Card padded>
            <Text style={rowStyles.overline}>TALK TO US</Text>
            <Text style={styles.talk}>
              Email the oda team at <Text style={styles.strong}>{support.email}</Text>. We read
              every message and reply as soon as we can.
            </Text>
            <Button title="Email oda support" onPress={email} />
            {support.whatsapp ? (
              <Button
                title="Chat with oda support"
                variant="secondary"
                onPress={() =>
                  Linking.openURL(waLink(support.whatsapp!, 'Hi oda team, ')).catch(() => {})
                }
              />
            ) : null}
          </Card>
        ) : null}

        <Section title={searching ? `RESULTS FOR "${query.trim().toUpperCase()}"` : 'GUIDES'}>
          {guides.length ? (
            <Card>
              {guides.map((g, i) => (
                <Row
                  key={g.id}
                  first={i === 0}
                  icon="file-text"
                  title={g.title}
                  line={searching ? g.summary : null}
                  onPress={() => router.push({ pathname: '/help/[id]', params: { id: g.id } })}
                />
              ))}
            </Card>
          ) : (
            <Card padded>
              <Text style={styles.empty}>
                No guide matches “{query.trim()}”. Try another word, or email us at {support.email}.
              </Text>
            </Card>
          )}
        </Section>

        <Card>
          <Row
            first
            icon="flag"
            title="Report a problem"
            onPress={() =>
              router.push({ pathname: '/settings/feedback', params: { kind: 'broken' } })
            }
          />
          <Row
            icon="message-square"
            title="Suggest an idea"
            onPress={() =>
              router.push({ pathname: '/settings/feedback', params: { kind: 'idea' } })
            }
          />
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.lg, gap: spacing.md },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    minHeight: 52,
  },
  searchInput: { ...text('body'), color: colors.text, flex: 1 },
  talk: { ...text('body'), color: colors.textSecondary },
  strong: { fontFamily: 'Poppins_700Bold', color: colors.navy },
  empty: { ...text('body'), color: colors.textSecondary },
});
