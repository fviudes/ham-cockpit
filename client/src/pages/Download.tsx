import { motion } from "framer-motion";
import { Download as DownloadIcon, HardDrive, Package } from "lucide-react";
import { useLocation } from "wouter";
import NavBar from "@/components/NavBar";
import { APP_LOGO_LG, APP_NAME } from "@shared/brand";
import { formatBytes } from "@shared/image-release";
import { compareVersion } from "@shared/version";
import { useLatestImage } from "@/lib/latest-image";
import { PRODUCT, Photo } from "./product-media";
import { useSiteLang, type Pair } from "./site-lang";

const COPY = {
  kicker: { pt: "DOWNLOAD", en: "DOWNLOAD" } satisfies Pair,
  title: { pt: "Imagem do Ham Cockpit para Raspberry Pi", en: "Ham Cockpit image for Raspberry Pi" } satisfies Pair,
  lead: {
    pt: "A imagem traz o sistema completo: Ubuntu Server 24.04, o console, o Wavelog, o ser2net e o Hamlib. Você grava no cartão, liga o Pi e opera pelo navegador.",
    en: "The image brings the complete system: Ubuntu Server 24.04, the console, Wavelog, ser2net and Hamlib. You write it to the card, power on the Pi and operate from the browser.",
  } satisfies Pair,
  latest: { pt: "Imagem mais recente", en: "Latest image" } satisfies Pair,
  loading: { pt: "Verificando a versão…", en: "Checking the version…" } satisfies Pair,
  unknown: { pt: "Versão indisponível no momento", en: "Version unavailable right now" } satisfies Pair,
  file: { pt: "Arquivo", en: "File" } satisfies Pair,
  size: { pt: "Tamanho", en: "Size" } satisfies Pair,
  date: { pt: "Publicada em", en: "Published on" } satisfies Pair,
  button: { pt: "Baixar a imagem", en: "Download the image" } satisfies Pair,
  soon: { pt: "Em desenvolvimento", en: "Under development" } satisfies Pair,
  soonNote: {
    pt: "O download da imagem ainda não está liberado. Esta página já mostra a versão mais recente e se atualiza sozinha quando uma nova imagem é compilada.",
    en: "The image download is not available yet. This page already shows the latest version and updates by itself whenever a new image is built.",
  } satisfies Pair,
  next: { pt: "Próxima imagem em desenvolvimento", en: "Next image in development" } satisfies Pair,
  stepsTitle: { pt: "Depois que o download for liberado", en: "Once the download is available" } satisfies Pair,
  reqTitle: { pt: "O que você precisa", en: "What you need" } satisfies Pair,
  manual: { pt: "Ler o manual do operador", en: "Read the operator manual" } satisfies Pair,
  docs: { pt: "Ver a documentação", en: "See the documentation" } satisfies Pair,
};

const STEPS: Pair[] = [
  {
    pt: "Grave o arquivo .img.xz no cartão microSD (ou SSD) com o Raspberry Pi Imager, na opção Use custom.",
    en: "Write the .img.xz file to the microSD card (or SSD) with Raspberry Pi Imager, using the Use custom option.",
  },
  {
    pt: "Coloque o cartão no Pi e ligue a fonte. Se puder, conecte o cabo de rede no primeiro boot: o Wavelog baixa as imagens Docker nesse momento.",
    en: "Put the card in the Pi and power it on. If you can, plug in the network cable on the first boot: Wavelog downloads its Docker images then.",
  },
  {
    pt: "No celular ou no notebook, entre no Wi‑Fi Ham-Cockpit-XXXX (senha hamcockpit).",
    en: "On your phone or laptop, join the Ham-Cockpit-XXXX Wi‑Fi (password hamcockpit).",
  },
  {
    pt: "Abra http://192.168.4.1/console no Chrome ou no Edge e entre com admin / 1234. Troque a senha depois, em Admin.",
    en: "Open http://192.168.4.1/console in Chrome or Edge and sign in with admin / 1234. Change the password later, under Admin.",
  },
];

const REQS: Pair[] = [
  { pt: "Raspberry Pi 3, 4 ou 5 (Pi 5: fonte oficial de 27 W)", en: "Raspberry Pi 3, 4 or 5 (Pi 5: official 27 W power supply)" },
  { pt: "Cartão microSD ou SSD", en: "microSD card or SSD" },
  { pt: "Chrome ou Edge no celular ou no notebook (o Firefox não tem Web Bluetooth)", en: "Chrome or Edge on your phone or laptop (Firefox has no Web Bluetooth)" },
  { pt: "Para o IC-705 e o Lextel: um adaptador Bluetooth (o do Pi serve)", en: "For the IC-705 and Lextel: a Bluetooth adapter (the Pi's own works)" },
];

