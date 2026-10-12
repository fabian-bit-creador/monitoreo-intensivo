import { APP_NAME } from "@/config/app";
import { BRAND_COLORS, ISOTYPE_PATHS } from "@/config/brand";

type BrandMarkProps = {
  /** Solo cuando el isotipo aparece sin el nombre al lado. */
  label?: string;
};

/** Isotipo de Monitoreo Intensivo. El tamaño lo da `.brand-mark` en CSS. */
export function BrandMark({ label }: BrandMarkProps) {
  const stroke = { fill: "none", strokeWidth: 12, strokeLinecap: "round" } as const;
  return (
    <svg
      className="brand-mark"
      viewBox="0 0 128 128"
      width="36"
      height="36"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d={ISOTYPE_PATHS.ring} stroke={BRAND_COLORS.navy} {...stroke} />
      <path d={ISOTYPE_PATHS.progress} stroke={BRAND_COLORS.teal} {...stroke} />
      <path d={ISOTYPE_PATHS.check} stroke={BRAND_COLORS.navy} strokeLinejoin="round" {...stroke} />
    </svg>
  );
}

/** Versión horizontal: isotipo y nombre oficial. En celular el nombre va en dos líneas. */
export function BrandLockup() {
  return (
    <div className="brand-lockup">
      <BrandMark />
      <strong className="brand-name">{APP_NAME}</strong>
    </div>
  );
}
