export function Photo({
  src,
  alt,
  caption,
  className = "",
}: {
  src: string;
  alt: string;
  caption?: string;
  className?: string;
}) {
  return (
    <figure className={`overflow-hidden rounded-xl border border-[rgba(79,195,247,0.16)] bg-[#071018] ${className}`}>
      <img src={src} alt={alt} className="h-auto w-full object-cover" />
      {caption ? <figcaption className="px-4 py-2.5 text-xs leading-relaxed text-[#8ea0b3]">{caption}</figcaption> : null}
    </figure>
  );
}

export const PRODUCT = {
  hero: "/product/hero.jpg",
  console: "/product/console.jpg",
  shack: "/product/shack.jpg",
  radio: "/product/radio.jpg",
  gear: "/product/gear.jpg",
  logbook: "/product/logbook.jpg",
  contest: "/product/contest.jpg",
  gate: "/product/gate.jpg",
};
