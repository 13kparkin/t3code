import { Atom } from "effect/reactivity";
import * as SecureStore from "expo-secure-store";

// SecureStore keys allow only letters, digits, ".", "-" and "_".
const storeKey = (boardKey: string) =>
  `agentboard.canvas-flips.${boardKey.replace(/[^A-Za-z0-9._-]/g, "_")}`;

/** The canvas filter ids flipped from their default on one board, comma-joined, kept on this phone as the desktop keeps them. */
export const canvasFlipsAtom = Atom.family((boardKey: string) =>
  Atom.writable(
    () => {
      try {
        return SecureStore.getItem(storeKey(boardKey)) ?? "";
      } catch (error) {
        console.warn("Could not read the canvas filters.", error);
        return "";
      }
    },
    (context, flips: string) => {
      context.setSelf(flips);
      try {
        SecureStore.setItem(storeKey(boardKey), flips);
      } catch (error) {
        console.warn("Could not save the canvas filters.", error);
      }
    },
  ).pipe(Atom.keepAlive, Atom.withLabel(`phone-canvas-flips:${boardKey}`)),
);
