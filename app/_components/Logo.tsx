export default function Logo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent-500 shrink-0">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L3 7v10l9 5 9-5V7L12 2z" stroke="#0f2347" strokeWidth="2" strokeLinejoin="round" fill="rgba(255,255,255,0.15)"/>
          <path d="M12 8v8M8 10l4-2 4 2" stroke="#0f2347" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
      {!collapsed && (
        <div className="leading-tight">
          <div className="text-white font-semibold text-sm tracking-tight">RouteGuard</div>
          <div className="text-brand-300 text-[10px] font-medium tracking-wider uppercase">Advisory Platform</div>
        </div>
      )}
    </div>
  );
}
