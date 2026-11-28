import { useWindowDimensions } from "react-native";

/** Material's medium window class starts at 600dp: an unfolded foldable, or a tablet. */
const WIDE_MIN_DP = 600;

export const useWide = () => useWindowDimensions().width >= WIDE_MIN_DP;
