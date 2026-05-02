import { z } from 'zod';

const coerceBoolean = (v: unknown): unknown => {
  if (typeof v === 'string') {
    const s = v.toLowerCase().trim();
    if (s === 'true' || s === '1') return true;
    if (s === 'false' || s === '0') return false;
  }
  return v;
};

export const zBool = () => z.preprocess(coerceBoolean, z.boolean());
