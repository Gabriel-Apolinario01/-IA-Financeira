"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import type { Driver, DriveStep } from 'driver.js';
import { contextTour, documentTour, mainTour, TOUR_STORAGE_KEY, type TourKind, type TourView } from '@/lib/tour-steps';
import { visibleTourTarget, waitForTourTarget } from '@/lib/tour-targets';

export type GuidedTourHandle = { start: (kind: TourKind) => void };

export function GuidedTour({ ref, account, view, navigate, disabled }: {
  ref: Ref<GuidedTourHandle>; account: boolean; view: TourView;
  navigate: (view: TourView, chat?: boolean) => void; disabled: boolean;
}) {
  const [offer, setOffer] = useState(false);
  const [notice, setNotice] = useState('');
  const instance = useRef<Driver | null>(null);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const lifecycle = generation;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Read browser-only preference after hydration.
    try { setOffer(!localStorage.getItem(TOUR_STORAGE_KEY)); } catch { setOffer(true); }
    return () => { mounted.current = false; lifecycle.current++; request.current?.abort(); instance.current?.destroy(); };
  }, []);
  useEffect(() => { if (disabled) { generation.current++; request.current?.abort(); instance.current?.destroy(); } }, [disabled]);
  function dismiss(status: string) {
    setOffer(false);
    try { localStorage.setItem(TOUR_STORAGE_KEY, status); } catch { /* Tour works without storage. */ }
  }
  async function start(kind: TourKind) {
    if (disabled) return;
    if (document.querySelector('[data-tour-busy="true"]')) {
      setNotice('Aguarde o processamento terminar para abrir a ajuda.'); return;
    }
    if (kind === 'main' && document.querySelector('[data-tour-draft="true"]')) {
      setNotice('Conclua a revisão do arquivo antes de navegar pelo tour completo. Você pode usar “Como importar e revisar um documento?” sem sair desta tela.'); return;
    }
    instance.current?.destroy();
    request.current?.abort();
    const session = ++generation.current;
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    dismiss('seen'); setNotice('');
    try {
      const { driver } = await import('driver.js');
      if (!mounted.current || session !== generation.current) return;
      const exists = (id: string) => Boolean(visibleTourTarget(id));
      const plan = kind === 'main' ? mainTour(account) : kind === 'document' ? documentTour(account, exists) : contextTour(view, account, exists);
      let current = 0;
      let moving = false;
      let resizeFrame = 0;
      const resize = () => {
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => {
          if (!moving && tour.isActive() && plan[current].target) {
            steps[current].element = visibleTourTarget(plan[current].target!);
            tour.setSteps(steps); tour.drive(current);
          }
        });
      };
      const steps: DriveStep[] = plan.map((step, index) => ({
        popover: {
          title: step.title, description: step.description,
          showButtons: index ? ['previous', 'next', 'close'] : ['next', 'close'],
          nextBtnText: kind === 'main' && index === 0 ? 'Começar' : index === plan.length - 1 ? 'Finalizar' : 'Próximo',
          progressText: `${index + 1} de ${plan.length}`,
        },
      }));
      const tour = driver({
        steps, animate: false, smoothScroll: false, disableActiveInteraction: true,
        allowPageInteraction: false, overlayClickBehavior: 'none', overlayOpacity: 0.55,
        popoverClass: 'finance-tour', stageRadius: 12, stagePadding: 6,
        showProgress: true, prevBtnText: 'Voltar', doneBtnText: 'Finalizar', closeBtnLabel: 'Sair do tour',
        onNextClick: () => { if (current === plan.length - 1) { dismiss('completed'); tour.destroy(); } else void go(current + 1); },
        onPrevClick: () => { if (current > 0) void go(current - 1); },
        onElementMissing: () => false,
        onPopoverRender: popover => {
          popover.closeButton.textContent = 'Pular';
          if (kind === 'main' && current === plan.length - 1) {
            const replay = document.createElement('button');
            replay.className = 'tour-replay'; replay.textContent = 'Rever tour';
            replay.onclick = () => { void go(0); };
            popover.description.append(replay);
          }
        },
        onDestroyed: () => {
          request.current?.abort();
          window.removeEventListener('resize', resize); cancelAnimationFrame(resizeFrame);
          instance.current = null;
          const focus = returnFocus?.isConnected ? returnFocus : visibleTourTarget('help');
          focus?.focus({ preventScroll: true });
        },
      });
      instance.current = tour;
      window.addEventListener('resize', resize);
      async function go(index: number) {
        if (moving || !mounted.current || session !== generation.current) return;
        moving = true;
        request.current?.abort();
        const controller = new AbortController(); request.current = controller;
        const step = plan[index];
        if (step.view) navigate(step.view, step.chat);
        const target = step.target ? await waitForTourTarget(step.target, controller.signal) : undefined;
        if (controller.signal.aborted || !mounted.current || session !== generation.current) { moving = false; return; }
        current = index;
        // Missing conditional targets become a readable centered explanation, never a broken spotlight.
        steps[index].element = target;
        tour.setSteps(steps);
        tour.drive(index);
        moving = false;
      }
      await go(0);
    } catch {
      if (mounted.current) setNotice('Não foi possível abrir o tour. Tente novamente pelo botão de ajuda.');
    }
  }
  useImperativeHandle(ref, () => ({ start: kind => { void start(kind); } }));
  return <>
    {offer && !disabled && <section className="tour-invite" aria-label="Conheça o site">
      <div><strong>Quer conhecer o site em um tour rápido?</strong><p>Veja onde registrar, revisar e planejar, no seu ritmo.</p></div>
      <button className="button primary" onClick={() => void start('main')}>Fazer tour</button>
      <button className="button secondary" onClick={() => dismiss('dismissed')}>Agora não</button>
    </section>}
    {notice && <p className="notice" role="status">{notice}</p>}
  </>;
}
