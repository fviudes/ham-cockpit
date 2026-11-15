/** Dados públicos do Pix manual (portal / comprar). */

export const PIX_PAYEE_NAME = "Luiz Fernando Viudes Garcia (PR2PT)";
export const PIX_PHONE_DISPLAY = "11-98972-8000";
/** Chave telefone para copiar (somente dígitos com DDI). */
export const PIX_PHONE_KEY = "5511989728000";
export const PIX_WHATSAPP = PIX_PHONE_KEY;

export type PixCheckoutInfo = {
  amountCents: number;
  currency: "BRL";
  serialDisplay: string;
  callsign: string | null;
  payeeName: typeof PIX_PAYEE_NAME;
  phoneDisplay: typeof PIX_PHONE_DISPLAY;
  phoneKey: typeof PIX_PHONE_KEY;
  whatsapp: typeof PIX_WHATSAPP;
};

export function buildPixCheckoutInfo(args: {
  amountCents: number;
  serialDisplay: string;
  callsign: string | null;
}): PixCheckoutInfo {
  return {
    amountCents: args.amountCents,
    currency: "BRL",
    serialDisplay: args.serialDisplay,
    callsign: args.callsign,
    payeeName: PIX_PAYEE_NAME,
    phoneDisplay: PIX_PHONE_DISPLAY,
    phoneKey: PIX_PHONE_KEY,
    whatsapp: PIX_WHATSAPP,
  };
}