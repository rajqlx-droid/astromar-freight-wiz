/**
 * Reusable labeled number input with tooltip helper text and error state.
 * Mobile-friendly: 44px tall touch targets and optional ± steppers.
 * `compact` mode hides steppers on narrow layouts and tightens spacing.
 */
import type { ChangeEvent } from "react";
import { Info, Minus, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface Props {
  id: string;
  label: string;
  value: number | "";
  onChange: (n: number) => void;
  required?: boolean;
  step?: number;
  min?: number;
  hint?: string;
  placeholder?: string;
  error?: string;
  suffix?: string;
  /** Show ±steppers for thumb-friendly editing on mobile. Defaults to true. */
  steppers?: boolean;
  /** Tighter layout: hides steppers on narrow viewports, removes gap. */
  compact?: boolean;
}

export function NumberField({
  id,
  label,
  value,
  onChange,
  required,
  step = 0.01,
  min = 0,
  hint,
  placeholder,
  error,
  suffix,
  steppers = true,
  compact = false,
}: Props) {
  const handle = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === "") {
      onChange(NaN);
      return;
    }
    const n = parseFloat(raw);
    onChange(Number.isFinite(n) ? n : NaN);
  };

  const display = Number.isFinite(value) ? String(value) : "";
  const stepSize = step >= 1 ? step : 1;
  const bump = (dir: 1 | -1) => {
    const current = Number.isFinite(value) ? (value as number) : 0;
    const next = current + dir * stepSize;
    onChange(Math.max(min, next));
  };

  // In compact mode, steppers hide on small screens (segmented look on md+)
  const stepperVisibility = compact ? "hidden md:flex" : "flex";
  const gapClass = compact ? "gap-0" : "gap-1";
  const stepperRadiusLeft = compact
    ? "rounded-r-none border-r-0"
    : "";
  const stepperRadiusRight = compact
    ? "rounded-l-none border-l-0"
    : "";
  const inputRadius = compact && steppers
    ? "rounded-none border-x-0 md:border-x-2 md:rounded-md"
    : "";

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Label htmlFor={id} className="text-xs font-semibold text-brand-navy">
          {label}
          {required && <span className="ml-0.5 text-brand-orange">*</span>}
          {suffix && <span className="ml-1 text-muted-foreground">({suffix})</span>}
        </Label>
        {hint && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`Help: ${label}`}
                className="text-muted-foreground transition-colors hover:text-brand-orange"
              >
                <Info className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">{hint}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className={cn("flex items-stretch", gapClass)}>
        {steppers && (
          <button
            type="button"
            aria-label={`Decrease ${label}`}
            onClick={() => bump(-1)}
            className={cn(
              stepperVisibility,
              "h-11 w-9 shrink-0 items-center justify-center rounded-md border-2 transition-colors md:h-10 md:w-8",
              "border-brand-navy/30 text-brand-navy hover:border-brand-orange hover:text-brand-orange active:scale-95",
              stepperRadiusLeft,
            )}
          >
            <Minus className="size-3.5" />
          </button>
        )}
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          value={display}
          onChange={handle}
          onFocus={(e) => e.target.select()}
          placeholder={placeholder}
          aria-invalid={!!error}
          className={cn(
            "h-11 min-w-0 flex-1 border-2 transition-shadow focus-visible:ring-2 focus-visible:ring-brand-orange/30 md:h-10",
            error
              ? "border-destructive focus-visible:border-destructive"
              : "border-brand-navy/30 focus-visible:border-brand-orange",
            inputRadius,
          )}
        />
        {steppers && (
          <button
            type="button"
            aria-label={`Increase ${label}`}
            onClick={() => bump(1)}
            className={cn(
              stepperVisibility,
              "h-11 w-9 shrink-0 items-center justify-center rounded-md border-2 transition-colors md:h-10 md:w-8",
              "border-brand-navy/30 text-brand-navy hover:border-brand-orange hover:text-brand-orange active:scale-95",
              stepperRadiusRight,
            )}
          >
            <Plus className="size-3.5" />
          </button>
        )}
      </div>
      {error && <p className="text-[11px] font-medium text-destructive">{error}</p>}
    </div>
  );
}
