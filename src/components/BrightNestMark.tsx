import markAsset from "@/assets/brightnest-mark.svg";

type BrightNestMarkProps = {
  className?: string;
  size?: number;
};

/** Logo mark bundled under `/_next/static` (students host does not serve `/public`). */
export function BrightNestMark({
  className = "h-11 w-11 object-contain",
  size = 44,
}: BrightNestMarkProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={markAsset.src}
      alt=""
      width={size}
      height={size}
      className={className}
    />
  );
}
