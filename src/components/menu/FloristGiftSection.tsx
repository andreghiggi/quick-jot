// Seção de presente/agendamento — exibida SOMENTE no perfil floricultura.
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { FLORIST_TIME_SLOTS, GIFT_CARD_MAX_CHARS, GiftInput } from "@/lib/floristGift";

interface Props {
  value: GiftInput & { allowNotify?: boolean };
  onChange: (v: GiftInput & { allowNotify?: boolean }) => void;
  today: string;
  invalid?: boolean;
}

const Choice = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "flex-1 rounded-lg p-3 text-sm font-medium transition-colors",
      active ? "bg-primary/15 border-2 border-primary" : "bg-background border border-border",
    )}
  >
    {children}
  </button>
);

export function FloristGiftSection({ value, onChange, today, invalid }: Props) {
  const set = (patch: Partial<Props["value"]>) => onChange({ ...value, ...patch });
  const msgLen = (value.cardMessage ?? "").length;

  return (
    <div className={cn("space-y-4 rounded-xl border p-4", invalid ? "border-destructive" : "border-primary/40")}>
      <div>
        <Label className="font-bold">É um presente? *</Label>
        <div className="mt-2 flex gap-2">
          <Choice active={value.isGift} onClick={() => set({ isGift: true, cardIncluded: true })}>🎁 Sim, é presente</Choice>
          <Choice active={!value.isGift} onClick={() => set({ isGift: false })}>🛍️ Não, é para mim</Choice>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label className="font-bold">Data *</Label>
          <Input type="date" min={today} value={value.scheduledDate ?? ""} onChange={(e) => set({ scheduledDate: e.target.value })} className="border-primary" />
        </div>
        <div>
          <Label className="font-bold">Turno *</Label>
          <select
            value={value.scheduledSlot ?? ""}
            onChange={(e) => set({ scheduledSlot: e.target.value })}
            className="flex h-10 w-full rounded-md border border-primary bg-background px-3 text-sm"
          >
            <option value="">Escolha o turno</option>
            {FLORIST_TIME_SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {value.isGift && (
        <>
          <div>
            <Label className="font-bold">Nome de quem vai receber *</Label>
            <Input value={value.recipientName ?? ""} onChange={(e) => set({ recipientName: e.target.value })} placeholder="Ex.: Maria Souza" className="border-primary" />
          </div>
          <div>
            <Label className="font-bold">WhatsApp de quem vai receber *</Label>
            <Input inputMode="tel" value={value.recipientPhone ?? ""} onChange={(e) => set({ recipientPhone: e.target.value })} placeholder="(51) 99999-9999" className="border-primary" />
          </div>
          <div>
            <Label className="font-bold">Podemos avisar o destinatário antes da entrega?</Label>
            <div className="mt-2 flex gap-2">
              <Choice active={!!value.allowNotify} onClick={() => set({ allowNotify: true })}>Sim, pode avisar</Choice>
              <Choice active={!value.allowNotify} onClick={() => set({ allowNotify: false })}>Não, é surpresa</Choice>
            </div>
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={!!value.cardIncluded} onChange={(e) => set({ cardIncluded: e.target.checked })} />
              Incluir cartão com mensagem (grátis)
            </label>
            {value.cardIncluded && (
              <div className="mt-2">
                <Textarea
                  value={value.cardMessage ?? ""}
                  maxLength={GIFT_CARD_MAX_CHARS}
                  onChange={(e) => set({ cardMessage: e.target.value })}
                  placeholder="Escreva aqui a mensagem que será escrita à mão no cartão"
                  rows={4}
                  className="border-primary"
                />
                <p className="mt-1 text-right text-xs text-muted-foreground">{msgLen} / {GIFT_CARD_MAX_CHARS}</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
