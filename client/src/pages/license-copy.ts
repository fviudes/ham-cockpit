import type { Pair } from "./site-lang";

export const LIC_NAV = {
  license: { pt: "Licença", en: "License" } satisfies Pair,
  buy: { pt: "Comprar", en: "Buy" } satisfies Pair,
};

export const LIC = {
  kicker: { pt: "LICENÇA", en: "LICENSE" } satisfies Pair,
  title: { pt: "Licença do aparelho", en: "Device license" } satisfies Pair,
  lead: {
    pt: "Informe o serial do Raspberry Pi para gerar a chave de teste (30 dias) ou comprar a licença definitiva.",
    en: "Enter the Raspberry Pi serial to get a 30-day trial key or buy the perpetual license.",
  } satisfies Pair,
  serial: { pt: "Serial do aparelho", en: "Device serial" } satisfies Pair,
  serialPh: { pt: "1000-0000-A1B2-C3D4-7F", en: "1000-0000-A1B2-C3D4-7F" } satisfies Pair,
  activate: { pt: "Gerar chave de teste (30 dias)", en: "Get 30-day trial key" } satisfies Pair,
  buy: { pt: "Comprar licença definitiva", en: "Buy perpetual license" } satisfies Pair,
  token: { pt: "Chave HCL1", en: "HCL1 key" } satisfies Pair,
  copy: { pt: "Copiar chave", en: "Copy key" } satisfies Pair,
  download: { pt: "Baixar .lic", en: "Download .lic" } satisfies Pair,
  status: { pt: "Estado", en: "Status" } satisfies Pair,
  working: { pt: "Gerando…", en: "Generating…" } satisfies Pair,
  errSerial: { pt: "Serial inválido", en: "Invalid serial" } satisfies Pair,
  errPortal: { pt: "Não foi possível falar com o portal", en: "Could not reach the portal" } satisfies Pair,
  ok: { pt: "Chave gerada. Cole-a no console do aparelho (aba Licença).", en: "Key ready. Paste it in the device console (License tab)." } satisfies Pair,
  noRefund: {
    pt: "Não há reembolso: o trial de 30 dias já cobre a avaliação.",
    en: "No refunds: the 30-day trial already covers evaluation.",
  } satisfies Pair,
};

export const BUY = {
  kicker: { pt: "COMPRAR", en: "BUY" } satisfies Pair,
  title: { pt: "Licença definitiva", en: "Perpetual license" } satisfies Pair,
  lead: {
    pt: "Pagamento único para o serial informado. Sem renovação anual. Sem reembolso (já houve trial de 30 dias).",
    en: "One-time payment for the given serial. No yearly renewal. No refunds (the 30-day trial already applied).",
  } satisfies Pair,
  priceUsd: { pt: "Preço (USD)", en: "Price (USD)" } satisfies Pair,
  priceBrl: { pt: "≈ em reais", en: "≈ in BRL" } satisfies Pair,
  quoteUntil: { pt: "Cotação garantida até", en: "Quote valid until" } satisfies Pair,
  provider: { pt: "Pagar com", en: "Pay with" } satisfies Pair,
  email: { pt: "E-mail do recibo (opcional)", en: "Receipt email (optional)" } satisfies Pair,
  acceptNoRefund: {
    pt: "Li e aceito: não há reembolso após a compra.",
    en: "I understand: there is no refund after purchase.",
  } satisfies Pair,
  pay: { pt: "Pagar", en: "Pay" } satisfies Pair,
  quoting: { pt: "Calculando preço…", en: "Getting price…" } satisfies Pair,
  noPrice: {
    pt: "Preço ainda não configurado. Volte em breve ou peça ao administrador.",
    en: "Price is not configured yet. Check back later or ask the administrator.",
  } satisfies Pair,
  noProviders: {
    pt: "Nenhuma forma de pagamento disponível no momento.",
    en: "No payment methods available right now.",
  } satisfies Pair,
  already: { pt: "Este serial já tem licença definitiva.", en: "This serial already has a perpetual license." } satisfies Pair,
  needSerial: { pt: "Informe o serial do aparelho (ou abra o link a partir do console).", en: "Enter the device serial (or open the link from the console)." } satisfies Pair,
};

