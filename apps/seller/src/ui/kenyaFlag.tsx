// Kenya's flag before every +254 phone prefix (decision #109 b): flag-icons' "ke" (MIT), used
// unmodified (assets/flags/README.md). 20 × 15 (the file's 4:3) with rounded corners, so the
// whole flag shows and nothing is cut off (owner, decision #110 h). Decorative: the "+254" text
// next to it says the same.
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { KENYA_FLAG_SVG } from './flagSvgs';

export function KenyaFlag() {
  return (
    <View
      style={{ width: 20, height: 15, borderRadius: 3, overflow: 'hidden' }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="kenya-flag"
    >
      <SvgXml xml={KENYA_FLAG_SVG} width={20} height={15} preserveAspectRatio="xMidYMid meet" />
    </View>
  );
}
