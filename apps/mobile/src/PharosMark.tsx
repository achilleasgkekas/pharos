import Svg, { Path, Circle } from 'react-native-svg';
import { C } from './theme';

/** Pharos brand mark — minimal lighthouse with a beacon. Ported from the web SVG
 *  (static, no SMIL pulse). Single colour; pass `color` to tint it. */
export function PharosMark({ size = 22, color = C.accent }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 7 L4.5 3.6" stroke={color} strokeWidth={1.5} strokeLinecap="round" opacity={0.5} />
      <Path d="M12 7 L19.5 3.6" stroke={color} strokeWidth={1.5} strokeLinecap="round" opacity={0.5} />
      <Path d="M9.4 20.5 L10.4 10.5 H13.6 L14.6 20.5 Z" stroke={color} strokeWidth={1.7} strokeLinejoin="round" />
      <Path d="M9.7 14.6 H14.3" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <Path d="M9.9 10.5 H14.1" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <Path d="M7.6 20.5 H16.4" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Circle cx={12} cy={7.4} r={3} fill={color} opacity={0.22} />
      <Circle cx={12} cy={7.4} r={1.9} fill={color} />
    </Svg>
  );
}
