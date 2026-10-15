const ITERATIONS = 600_000;
const HASH_BYTES = 32;
const encoder = new TextEncoder();

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, material, HASH_BYTES * 8));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePassword(password, salt, ITERATIONS);
  return `pbkdf2-sha256$${ITERATIONS}$${encodeBase64Url(salt)}$${encodeBase64Url(hash)}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, iterationText, saltText, hashText] = encoded.split("$");
  const iterations = Number(iterationText);
  if (algorithm !== "pbkdf2-sha256" || !Number.isSafeInteger(iterations) || iterations < 100_000 || iterations > 1_000_000 || !saltText || !hashText) return false;
  try {
    const expected = decodeBase64Url(hashText);
    if (expected.length !== HASH_BYTES) return false;
    const actual = await derivePassword(password, decodeBase64Url(saltText), iterations);
    let difference = 0;
    for (let index = 0; index < expected.length; index += 1) difference |= (expected[index] ?? 0) ^ (actual[index] ?? 0);
    return difference === 0;
  } catch {
    return false;
  }
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createOpaqueToken(): string {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}
