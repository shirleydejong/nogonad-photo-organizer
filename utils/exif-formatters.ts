/**
 * EXIF Data Formatting Utilities
 * Reusable formatting functions for EXIF metadata
 */

export function baseName(name?: string | null) {
  if (!name) return null;
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

export function formatAperture(v?: number | string | null) {
  if (v == null || v === "") return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? `ƒ/${n}` : `ƒ/${v}`;
}

export function formatExposureTime(v?: number | string | null) {
  if (v == null || v === "") return null;
  if (typeof v === "string") {
    // exiftool may already give "1/50"
    return v.includes("/") ? `${v} sec` : `${v} sec`;
  }
  const t = Number(v);
  if (!Number.isFinite(t) || t <= 0) return null;
  if (t >= 1) return `${t.toFixed(1)} sec`;
  const denom = Math.round(1 / t);
  return `1/${denom} sec`;
}

export function formatISO(v?: number | null) {
  return v != null ? `ISO ${v}` : null;
}

export function formatFocalLength(v?: number | string | null) {
  if (v == null || v === "") return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? `${n} mm` : `${v} mm`;
}

export function formatCropFactor(exif: any) {
  const f = exif?.FocalLength;
  const f35 = exif?.FocalLengthIn35mmFormat;
  if (!f || !f35) return null;
  const nF = Number(f);
  const nF35 = Number(f35);
  if (!Number.isFinite(nF) || !Number.isFinite(nF35) || nF === 0) return null;
  const cf = nF35 / nF;
  return `Crop factor: ${cf.toFixed(1)}x`;
}

export function formatMegapixels(w?: number, h?: number) {
  if (!w || !h) return null;
  const mp = (w * h) / 1_000_000;
  return `${mp.toFixed(1)} MP`;
}

export function formatDPI(exif: any) {
  const xr = exif?.XResolution;
  const yr = exif?.YResolution;
  const unit = exif?.ResolutionUnit; // 2=inches, 3=cm (exiftool)
  if (!xr && !yr) return null;
  const dpiX = xr ? Number(xr) : null;
  const dpiY = yr ? Number(yr) : null;
  const label = unit === 3 ? "dpcm" : "dpi";
  const v = dpiX || dpiY;
  return v ? `${Math.round(v)} ${label}` : null;
}

export function formatDate(exif: any) {
  const s = exif?.DateTimeOriginal || exif?.CreateDate;
  if (!s || typeof s !== "string") return null;
  // EXIF format "YYYY:MM:DD HH:MM:SS"
  const iso = s.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3").replace(" ", "T");
  const offset = exif?.OffsetTimeOriginal || exif?.OffsetTime || "";
  const d = new Date(iso + (typeof offset === "string" ? offset : ""));
  if (isNaN(d.getTime())) return s; // fallback
  const dt = new Intl.DateTimeFormat("nl-NL", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d);
  const tz = typeof offset === "string" && offset ? ` ${offset}` : "";
  return `${dt}${tz}`;
}

export function formatFlash(exif: any, asIcon = false) {
  // exiftool -n returns numeric bitfield for Flash
  const v = exif?.Flash;
  const fired =
    typeof v === "number" ? (v & 0x1) === 1 : String(exif?.Flash)?.toLowerCase().includes("fired");
  if (asIcon) {
    return fired ? "flash_on" : "flash_off";
  }
  return fired ? "On, Fired" : "Off";
}

export function formatWhiteBalance(exif: any) {
  const wb = exif?.WhiteBalance;
  if (wb == null) return null;
  // exiftool often returns "Auto", otherwise numeric
  if (typeof wb === "string") return wb;
  const map: Record<number, string> = { 0: "Auto", 1: "Manual" };
  return map[wb] || String(wb);
}

export function formatExposure(exif: any) {
  const mode = exif?.ExposureMode;
  const prog = exif?.ExposureProgram;
  const modeMap: Record<number, string> = { 0: "Auto", 1: "Manual", 2: "Auto Bracket" };
  const progMap: Record<number, string> = {
    0: "Undefined",
    1: "Manual",
    2: "Normal",
    3: "Aperture Priority",
    4: "Shutter Priority",
    5: "Creative",
    6: "Action",
    7: "Portrait",
    8: "Landscape",
  };
  const left = mode != null ? modeMap[mode] ?? String(mode) : null;
  const right = prog != null ? progMap[prog] ?? String(prog) : null;
  if (left && right) return `${left}    ${right}`;
  return left || right || null;
}

export function formatFileSize(exif: any) {
  const bytes = exif?.FileSize;
  if (!Number.isFinite(bytes)) return exif?.FileSize || null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface ColorFormatResult {
  left: string;
  right: string;
  extra: string;
}

export function formatColor(exif: any): ColorFormatResult {
  const profile = exif?.ProfileDescription;
  const colorSpace = exif?.ColorSpaceData || exif?.ColorType || exif?.ColorSpace;
  let cs = null;
  if (typeof colorSpace === "string") cs = colorSpace;
  else if (colorSpace === 1) cs = "sRGB";
  else if (colorSpace === 65535) cs = "Uncalibrated";
  const bitsArr = exif?.BitsPerSample;
  let bits = null;
  if (Array.isArray(bitsArr) && bitsArr.length) bits = `${bitsArr[0]} bits/channel`;
  else if (Number.isFinite(bitsArr)) bits = `${bitsArr} bits/channel`;
  else bits = "";

  bits = isHDR(exif) ? bits + " - HDR" : bits;

  return {
    left: cs || "",
    right: profile || "",
    extra: bits,
  };
}

export function isHDR(exif: any) {
  return (
    (Array.isArray(exif?.DirectoryItemSemantic) &&
      exif?.DirectoryItemSemantic.map((el: string | null | undefined) => el?.toLowerCase()).includes(
        "gainmap"
      )) ||
    exif?.HDREditMode === 1 ||
    exif?.HDRMaxValue > 0
  );
}
