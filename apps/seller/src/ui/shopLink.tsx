// The shop link on Home's header pill: the address in grey, the link name in bold, always on
// one line ending in "…" when it doesn't fit. Not `selectable`: on Android a selectable Text
// ignores numberOfLines, so a long link wrapped and the pill clipped the second line (stray
// marks under the address). Copy and Share cover copying.
import { Text, type StyleProp, type TextStyle } from 'react-native';

export function ShopLinkText({
  url,
  style,
  slugStyle,
}: {
  /** The shown link, e.g. "oda.mugu-labs.com/amani-styles". */
  url: string;
  style?: StyleProp<TextStyle>;
  slugStyle?: StyleProp<TextStyle>;
}) {
  const slash = url.lastIndexOf('/');
  return (
    <Text style={[{ flexShrink: 1, minWidth: 0 }, style]} numberOfLines={1} ellipsizeMode="tail">
      {url.slice(0, slash + 1)}
      <Text style={slugStyle}>{url.slice(slash + 1)}</Text>
    </Text>
  );
}
