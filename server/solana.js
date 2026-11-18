// Solana helpers: base58, wallet signature checks, token balances and supply.
import { createPublicKey, verify } from 'node:crypto';

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function b58decode(s) {
  if (typeof s !== 'string' || !s || s.length > 64) return null;
  let n = 0n;
  for (const c of s) {
    const i = B58.indexOf(c);
    if (i < 0) return null;
    n = n * 58n + BigInt(i);
  }
  const bytes = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 255n));
    n >>= 8n;
  }
  for (const c of s) {
    if (c !== '1') break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

export function isAddress(s) {
  const b = b58decode(s);
  return !!b && b.length === 32;
}

/** Ed25519 check of a wallet's signMessage result. */
export function verifySignature(address, message, signature) {
  try {
    const pub = b58decode(address);
    if (!pub || pub.length !== 32 || signature.length !== 64) return false;
    const der = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(pub)]);
    const key = createPublicKey({ key: der, format: 'der', type: 'spki' });
    return verify(null, Buffer.from(message, 'utf8'), key, Buffer.from(signature));
  } catch {
    return false;
  }
}

async function rpc(env, method, params) {
  const url = env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || 'rpc error');
  return j.result;
}

/** How many tokens of `mint` the wallet holds (UI units). */
export async function tokenBalance(env, owner, mint) {
  if (!mint) return 0;
  const res = await rpc(env, 'getTokenAccountsByOwner', [owner, { mint }, { encoding: 'jsonParsed' }]);
  return (res?.value || []).reduce((sum, a) => sum + (Number(a.account?.data?.parsed?.info?.tokenAmount?.uiAmount) || 0), 0);
}

export async function tokenSupply(env, mint) {
  const res = await rpc(env, 'getTokenSupply', [mint]);
  return Number(res?.value?.uiAmount) || 0;
}
