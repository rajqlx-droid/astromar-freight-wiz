import { Button } from "@/components/ui/button";

const COMMON = ["USD", "EUR", "GBP", "AED", "CNY", "JPY", "SGD", "AUD"] as const;

interface Props {
  value: string;
  onChange: (code: string) => void;
}

/**
 * Compact row of one-click currency switches. Highlights the active code.
 * Users can still type any currency in the Currency Code field above.
 */
export function CurrencyQuickPick({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Quick:
      </span>
      {COMMON.map((code) => {
        const active = value.toUpperCase() === code;
        return (
          <Button
            key={code}
            type="button"
            size="sm"
            variant={active ? "default" : "outline"}
            onClick={() => onChange(code)}
            className={
              active
                ? "h-6 px-2 text-[10px] font-bold text-white"
                : "h-6 px-2 text-[10px] font-semibold text-brand-navy"
            }
            style={active ? { background: "var(--brand-orange)" } : undefined}
          >
            {code}
          </Button>
        );
      })}
    </div>
  );
}
