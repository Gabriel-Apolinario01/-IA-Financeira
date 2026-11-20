import { randomUUID } from 'node:crypto';
import type { DocumentDraft } from './document-drafts';

type Offer = { owner: string; hash: string; page: number; expires: number };
const offers = new Map<string, Offer>();
const lifetime = 10 * 60_000;

// Ephemeral by design. A restart or a different worker requires another local reading.
// Keep only identifiers, never the image, transcript or financial fields.
export function offerSecondReadings(owner: string, hash: string, rows: DocumentDraft[]) {
  const now = Date.now();
  for (const [id, offer] of offers) if (offer.expires <= now) offers.delete(id);
  const pages = new Set(rows.filter(row => row.ambiguities.length).map(row => row.page));
  return Array.from(pages, page => {
    if (offers.size >= 1024) offers.delete(offers.keys().next().value!);
    const token = randomUUID();
    offers.set(token, { owner, hash, page, expires: now + lifetime });
    return { page, token };
  });
}

export function redeemSecondReading(token: string, owner: string, hash: string) {
  const offer = offers.get(token);
  if (!offer || offer.owner !== owner || offer.hash !== hash || offer.expires <= Date.now()) return null;
  offers.delete(token);
  return offer.page;
}
