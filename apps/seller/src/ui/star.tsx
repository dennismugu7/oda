import Svg, { Path } from 'react-native-svg';
import { colors } from '@/theme';

// A rating star, the same shape as on the web: the yellow fill (or the light track when it's
// not reached) with a thin dark outline, so its shape meets 3:1 on white (decision #89).
const STAR_PATH = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z';

export function Star({ filled, size }: { filled: boolean; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Path
        d={STAR_PATH}
        fill={filled ? colors.star : colors.track}
        stroke={colors.starOutline}
        // About 1 dp at small sizes, a little more on the big Rate sheet stars: always thin.
        strokeWidth={Math.max(1, 24 / size)}
        strokeLinejoin="round"
      />
    </Svg>
  );
}
