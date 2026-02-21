"use client";

import { Icon } from "@/components/icon";

interface ExifItemProps {
  icon: string;
  label: string | React.ReactNode;
  values: Array<string | null>;
}

export function ExifItem({ icon, label, values }: ExifItemProps) {
  const clean = values.filter(Boolean) as string[];
  if (clean.length === 0) return null;
  return (
    <div className="flex gap-3 border-b border-white/5 pb-2">
      <div className="w-14 min-w-14 flex items-center justify-center text-white">
        <Icon name={icon} />
      </div>
      <div className="flex-1">
        <div className="text-zinc-300 text-xs font-medium">{label}</div>
        <div className="text-zinc-100 text-sm flex flex-wrap gap-x-6 mt-1">
          {clean.map((v, i) => (
            <span key={i} className="truncate">{v}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
