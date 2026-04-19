import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const COMMON = ["USD", "EUR", "GBP", "AED", "CNY", "JPY", "SGD", "AUD", "INR", "HKD", "CAD", "CHF"] as const;

interface Props {
  value: string;
  onChange: (code: string) => void;
}

/**
 * Compact currency dropdown. Users can still type any currency in
 * the Currency Code field above; this offers fast switching to common ones.
 */
export function CurrencyQuickPick({ value, onChange }: Props) {
  const upper = value.toUpperCase();
  // Ensure the current value is present in the list so Select can display it.
  const options = COMMON.includes(upper as (typeof COMMON)[number])
    ? [...COMMON]
    : [upper, ...COMMON];

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Quick:
      </span>
      <Select value={upper} onValueChange={(v) => onChange(v)}>
        <SelectTrigger className="h-7 w-[110px] border-2 border-brand-navy/30 text-xs font-bold text-brand-navy">
          <SelectValue placeholder="Currency" />
        </SelectTrigger>
        <SelectContent>
          {options.map((code) => (
            <SelectItem key={code} value={code} className="text-xs font-semibold">
              {code}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
