function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  if (v && typeof v === 'object' && v.constructor === Object) {
    return Object.keys(v).length === 0;
  }
  return false;
}

function prune(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(prune);
  if (value && typeof value === 'object' && value.constructor === Object) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const pruned = prune(v);
      if (!isEmpty(pruned)) out[k] = pruned;
    }
    return out;
  }
  return value;
}

export function compactJson(data: unknown): string {
  return JSON.stringify(prune(data));
}
