// Hermes ships toReversed and toSpliced but not Array.prototype.toSorted, which shared board code calls.
if (!("toSorted" in Array.prototype)) {
  // oxlint-disable-next-line no-extend-native -- this is the polyfill; only added when Hermes lacks it.
  Object.defineProperty(Array.prototype, "toSorted", {
    configurable: true,
    writable: true,
    value<T>(this: T[], compare?: (a: T, b: T) => number) {
      return Array.prototype.slice.call(this).sort(compare);
    },
  });
}