export default function DownloadPage() {
  const [, navigate] = useLocation();
  const { t, lang } = useSiteLang();
  const { info, loading } = useLatestImage();

  const number = (s: string) => (lang === "en" ? s.replace(",", ".") : s);
  const size = info ? number(formatBytes(info.sizeBytes)) : "";
  const date = info?.publishedAt
    ? new Date(info.publishedAt).toLocaleDateString(lang === "en" ? "en-US" : "pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "";
  const next = info?.nextVersion && compareVersion(info.nextVersion, info.version) > 0 ? info.nextVersion : null;

  return (
    <div className="flex min-h-screen flex-col bg-[#0d1b2a]">
      <NavBar />
      <main className="flex-1 pt-16">
        <header className="border-b border-[rgba(79,195,247,0.1)]">
          <div className="container grid items-center gap-8 py-12 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <img src={APP_LOGO_LG} alt={APP_NAME} className="mb-5 h-[96px] w-[96px] object-contain" />
              <p className="mb-2 font-['IBM_Plex_Mono'] text-xs font-bold tracking-widest text-[#FFB300]">
                {t(COPY.kicker)}
              </p>
              <h1 className="font-['Space_Grotesk'] text-4xl font-bold text-white sm:text-5xl">{t(COPY.title)}</h1>
              <p className="mt-4 max-w-2xl text-lg leading-relaxed text-[#94a3b8]">{t(COPY.lead)}</p>
            </div>
            <Photo
              src={PRODUCT.hero}
              alt={t({
                pt: "Raspberry Pi Ham Cockpit com adaptador Bluetooth, USB-serial e cartão da imagem",
                en: "Ham Cockpit Raspberry Pi with a Bluetooth adapter, USB-serial adapters and the image card",
              })}
            />
          </div>
        </header>

        <div className="container grid gap-8 py-12 lg:grid-cols-[1.1fr_0.9fr]">
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-[rgba(79,195,247,0.2)] bg-[#0b1520] p-6"
            data-testid="download-card"
          >
            <p className="flex items-center gap-2 font-['IBM_Plex_Mono'] text-[11px] tracking-widest text-[#4fc3f7]/70 uppercase">
              <Package size={14} />
              {t(COPY.latest)}
            </p>
            <p className="mt-2 font-['Space_Grotesk'] text-5xl font-bold text-white" data-testid="image-version">
              {info ? info.version : loading ? "…" : "—"}
            </p>
            {!info ? (
              <p className="mt-2 text-sm text-[#8ea0b3]">{t(loading ? COPY.loading : COPY.unknown)}</p>
            ) : (
              <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                {info.fileName ? (
                  <>
                    <dt className="text-[#8ea0b3]">{t(COPY.file)}</dt>
                    <dd className="font-['IBM_Plex_Mono'] text-xs break-all text-[#c5d4e0]">{info.fileName}</dd>
                  </>
                ) : null}
                {size ? (
                  <>
                    <dt className="text-[#8ea0b3]">{t(COPY.size)}</dt>
                    <dd className="text-[#c5d4e0]">{size}</dd>
                  </>
                ) : null}
                {date ? (
                  <>
                    <dt className="text-[#8ea0b3]">{t(COPY.date)}</dt>
                    <dd className="text-[#c5d4e0]">{date}</dd>
                  </>
                ) : null}
              </dl>
            )}
            {next ? (
              <p className="mt-4 rounded-lg border border-[rgba(255,179,0,0.3)] bg-[rgba(255,179,0,0.07)] px-3 py-2 text-sm text-[#ffd27a]">
                {t(COPY.next)}: <strong>{next}</strong>
              </p>
            ) : null}

            <div className="mt-6">
              <button
                type="button"
                disabled
                aria-disabled="true"
                title={t(COPY.soon)}
                data-testid="download-button"
                className="inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-[rgba(142,160,179,0.3)] bg-[#142233] px-7 py-3.5 font-bold text-[#6b7f93] sm:w-auto"
              >
                <DownloadIcon size={18} />
                {t(COPY.button)}
              </button>
              <span
                className="mt-3 inline-block rounded-full border border-[rgba(255,179,0,0.45)] bg-[rgba(255,179,0,0.1)] px-3 py-1 font-['IBM_Plex_Mono'] text-xs font-bold tracking-wide text-[#FFB300] sm:mt-0 sm:ml-3"
                data-testid="download-soon"
              >
                {t(COPY.soon)}
              </span>
              <p className="mt-4 text-sm leading-relaxed text-[#8ea0b3]">{t(COPY.soonNote)}</p>
            </div>
          </motion.section>

          <section className="rounded-2xl border border-[rgba(79,195,247,0.16)] bg-[#0b1520] p-6">
            <h2 className="flex items-center gap-2 font-['Space_Grotesk'] text-xl font-semibold text-white">
              <HardDrive size={20} className="text-[#4fc3f7]" />
              {t(COPY.reqTitle)}
            </h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-[#c5d4e0]">
              {REQS.map((r) => (
                <li key={r.pt}>{t(r)}</li>
              ))}
            </ul>
          </section>
        </div>

        <section className="container pb-16">
          <h2 className="mb-4 font-['Space_Grotesk'] text-2xl font-bold text-white">{t(COPY.stepsTitle)}</h2>
          <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.pt} className="rounded-xl border border-[rgba(79,195,247,0.16)] bg-[#0b1520] p-5">
                <p className="font-['IBM_Plex_Mono'] text-xs text-[#FFB300]">{String(i + 1).padStart(2, "0")}</p>
                <p className="mt-2 text-sm leading-relaxed text-[#c5d4e0]">{t(s)}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigate("/manual")}
              className="rounded-lg bg-[#4fc3f7] px-6 py-3 font-semibold text-[#0d1b2a] hover:bg-[#80d8ff]"
            >
              {t(COPY.manual)}
            </button>
            <button
              type="button"
              onClick={() => navigate("/docs")}
              className="rounded-lg border border-[#4fc3f7] px-6 py-3 font-semibold text-[#4fc3f7] hover:bg-[rgba(79,195,247,0.1)]"
            >
              {t(COPY.docs)}
            </button>
          </div>
        </section>
      </main>
      <footer className="border-t border-[rgba(79,195,247,0.1)] py-6">
        <div className="container text-xs text-[#5d7184]">
          Ham Cockpit · Raspberry Pi 3 / 4 / 5 · Ubuntu Server 24.04 LTS
        </div>
      </footer>
    </div>
  );
}
