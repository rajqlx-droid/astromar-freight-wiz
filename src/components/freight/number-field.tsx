/**
 * Reusable labeled number input with tooltip helper text and error state.
 */
import type { ChangeEvent } from "react";
import { Info } from "lucide-react";
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

  return (
    <div className="space-y-1.5">
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
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        value={display}
        onChange={handle}
        placeholder={placeholder}
        aria-invalid={!!error}
        className={cn(
          "h-10 border-2 transition-shadow focus-visible:ring-2 focus-visible:ring-brand-orange/30",
          error
            ? "border-destructive focus-visible:border-destructive"
            : "border-brand-navy/30 focus-visible:border-brand-orange",
        )}
      />
      {error && <p className="text-[11px] font-medium text-destructive">{error}</p>}
    </div>
  );
}
