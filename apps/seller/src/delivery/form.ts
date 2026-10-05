// The area form's draft and checks (pure, unit-tested).
import type { DeliveryMethod } from '@oda/shared';
import type { AreaFields, DeliveryArea } from './api';

export interface AreaDraft {
  name: string;
  /** Digits as typed. */
  fee: string;
  method: DeliveryMethod;
  etaLabel: string;
  freeDeliveryEligible: boolean;
}

export function emptyArea(): AreaDraft {
  return { name: '', fee: '', method: 'rider', etaLabel: '', freeDeliveryEligible: false };
}

export function draftFromArea(a: DeliveryArea): AreaDraft {
  return {
    name: a.name,
    fee: String(a.fee),
    method: a.method,
    etaLabel: a.etaLabel ?? '',
    freeDeliveryEligible: a.freeDeliveryEligible,
  };
}

/** Whole shillings from what was typed ("1,200" → 1200), or null. */
export function parseShillings(raw: string): number | null {
  const digits = raw.replace(/[\s,]/g, '');
  if (!/^\d{1,7}$/.test(digits)) return null;
  return Number(digits);
}

/** The first problem to fix, or null. Fee 0 is allowed (free delivery to that area). */
export function areaProblem(d: AreaDraft): { field: 'name' | 'fee'; message: string } | null {
  if (!d.name.trim()) return { field: 'name', message: 'Enter the area name, e.g. Westlands.' };
  if (d.fee.trim() === '') return { field: 'fee', message: 'Enter the delivery fee (0 if free).' };
  if (parseShillings(d.fee) === null) return { field: 'fee', message: 'Enter whole shillings.' };
  return null;
}

export function fieldsFromDraft(d: AreaDraft): AreaFields {
  return {
    name: d.name.trim(),
    fee: parseShillings(d.fee) ?? 0,
    method: d.method,
    etaLabel: d.etaLabel.trim() || null,
    freeDeliveryEligible: d.freeDeliveryEligible,
  };
}
