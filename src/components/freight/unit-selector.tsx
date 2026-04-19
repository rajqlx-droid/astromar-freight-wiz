/**
 * Length unit selector for dimension inputs.
 * Internally we always store cm; this component converts on read & write.
 */
import type { ChangeEvent } from "react";

export type LengthUnit = "cm" | "mm" | "m" | "in" | "ft";

export const LENGTH_UNITS: { value: LengthUnit; label: string }[] = [
  { value: "cm", label: "cm" },
  { value: "mm", label: "mm" },
  { value: "m", label: "m" },
  { value: "in", label: "inch" },
  { value: "ft", label: "ft" },
];

/** Multiplier to convert FROM the given unit TO centimetres. */
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

interface Props {
  value: LengthUnit;
  onChange: (u: LengthUnit) => void;
  id?: string;
}

export function UnitSelector({ value, onChange, id }: Props) {
  const handle = (e: ChangeEvent<HTMLSelectElement>) =>
    onChange(e.target.value as LengthUnit);
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-xs font-semibold text-brand-navy">
        Unit
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
