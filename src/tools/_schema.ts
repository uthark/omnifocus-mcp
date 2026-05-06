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

const coerceNullableInt = (v: unknown): unknown => {
  if (v === null || v === 'null' || v === '') return null;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : v;
  }
  return v;
};

export const zNullableInt = () =>
  z.preprocess(coerceNullableInt, z.union([z.number().int().nonnegative(), z.null()]));
