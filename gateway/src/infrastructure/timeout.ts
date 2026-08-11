import { GatewayError } from "../errors";

export async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const rejection = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new GatewayError("TIMEOUT", message, 504)), timeoutMs);
  });
  try {
    return await Promise.race([operation, rejection]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
