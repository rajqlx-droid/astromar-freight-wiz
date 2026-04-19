/**
 * Length & weight unit selectors for freight calculators.
 * Internal storage stays in cm and kg; converters handle in/out.
 */
import { useEffect, useState, type ChangeEvent } from "react";

/* -------- Length -------- */
export type LengthUnit = "cm" | "mm" | "m" | "in" | "ft";

export const LENGTH_UNITS: { value: LengthUnit; label: string }[] = [
  { value: "cm", label: "cm" },
  { value: "mm", label: "mm" },
  { value: "m", label: "m" },
  { value: "in", label: "inch" },
  { value: "ft", label: "ft" },
];

export const TO_CM: Record<LengthUnit, number> = {
  cm: 1,
  mm: 0.1,
  m: 100,
  in: 2.54,
  ft: 30.48,
};

export const cmTo = (cm: number, unit: LengthUnit): number =>
  Number.isFinite(cm) ? cm / TO_CM[unit] : NaN;
export const toCm = (value: number, unit: LengthUnit): number =>
  Number.isFinite(value) ? value * TO_CM[unit] : NaN;

/* -------- Weight -------- */
export type WeightUnit = "kg" | "g" | "lb";

export const WEIGHT_UNITS: { value: WeightUnit; label: string }[] = [
  { value: "kg", label: "kg" },
  { value: "g", label: "g" },
  { value: "lb", label: "lb" },
];

export const TO_KG: Record<WeightUnit, number> = {
  kg: 1,
  g: 0.001,
  lb: 0.45359237,
};

export const kgTo = (kg: number, unit: WeightUnit): number =>
  Number.isFinite(kg) ? kg / TO_KG[unit] : NaN;
export const toKg = (value: number, unit: WeightUnit): number =>
  Number.isFinite(value) ? value * TO_KG[unit] : NaN;

/* -------- Persistent preferences (localStorage, SSR-safe) -------- */
const LEN_KEY = "astromar.freight.lenUnit";
const WT_KEY = "astromar.freight.wtUnit";

const isLenUnit = (v: unknown): v is LengthUnit =>
  typeof v === "string" && LENGTH_UNITS.some((u) => u.value === v);
const isWtUnit = (v: unknown): v is WeightUnit =>
  typeof v === "string" && WEIGHT_UNITS.some((u) => u.value === v);

/**
 * Returns [unit, setUnit]. Always seeds with the SSR default ("cm" / "kg") on
 * first render so server and client markup match, then hydrates the stored
 * preference inside useEffect to avoid hydration mismatches.
 */
export function usePersistentLengthUnit(): [LengthUnit, (u: LengthUnit) => void] {
  const [unit, setUnit] = useState<LengthUnit>("cm");
  useEffect(() => {
    try {
      const v = localStorage.getItem(LEN_KEY);
      if (isLenUnit(v)) setUnit(v);
    } catch {
      /* ignore */
    }
  }, []);
  const set = (u: LengthUnit) => {
    setUnit(u);
    try {
      localStorage.setItem(LEN_KEY, u);
    } catch {
      /* ignore */
    }
  };
  return [unit, set];
}

export function usePersistentWeightUnit(): [WeightUnit, (u: WeightUnit) => void] {
  const [unit, setUnit] = useState<WeightUnit>("kg");
  useEffect(() => {
    try {
      const v = localStorage.getItem(WT_KEY);
      if (isWtUnit(v)) setUnit(v);
    } catch {
      /* ignore */
    }
  }, []);
  const set = (u: WeightUnit) => {
    setUnit(u);
    try {
      localStorage.setItem(WT_KEY, u);
    } catch {
      /* ignore */
    }
  };
  return [unit, set];
}

/* -------- UI components -------- */
interface LenProps {
  value: LengthUnit;
  onChange: (u: LengthUnit) => void;
  id?: string;
  label?: string;
  /** Compact pill chip variant: 32px tall, inline label as prefix. */
  compact?: boolean;
}

export function UnitSelector({
  value,
  onChange,
  id,
  label = "Length unit",
  compact = false,
}: LenProps) {
  const handle = (e: ChangeEvent<HTMLSelectElement>) =>
    onChange(e.target.value as LengthUnit);

  if (compact) {
    return (
      <div className="inline-flex h-8 items-center overflow-hidden rounded-full border-2 border-brand-navy/30 bg-background transition-colors hover:border-brand-orange focus-within:border-brand-orange">
        <label
          htmlFor={id}
          className="px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
        >
          Len
        </label>
        <select
          id={id}
          value={value}
          onChange={handle}
          aria-label={label}
          className="h-full cursor-pointer appearance-none border-l border-brand-navy/20 bg-background pl-2 pr-6 text-xs font-semibold text-brand-navy focus:outline-none"
        >
          {LENGTH_UNITS.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-xs font-semibold text-brand-navy">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={handle}
        className="h-9 rounded-md border-2 border-brand-navy/30 bg-background px-2 text-sm font-semibold text-brand-navy transition-colors hover:border-brand-orange focus:border-brand-orange focus:outline-none"
      >
        {LENGTH_UNITS.map((u) => (
          <option key={u.value} value={u.value}>
            {u.label}
          </option>
        ))}
      </select>
    </div>
  );
}

interface WtProps {
  value: WeightUnit;
  onChange: (u: WeightUnit) => void;
  id?: string;
  label?: string;
  compact?: boolean;
}

export function WeightUnitSelector({
  value,
  onChange,
  id,
  label = "Weight unit",
  compact = false,
}: WtProps) {
  const handle = (e: ChangeEvent<HTMLSelectElement>) =>
    onChange(e.target.value as WeightUnit);

  if (compact) {
    return (
      <div className="inline-flex h-8 items-center overflow-hidden rounded-full border-2 border-brand-navy/30 bg-background transition-colors hover:border-brand-orange focus-within:border-brand-orange">
        <label
          htmlFor={id}
          className="px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
        >
          Wt
        </label>
        <select
          id={id}
          value={value}
          onChange={handle}
          aria-label={label}
          className="h-full cursor-pointer appearance-none border-l border-brand-navy/20 bg-background pl-2 pr-6 text-xs font-semibold text-brand-navy focus:outline-none"
        >
          {WEIGHT_UNITS.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-xs font-semibold text-brand-navy">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={handle}
        className="h-9 rounded-md border-2 border-brand-navy/30 bg-background px-2 text-sm font-semibold text-brand-navy transition-colors hover:border-brand-orange focus:border-brand-orange focus:outline-none"
      >
        {WEIGHT_UNITS.map((u) => (
          <option key={u.value} value={u.value}>
            {u.label}
          </option>
        ))}
      </select>
    </div>
  );
}
