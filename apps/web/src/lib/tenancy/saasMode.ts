// Compatibility shim while callers migrate to the self-hosted-only API.
// Legacy environment files must never reactivate the retired hosted product.
export function saasMode(): boolean {
  return false;
}
