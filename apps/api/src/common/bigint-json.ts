/**
 * JSON.stringify cannot serialise BigInt, and every monetary amount in this system
 * is a BigInt of minor units (kobo). Rather than teach every controller to convert,
 * we serialise BigInt as a decimal string once, here.
 *
 * Strings, not numbers: a kobo balance above 2^53 would silently lose precision in
 * JavaScript clients, and the frontend parses these with the same exact-arithmetic
 * helpers used on the server.
 */
export function installBigIntJson(): void {
  const bigIntWithToJson = BigInt.prototype as unknown as { toJSON?: () => string };
  if (!bigIntWithToJson.toJSON) {
    Object.defineProperty(BigInt.prototype, 'toJSON', {
      value: function toJSON(this: bigint): string {
        return this.toString();
      },
      writable: true,
      configurable: true,
    });
  }
}