export const BUY_RET = {
  kicker: { pt: "PAGAMENTO", en: "PAYMENT" } satisfies Pair,
  waiting: { pt: "Aguardando confirmação do pagamento…", en: "Waiting for payment confirmation…" } satisfies Pair,
  paid: { pt: "Pagamento confirmado", en: "Payment confirmed" } satisfies Pair,
  failed: { pt: "Pagamento não concluído", en: "Payment not completed" } satisfies Pair,
  backConsole: {
    pt: "Volte ao console do aparelho e toque em Licenciar, ou importe a chave abaixo.",
    en: "Return to the device console and tap Activate, or import the key below.",
  } satisfies Pair,
};

export const ADM = {
  kicker: { pt: "ADMIN", en: "ADMIN" } satisfies Pair,
  title: { pt: "Painel de licenças", en: "License admin" } satisfies Pair,
  login: { pt: "Entrar", en: "Sign in" } satisfies Pair,
  logout: { pt: "Sair", en: "Sign out" } satisfies Pair,
  username: { pt: "Usuário", en: "Username" } satisfies Pair,
  password: { pt: "Senha", en: "Password" } satisfies Pair,
  passwordConfirm: { pt: "Confirmar senha", en: "Confirm password" } satisfies Pair,
  passwordMismatch: { pt: "As senhas não coincidem.", en: "Passwords do not match." } satisfies Pair,
  passwordRequired: { pt: "Informe uma senha.", en: "Enter a password." } satisfies Pair,
  totp: { pt: "Código TOTP (6 dígitos, se habilitado)", en: "TOTP code (6 digits, if enabled)" } satisfies Pair,
  tabLic: { pt: "Licenças", en: "Licenses" } satisfies Pair,
  tabPrice: { pt: "Preço", en: "Pricing" } satisfies Pair,
  tabProv: { pt: "Provedores", en: "Providers" } satisfies Pair,
  tabPay: { pt: "Pagamentos", en: "Payments" } satisfies Pair,
  tabUsers: { pt: "Usuários", en: "Users" } satisfies Pair,
  save: { pt: "Salvar", en: "Save" } satisfies Pair,
  refresh: { pt: "Atualizar", en: "Refresh" } satisfies Pair,
  usd: { pt: "Preço em USD", en: "USD price" } satisfies Pair,
  spread: { pt: "Spread (%)", en: "Spread (%)" } satisfies Pair,
  grant: { pt: "Conceder definitiva", en: "Grant perpetual" } satisfies Pair,
  extend: { pt: "Estender trial (dias)", en: "Extend trial (days)" } satisfies Pair,
  revoke: { pt: "Revogar", en: "Revoke" } satisfies Pair,
  enable: { pt: "Habilitado", en: "Enabled" } satisfies Pair,
  mode: { pt: "Modo", en: "Mode" } satisfies Pair,
  secrets: { pt: "Credenciais (gravação)", en: "Credentials (write-only)" } satisfies Pair,
  test: { pt: "Testar conexão", en: "Test connection" } satisfies Pair,
  webhook: { pt: "URL do webhook", en: "Webhook URL" } satisfies Pair,
  addUser: { pt: "+ usuário", en: "+ user" } satisfies Pair,
  editUser: { pt: "Alterar", en: "Edit" } satisfies Pair,
  changePassword: { pt: "Alterar senha", en: "Change password" } satisfies Pair,
  deleteUser: { pt: "Excluir", en: "Delete" } satisfies Pair,
  role: { pt: "Papel", en: "Role" } satisfies Pair,
  status: { pt: "Estado", en: "Status" } satisfies Pair,
  name: { pt: "Nome", en: "Name" } satisfies Pair,
  active: { pt: "Ativo", en: "Active" } satisfies Pair,
  disabled: { pt: "Desativado", en: "Disabled" } satisfies Pair,
  email: { pt: "E-mail", en: "Email" } satisfies Pair,
  licenseKey: { pt: "Chave", en: "Key" } satisfies Pair,
  copy: { pt: "Copiar", en: "Copy" } satisfies Pair,
  showFull: { pt: "Ver completa", en: "Show full" } satisfies Pair,
  hideFull: { pt: "Ocultar", en: "Hide" } satisfies Pair,
  cancel: { pt: "Cancelar", en: "Cancel" } satisfies Pair,
  confirmDelete: { pt: "Excluir este usuário?", en: "Delete this user?" } satisfies Pair,
  notConfigured: {
    pt: "Admin ainda não configurado neste ambiente (nenhum usuário no banco).",
    en: "Admin is not configured in this environment (no users in the database).",
  } satisfies Pair,
};
