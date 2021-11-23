// @flow

import type { DiscreetMode } from './feature';

export { useDiscreetModeFeature, DiscreetModeFeatureProvider } from './context';
export {
  DiscreetValue,
  DiscreetTokenWalletAmount,
  DiscreetWalletAmount,
  DiscreetToggle,
  DiscreetToggleTopBar,
  withDiscreetMode,
} from './ui';

export type DiscreetModeFeature = DiscreetMode;
