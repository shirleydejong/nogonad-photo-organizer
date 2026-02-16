"use client";

interface IconProps {
  name: string;
  size?: number;
  color?: string;
}
  
export function Icon({ name, size, color }: IconProps) {
  return (
    <span className="material-symbols-rounded text-zinc-300 text-2xl" style={{ fontSize: size || 24, color: color || 'inherit' }}>
    {name}
    </span>
  );
}