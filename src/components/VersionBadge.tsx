import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { VERSION, RELEASE_DATE, RELEASES, formatReleaseDate } from "@/version";

/**
 * Badge fixo no canto inferior direito mostrando a versão atual + data.
 * Ao clicar, abre popover com changelog resumido da versão.
 */
export function VersionBadge() {
  const [open, setOpen] = useState(false);
  const current = RELEASES.find((r) => r.version === VERSION) ?? RELEASES[0];

  return (
    <div className="fixed bottom-1 right-2 z-[60] pointer-events-auto print:hidden">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Versão ${VERSION} • ${formatReleaseDate(RELEASE_DATE)}`}
            className="text-[10px] leading-none font-mono text-muted-foreground/60 hover:text-muted-foreground transition-colors px-1.5 py-0.5 rounded bg-background/40 backdrop-blur-sm"
          >
            v{VERSION} · {formatReleaseDate(RELEASE_DATE)}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          side="top"
          className="w-72 text-xs"
        >
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold text-sm">v{current.version}</span>
              <span className="text-muted-foreground">
                {formatReleaseDate(current.date)}
              </span>
            </div>
            {current.codename && (
              <div className="text-muted-foreground italic">
                {current.codename}
              </div>
            )}
            <ul className="list-disc pl-4 space-y-1 text-foreground/80">
              {current.changes.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}