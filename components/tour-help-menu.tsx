"use client";

import { useEffect, useRef, useState } from 'react';
import { CircleHelp } from 'lucide-react';
import type { TourKind } from '@/lib/tour-steps';

export function TourHelpMenu({ start, guides, disabled }: {
  start: (kind: TourKind) => void; guides: () => void; disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  function choose(action: () => void) { setOpen(false); trigger.current?.focus(); action(); }
  return <div className="tour-help" ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <button ref={trigger} type="button" data-tour="help" className="button help-button" aria-label="Precisa de uma mão?"
      aria-expanded={open} aria-controls="tour-help-options" disabled={disabled} onClick={() => setOpen(!open)}>
      <CircleHelp size={18} /><span>Precisa de uma mão?</span>
    </button>
    {open && <div id="tour-help-options" className="tour-help-options" role="group" aria-label="Opções de ajuda">
      <button type="button" onClick={() => choose(() => start('main'))}>Fazer tour pelo site</button>
      <button type="button" onClick={() => choose(() => start('context'))}>Ajuda desta tela</button>
      <button type="button" onClick={() => choose(guides)}>Ver guias educativos</button>
    </div>}
  </div>;
}
