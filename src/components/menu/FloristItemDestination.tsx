// Destino do item (presente / para mim → retirada / entrega) — SOMENTE perfil floricultura.
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { FLORIST_TIME_SLOTS, GIFT_CARD_MAX_CHARS } from "@/lib/floristGift";
import type { FloristDestination } from "@/lib/floristDestination";
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCustomerAddresses, type CustomerAddress } from '@/hooks/useCustomerAddresses';
import { customerPhoneKey, validCustomerPhone, parseCustomerAddress } from '@/lib/customerAddress';
import { CustomerAddressPicker } from './CustomerAddressPicker';
import { AddressCepInput } from './AddressCepInput';
import { AddressLabelInput } from './AddressLabelInput';
import { AddressNeighborhoodInput } from './AddressNeighborhoodInput';
import { Button } from '@/components/ui/button';

interface Props {
  companyId: string | null;
  buyerPhone?: string;
  value: Partial<FloristDestination>;
  onChange: (v: Partial<FloristDestination>) => void;
  today: string;
  neighborhoods: { name: string; fee: number }[];
  neighborhoodNames?: string[];
  pickupEnabled: boolean;
  /** Turnos disponíveis para a data escolhida (padrão: grade fixa de 2h). */
  slots?: string[];
  /** true quando a loja cadastrou turnos próprios — dia sem turno bloqueia a entrega. */
  customShifts?: boolean;
}

const Choice = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <Button variant="outline"
    type="button"
    onClick={onClick}
    className={cn(
      "flex-1 rounded-lg p-3 text-sm font-medium transition-colors",
      active ? "bg-primary/15 border-2 border-primary" : "bg-background border border-border",
    )}
  >
    {children}
  </Button>
);

export function FloristItemDestination({ value, onChange, today, neighborhoods, neighborhoodNames, pickupEnabled, slots, customShifts, companyId, buyerPhone }: Props) {
  const names = neighborhoodNames ?? neighborhoods.map(n => n.name);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [newAddress, setNewAddress] = useState(false);
  const currentValue = useRef(value);
  currentValue.current = value;
  const generation = useRef(0);
  const lookupPhone = customerPhoneKey(value.forWhom === 'gift' ? value.recipientPhone ?? '' : buyerPhone ?? '');
  const identity = `${companyId}:${value.forWhom}:${lookupPhone}`;
  const activeIdentity = useRef(identity);
  activeIdentity.current = identity;
  const addressBook = useCustomerAddresses(customerId, companyId);
  const addressFields = { street: '', number: '', complement: '', neighborhood: '', reference: '', city: '', state: '', addressLabel: '', savedAddressId: undefined };
  const applyAddress = (a: CustomerAddress) => {
    setNewAddress(false);
    onChange({ ...currentValue.current, street: a.address ?? '', number: a.number ?? '', complement: a.complement ?? '', neighborhood: a.neighborhood ?? '', reference: a.reference ?? '', city: a.city ?? '', state: a.state ?? '', addressLabel: a.label ?? '', savedAddressId: a.id });
  };
  useEffect(() => {
    setCustomerId(null);
    setNewAddress(false);
    const version = ++generation.current;
    if (!companyId || !validCustomerPhone(lookupPhone) || value.mode !== 'delivery') return;
    const timer = setTimeout(async () => {
      const { data, error } = await supabase.functions.invoke('public-customer', { body: { action: 'lookup', company_id: companyId, phone: lookupPhone } });
      if (error || version !== generation.current || identity !== activeIdentity.current) return;
      const customer = data?.customer;
      if (!customer) return;
      setCustomerId(customer.id);
      const parsed = parseCustomerAddress(customer.address);
      onChange({ ...currentValue.current, ...(value.forWhom === 'gift' ? { recipientName: customer.name ?? '' } : {}), street: parsed.address ?? '', number: parsed.number ?? '', complement: parsed.complement ?? '', neighborhood: parsed.neighborhood ?? '', reference: parsed.reference ?? '', city: customer.city ?? '', state: customer.state ?? '' });
    }, 500);
    return () => { clearTimeout(timer); generation.current++; };
  }, [identity, value.mode]);
  useEffect(() => {
    if (newAddress || value.savedAddressId || !addressBook.addresses.length) return;
    applyAddress(addressBook.addresses.find(a => a.is_default) ?? addressBook.addresses[0]);
  }, [addressBook.addresses, value.savedAddressId, newAddress]);
  const set = (patch: Partial<FloristDestination>) => onChange({ ...value, ...patch });
  const isGift = value.forWhom === "gift";
  const msgLen = (value.cardMessage ?? "").length;
  const availableSlots = slots ?? [...FLORIST_TIME_SLOTS];
  const dayWithoutShifts = !!customShifts && !!value.date && availableSlots.length === 0;

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
                disabled={dayWithoutShifts}
                className="flex h-10 w-full min-w-0 rounded-md border border-primary bg-background px-2 text-base md:text-sm disabled:opacity-50"
              >
                <option value="">Escolha o turno</option>
                {availableSlots.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          {dayWithoutShifts && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-sm font-medium text-destructive">
              Não fazemos entregas neste dia da semana. Escolha outra data.
            </p>
          )}

          {isGift && (
            <>
              <div>
                <Label className="font-bold">Nome de quem recebe *</Label>
                <Input value={value.recipientName ?? ""} onChange={(e) => set({ recipientName: e.target.value })} placeholder="Ex.: Maria Souza" className="border-primary" />
              </div>
              <div>
                <Label className="font-bold">WhatsApp de quem recebe *</Label>
                <Input aria-label="WhatsApp de quem recebe" inputMode="tel" value={value.recipientPhone ?? ""} onChange={(e) => {
                  const phone = e.target.value;
                  if (customerPhoneKey(phone) !== customerPhoneKey(value.recipientPhone ?? '')) {
                    generation.current++; setCustomerId(null); setNewAddress(false);
                    set({ ...addressFields, recipientName: '', recipientPhone: phone });
                  } else set({ recipientPhone: phone });
                }} placeholder="(51) 99999-9999" className="border-primary" />
              </div>
            </>
          )}

          <p className="text-sm font-bold">{isGift ? "Endereço de quem recebe" : "Endereço de entrega"}</p>
          <CustomerAddressPicker key={identity} addresses={addressBook.addresses} selectedId={value.savedAddressId ?? null} onSelect={applyAddress}
            onNew={() => { setNewAddress(true); set(addressFields); }}
            onDelete={async id => { await addressBook.remove(id); if (value.savedAddressId === id) { setNewAddress(true); set(addressFields); } }}
            onSetDefault={addressBook.setDefault} onUpdate={addressBook.update} neighborhoodNames={names} />
          <AddressCepInput key={`${identity}:${value.savedAddressId}:${newAddress}`} neighborhoodNames={names} onFound={a => onChange({ ...currentValue.current, ...(a.address ? { street: a.address } : {}), neighborhood: a.neighborhood })} />
          <AddressLabelInput value={value.addressLabel ?? ''} onChange={addressLabel => set({ addressLabel })} />
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
            <AddressNeighborhoodInput names={names} value={value.neighborhood ?? ''} onChange={neighborhood => set({ neighborhood })} className="border-primary" />
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
