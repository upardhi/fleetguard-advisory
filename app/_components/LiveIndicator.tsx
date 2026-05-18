export default function LiveIndicator({ label = "LIVE" }: { label?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full bg-emerald-400 live-dot shrink-0" />
      <span className="text-emerald-400 text-[10px] font-bold tracking-widest">{label}</span>
    </div>
  );
}
