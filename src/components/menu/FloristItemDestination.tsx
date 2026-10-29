// Destino do item (presente / para mim → retirada / entrega) — SOMENTE perfil floricultura.
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { FLORIST_TIME_SLOTS, GIFT_CARD_MAX_CHARS } from "@/lib/floristGift";
import type { FloristDestination } from "@/lib/floristDestination";

interface Props {
  value: Partial<FloristDestination>;
  onChange: (v: Partial<FloristDestination>) => void;
  today: string;
  neighborhoods: { name: string; fee: number }[];
  pickupEnabled: boolean;
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

export function FloristItemDestination({ value, onChange, today, neighborhoods, pickupEnabled }: Props) {
  const set = (patch: Partial<FloristDestination>) => onChange({ ...value, ...patch });
  const isGift = value.forWhom === "gift";
  const msgLen = (value.cardMessage ?? "").length;

  return (
    <div className="space-y-4 rounded-xl border border-primary/40 p-4">
      <div>
        <Label className="font-bold">Esse produto é: *</Label>
        <div className="mt-2 flex gap-2">
          <Choice active={isGift} onClick={() => onChange({ forWhom: "gift" })}>🎁 Para presente</Choice>
          <Choice active={value.forWhom === "self"} onClick={() => onChange({ forWhom: "self" })}>🛍️ Para mim mesmo</Choice>
        </div>
      </div>

      {value.forWhom && (
        <div>
          <Label className="font-bold">Como vai receber? *</Label>
          <div className="mt-2 flex gap-2">
            {pickupEnabled && (
              <Choice active={value.mode === "pickup"} onClick={() => set({ mode: "pickup" })}>🏪 Retirada na loja</Choice>
            )}
            <Choice active={value.mode === "delivery"} onClick={() => set({ mode: "delivery" })}>🚚 Entrega</Choice>
          </div>
        </div>
      )}

      {value.mode === "delivery" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0">
              <Label className="font-bold">Data da entrega *</Label>
              <Input
                type="date"
                min={today}
                value={value.date ?? ""}
                onChange={(e) => set({ date: e.target.value })}
                className="block h-10 min-h-10 w-full min-w-0 max-w-full appearance-none px-2 py-0 text-left leading-10 text-base md:text-sm border-primary"
              />
            </div>
            <div className="min-w-0">
              <Label className="font-bold">Turno *</Label>
              <select
                value={value.slot ?? ""}
                onChange={(e) => set({ slot: e.target.value })}
                className="flex h-10 w-full min-w-0 rounded-md border border-primary bg-background px-2 text-base md:text-sm"
              >
                <option value="">Escolha o turno</option>
                {FLORIST_TIME_SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {isGift && (
            <>
              <div>
                <Label className="font-bold">Nome de quem recebe *</Label>
                <Input value={value.recipientName ?? ""} onChange={(e) => set({ recipientName: e.target.value })} placeholder="Ex.: Maria Souza" className="border-primary" />
              </div>
              <div>
                <Label className="font-bold">WhatsApp de quem recebe *</Label>
                <Input inputMode="tel" value={value.recipientPhone ?? ""} onChange={(e) => set({ recipientPhone: e.target.value })} placeholder="(51) 99999-9999" className="border-primary" />
              </div>
            </>
          )}

          <p className="text-sm font-bold">{isGift ? "Endereço de quem recebe" : "Endereço de entrega"}</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Label>Rua *</Label>
              <Input value={value.street ?? ""} onChange={(e) => set({ street: e.target.value })} className="border-primary" />
            </div>
            <div>
              <Label>Número *</Label>
              <Input value={value.number ?? ""} onChange={(e) => set({ number: e.target.value })} className="border-primary" />
            </div>
          </div>
          <div>
            <Label>Complemento</Label>
            <Input value={value.complement ?? ""} onChange={(e) => set({ complement: e.target.value })} placeholder="Apto, bloco... (opcional)" />
          </div>
          <div>
            <Label>Bairro *</Label>
            {neighborhoods.length > 0 ? (
              <select
                value={value.neighborhood ?? ""}
                onChange={(e) => set({ neighborhood: e.target.value })}
                className="flex h-10 w-full rounded-md border border-primary bg-background px-3 text-base md:text-sm"
              >
                <option value="">Escolha o bairro</option>
                {neighborhoods.map((n) => (
                  <option key={n.name} value={n.name}>
                    {n.name} {n.fee > 0 ? `- R$ ${n.fee.toFixed(2).replace(".", ",")}` : "- Grátis"}
                  </option>
                ))}
              </select>
            ) : (
              <Input value={value.neighborhood ?? ""} onChange={(e) => set({ neighborhood: e.target.value })} className="border-primary" />
            )}
          </div>
          <div>
            <Label>Ponto de referência *</Label>
            <Textarea value={value.reference ?? ""} onChange={(e) => set({ reference: e.target.value })} rows={2} className="min-h-[56px] resize-none break-words text-base md:text-sm border-primary" />
          </div>
        </>
      )}

      {isGift && value.mode && (
        <div>
          <Label className="font-bold">Mensagem do cartão (grátis) *</Label>
          <Textarea
            value={value.cardMessage ?? ""}
            maxLength={GIFT_CARD_MAX_CHARS}
            onChange={(e) => set({ cardMessage: e.target.value })}
            placeholder="Escreva a mensagem que será escrita à mão no cartão"
            rows={4}
            className="mt-2 text-base md:text-sm border-primary"
          />
          <p className="mt-1 text-right text-xs text-muted-foreground">{msgLen} / {GIFT_CARD_MAX_CHARS}</p>
        </div>
      )}
    </div>
  );
}
