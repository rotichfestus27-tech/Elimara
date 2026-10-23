export type TransactionTimeoutOptions = {
  maxWait?: number;
  timeout?: number;
};

export const DEFAULT_TRANSACTION_TIMEOUT_MS = 10_000;
export const DEFAULT_TRANSACTION_MAX_WAIT_MS = 5_000;
export const BATCH_TRANSACTION_TIMEOUT_MS = 15_000;

declare const process: { env?: Record<string, string | undefined> } | undefined;

export function resolveTransactionOptions(
  options?: TransactionTimeoutOptions,
  defaults: { maxWait: number; timeout: number } = {
    maxWait: DEFAULT_TRANSACTION_MAX_WAIT_MS,
    timeout: DEFAULT_TRANSACTION_TIMEOUT_MS,
  },
): { maxWait: number; timeout: number } {
  const env = process?.env ? process.env : {};
  // biome-ignore lint/complexity/useLiteralKeys: required by TypeScript noPropertyAccessFromIndexSignature
  const rawMaxWait = env["DATABASE_TRANSACTION_MAX_WAIT_MS"];
  // biome-ignore lint/complexity/useLiteralKeys: required by TypeScript noPropertyAccessFromIndexSignature
  const rawTimeout = env["DATABASE_TRANSACTION_TIMEOUT_MS"];
  const envMaxWait = rawMaxWait ? Number(rawMaxWait) : undefined;
  const envTimeout = rawTimeout ? Number(rawTimeout) : undefined;

  const maxWait =
    options?.maxWait ??
    (envMaxWait && Number.isFinite(envMaxWait) && envMaxWait > 0 ? envMaxWait : defaults.maxWait);
  const timeout =
    options?.timeout ??
    (envTimeout && Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : defaults.timeout);

  return { maxWait, timeout };
}
