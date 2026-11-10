import { motion } from "framer-motion";
import {
  Antenna,
  Bluetooth,
  BookMarked,
  Cable,
  Download,
  Gauge,
  Radio,
  Shield,
  TowerControl,
  Waves,
  Wifi,
  Workflow,
} from "lucide-react";
import { useLocation } from "wouter";
import NavBar from "@/components/NavBar";
import { APP_VERSION } from "@shared/brand";
import {
  FigAcomCable,
  FigBoot,
  FigDualBt,
  FigIc705,
  FigMmdvm,
  FigSer2net,
  FigStation,
  FigWavelog,
} from "@/console/manual-diagrams";
import { PRODUCT, Photo } from "./product-media";
import { useSiteLang } from "./site-lang";
import {
  HOME,
  HOME_DEVICES,
  HOME_FEATURES,
  HOME_FLOW,
  HOME_LAYERS,
  HOME_PORTS,
  HOME_RECIPES,
} from "./site-copy";

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
};

const stagger = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.08 } },
};

const FEATURE_ICONS = [Antenna, Bluetooth, Waves, Cable, BookMarked, TowerControl, Gauge, Wifi, Workflow, Shield];

export default function Home() {
  const [, navigate] = useLocation();
  const { t } = useSiteLang();

  return (
    <div className="flex min-h-screen flex-col bg-[#0d1b2a]">
      <NavBar />

      <section className="relative overflow-hidden border-b border-[rgba(79,195,247,0.1)] pt-14">
        <img src={PRODUCT.hero} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0d1b2a] via-[#0d1b2a]/92 to-[#0d1b2a]/55" />
        <div className="container relative grid items-center gap-10 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
          <motion.div initial="hidden" animate="visible" variants={fadeUp}>
            <p className="mb-3 font-['IBM_Plex_Mono'] text-xs font-bold tracking-widest text-[#FFB300]">
              {t(HOME.kicker)} · v{APP_VERSION} · UBUNTU 24.04 ARM64
            </p>
            <h1 className="mb-5 font-['Space_Grotesk'] text-4xl leading-tight font-bold text-white sm:text-5xl lg:text-6xl">
              {t(HOME.h1a)}
              <span className="text-[#4fc3f7]">{t(HOME.h1b)}</span>
            </h1>
            <p className="mb-8 max-w-xl text-lg leading-relaxed text-[#c5d4e0]">{t(HOME.lead)}</p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => navigate("/console")}
                className="inline-flex items-center gap-2 rounded-lg bg-[#4fc3f7] px-7 py-3.5 font-bold text-[#0d1b2a] hover:bg-[#80d8ff]"
              >
                <Radio size={18} />
                {t(HOME.openConsole)}
              </button>
              <button
                type="button"
                onClick={() => navigate("/docs")}
                className="inline-flex items-center gap-2 rounded-lg border border-[#4fc3f7] px-7 py-3.5 font-bold text-[#4fc3f7] hover:bg-[rgba(79,195,247,0.1)]"
              >
                {t(HOME.fullDocs)}
              </button>
              <a
                href={`https://github.com/fviudes/ham-cockpit/releases/tag/v${APP_VERSION}`}
                className="inline-flex items-center gap-2 rounded-lg border border-[rgba(255,179,0,0.45)] px-7 py-3.5 font-bold text-[#FFB300] hover:bg-[rgba(255,179,0,0.08)]"
              >
                <Download size={18} />
                {t(HOME.osImage)}
              </a>
            </div>
            <p className="mt-5 font-['IBM_Plex_Mono'] text-[11px] text-[#8ea0b3]">{t(HOME.creds)}</p>
          </motion.div>
          <motion.div initial="hidden" animate="visible" variants={fadeUp} className="min-w-0">
            <Photo src={PRODUCT.console} alt={t(HOME.photoConsoleAlt)} caption={t(HOME.photoConsole)} />
          </motion.div>
        </div>
      </section>

      <section className="border-b border-[rgba(79,195,247,0.1)] py-16">
        <div className="container">
          <Kicker n="01" label={t(HOME.archLabel)} title={t(HOME.archTitle)} />
          <div className="grid items-start gap-8 lg:grid-cols-2">
            <Photo src={PRODUCT.shack} alt={t(HOME.photoShackAlt)} caption={t(HOME.photoShack)} />
            <div>
              <FigStation caption={t(HOME.figStation)} />
              <p className="mt-4 text-sm leading-relaxed text-[#94a3b8]">{t(HOME.archP)}</p>
            </div>
          </div>
          <div className="mt-8 overflow-x-auto rounded-xl border border-[rgba(79,195,247,0.16)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#071018] text-[11px] tracking-wide text-[#FFB300] uppercase">
                <tr>
                  <th className="px-4 py-3">{t(HOME.thLayer)}</th>
                  <th className="px-4 py-3">{t(HOME.thRuns)}</th>
                  <th className="px-4 py-3">{t(HOME.thTalks)}</th>
                </tr>
              </thead>
              <tbody className="text-[#c5d4e0]">
                {HOME_LAYERS.map((row) => (
                  <tr key={row.layer.en} className="border-t border-[rgba(79,195,247,0.08)]">
                    <td className="px-4 py-3 font-semibold text-[#4fc3f7]">{t(row.layer)}</td>
                    <td className="px-4 py-3">{t(row.runs)}</td>
                    <td className="px-4 py-3 text-[#8ea0b3]">{t(row.talks)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="border-b border-[rgba(79,195,247,0.1)] py-16">
        <div className="container">
          <Kicker n="02" label={t(HOME.flowLabel)} title={t(HOME.flowTitle)} />
          <FigBoot caption={t(HOME.figBoot)} />
          <ol className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {HOME_FLOW.map((s) => (
              <li key={s.n} className="rounded-xl border border-[rgba(79,195,247,0.16)] bg-[#0b1520] p-5">
                <p className="font-['IBM_Plex_Mono'] text-xs text-[#FFB300]">{s.n}</p>
                <h3 className="mt-1 font-['Space_Grotesk'] font-semibold text-white">{t(s.title)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#94a3b8]">{t(s.body)}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <FigIc705 caption={t(HOME.figIc705)} />
            <FigDualBt caption={t(HOME.figDual)} />
          </div>
        </div>
      </section>

      <section className="border-b border-[rgba(79,195,247,0.1)] py-16">
        <div className="container">
          <Kicker n="03" label={t(HOME.intLabel)} title={t(HOME.intTitle)} />
          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            <Photo src={PRODUCT.logbook} alt={t(HOME.photoLogbookAlt)} caption={t(HOME.photoLogbook)} />
            <div>
              <FigWavelog caption={t(HOME.figWavelog)} />
              <p className="mt-3 text-sm leading-relaxed text-[#94a3b8]">{t(HOME.wavelogP)}</p>
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <FigSer2net caption={t(HOME.figSer2net)} />
              <p className="mt-3 text-sm leading-relaxed text-[#94a3b8]">{t(HOME.ser2netP)}</p>
            </div>
            <Photo
              src={PRODUCT.contest}
              alt={t({ pt: "Motor de contest Wavelog", en: "Wavelog contest engine" })}
              caption={t({
                pt: "Contest 3.0: CAT radio do Gate, Quick QSY :54321, SCP, mapa, serial multi-op.",
                en: "Contest 3.0: Gate CAT radio, Quick QSY :54321, SCP, map, multi-op serial.",
              })}
            />
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div>
              <FigMmdvm caption={t(HOME.figMmdvm)} />
              <p className="mt-3 text-sm leading-relaxed text-[#94a3b8]">{t(HOME.mmdvmP)}</p>
            </div>
            <div className="rounded-xl border border-[rgba(79,195,247,0.16)] bg-[#0b1520] p-5">
              <p className="font-['IBM_Plex_Mono'] text-[11px] tracking-widest text-[#FFB300] uppercase">WPSD</p>
              <h3 className="mt-1 font-['Space_Grotesk'] text-lg font-semibold text-white">
                {t({ pt: "Mesmo stack, outro dashboard", en: "Same stack, different dashboard" })}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#94a3b8]">
                {t({
                  pt: "MMDVMHost, DMRGateway, last heard nos logs, Instant Mode, BrandMeister/TGIF/XLX. O PHP do WPSD não roda na porta 80 — o nginx do Ham Cockpit já é o site.",
                  en: "MMDVMHost, DMRGateway, last heard from logs, Instant Mode, BrandMeister/TGIF/XLX. WPSD PHP does not run on port 80 — Ham Cockpit nginx already is the site.",
                })}
              </p>
            </div>
          </div>
          <div className="mt-8 overflow-x-auto rounded-xl border border-[rgba(79,195,247,0.16)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#071018] text-[11px] tracking-wide text-[#FFB300] uppercase">
                <tr>
                  <th className="px-4 py-3">{t(HOME.thSvc)}</th>
                  <th className="px-4 py-3">{t(HOME.thPath)}</th>
                  <th className="px-4 py-3">{t(HOME.thPort)}</th>
                  <th className="px-4 py-3">{t(HOME.thNotes)}</th>
                </tr>
              </thead>
              <tbody className="text-[#c5d4e0]">
                {HOME_PORTS.map((row) => (
                  <tr key={row.svc} className="border-t border-[rgba(79,195,247,0.08)]">
                    <td className="px-4 py-3 font-semibold">{row.svc}</td>
                    <td className="px-4 py-3 font-['IBM_Plex_Mono'] text-xs text-[#8ea0b3]">{row.path}</td>
                    <td className="px-4 py-3 font-['IBM_Plex_Mono'] text-[#4fc3f7]">{row.port}</td>
                    <td className="px-4 py-3 text-[#94a3b8]">{t(row.note)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="border-b border-[rgba(79,195,247,0.1)] py-16">
        <div className="container">
          <Kicker n="04" label={t(HOME.gearLabel)} title={t(HOME.gearTitle)} />
          <div className="mb-8 grid gap-6 lg:grid-cols-2">
            <Photo src={PRODUCT.radio} alt={t(HOME.photoRadioAlt)} caption={t(HOME.photoRadio)} />
            <Photo src={PRODUCT.gear} alt={t(HOME.photoGearAlt)} caption={t(HOME.photoGear)} />
          </div>
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {HOME_FEATURES.map((f, i) => {
              const Icon = FEATURE_ICONS[i] ?? Antenna;
              return (
                <motion.article
                  key={f.title.en}
                  variants={fadeUp}
                  className="rounded-xl border border-[rgba(79,195,247,0.16)] bg-[#0b1520] p-5"
                >
                  <Icon size={26} className="mb-3 text-[#4fc3f7]" />
                  <h3 className="font-['Space_Grotesk'] font-semibold text-white">{t(f.title)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#94a3b8]">{t(f.body)}</p>
                </motion.article>
              );
            })}
          </motion.div>
          <div className="mt-8 overflow-x-auto rounded-xl border border-[rgba(79,195,247,0.16)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#071018] text-[11px] tracking-wide text-[#FFB300] uppercase">
                <tr>
                  <th className="px-4 py-3">{t(HOME.thDev)}</th>
                  <th className="px-4 py-3">{t(HOME.thLink)}</th>
                  <th className="px-4 py-3">{t(HOME.thSerial)}</th>
                  <th className="px-4 py-3">{t(HOME.thProto)}</th>
                </tr>
              </thead>
              <tbody className="text-[#c5d4e0]">
                {HOME_DEVICES.map((row) => (
                  <tr key={row.name} className="border-t border-[rgba(79,195,247,0.08)]">
                    <td className="px-4 py-3 font-semibold">{row.name}</td>
                    <td className="px-4 py-3">{t(row.link)}</td>
                    <td className="px-4 py-3 font-['IBM_Plex_Mono'] text-xs text-[#4fc3f7]">{t(row.serial)}</td>
                    <td className="px-4 py-3 text-[#94a3b8]">{t(row.proto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="border-b border-[rgba(79,195,247,0.1)] py-16">
        <div className="container">
          <Kicker n="05" label={t(HOME.recipesLabel)} title={t(HOME.recipesTitle)} />
          <div className="grid gap-4 lg:grid-cols-3">
            {HOME_RECIPES.map((r) => (
              <article key={r.title.en} className="rounded-xl border border-[rgba(255,179,0,0.22)] bg-[#10160c] p-5">
                <p className="font-['IBM_Plex_Mono'] text-[11px] tracking-wide text-[#FFB300] uppercase">{t(r.kicker)}</p>
                <h3 className="mt-1 font-['Space_Grotesk'] text-lg font-semibold text-white">{t(r.title)}</h3>
                <ul className="mt-3 list-disc space-y-1.5 pl-4 text-sm text-[#c5d4e0]">
                  {r.points.map((p) => (
                    <li key={p.en}>{t(p)}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-[rgba(79,195,247,0.1)] py-16">
        <div className="container">
          <Kicker n="06" label={t(HOME.cablesLabel)} title={t(HOME.cablesTitle)} />
          <p className="mb-6 max-w-3xl text-[#94a3b8]">{t(HOME.cablesP)}</p>
          <FigAcomCable caption={t(HOME.figAcom)} />
        </div>
      </section>

      <section className="py-16">
        <div className="container text-center">
          <h2 className="mb-4 font-['Space_Grotesk'] text-4xl font-bold text-white">{t(HOME.ctaTitle)}</h2>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-[#94a3b8]">{t(HOME.ctaP)}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/console")}
              className="inline-flex items-center gap-2 rounded-lg bg-[#4fc3f7] px-8 py-4 font-bold text-[#0d1b2a] hover:bg-[#80d8ff]"
            >
              {t(HOME.openConsole)}
            </button>
            <button
              type="button"
              onClick={() => navigate("/docs")}
              className="inline-flex items-center gap-2 rounded-lg border border-[#4fc3f7] px-8 py-4 font-bold text-[#4fc3f7] hover:bg-[rgba(79,195,247,0.1)]"
            >
              {t(HOME.readDocs)}
            </button>
          </div>
        </div>
      </section>

      <footer className="border-t border-[rgba(79,195,247,0.1)] py-8">
        <div className="container flex flex-wrap items-center justify-between gap-3 text-xs text-[#5d7184]">
          <span className="font-['IBM_Plex_Mono']">
            Ham Cockpit v{APP_VERSION} · Raspberry Pi 3 / 4 / 5 · Ubuntu Server 24.04 LTS
          </span>
          <span>{t(HOME.footerRight)}</span>
        </div>
      </footer>
    </div>
  );
}

function Kicker({ n, label, title }: { n: string; label: string; title: string }) {
  return (
    <div className="mb-10">
      <div className="mb-3 flex items-center gap-2">
        <span className="font-['IBM_Plex_Mono'] text-xs font-bold text-[#FFB300]">{n}</span>
        <span className="font-['IBM_Plex_Mono'] text-xs tracking-widest text-[#4fc3f7]/60">{label}</span>
      </div>
      <h2 className="font-['Space_Grotesk'] text-3xl font-bold text-white sm:text-4xl">{title}</h2>
    </div>
  );
}
