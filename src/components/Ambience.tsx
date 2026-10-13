import { useEffect, useRef } from 'react';

/**
 * The ambient layers from the original timer: two blurred orbs that take the
 * current session's colour, and a soft glow that follows the pointer.
 * They live outside the page layer so nothing ever sits on top of the text.
 */
export function Ambience() {
  const glowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const glow = glowRef.current;
    if (!glow) return;
    let x = 0;
    let y = 0;
    let frame = 0;
    let shown = false;

    const onMove = (event: MouseEvent) => {
      x = event.clientX;
      y = event.clientY;
      if (!shown) {
        shown = true;
        glow.style.opacity = '1';
      }
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        glow.style.transform = `translate(${x}px, ${y}px)`;
        frame = 0;
      });
    };
    const onLeave = () => {
      glow.style.opacity = '0';
      shown = false;
    };

    window.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <>
      <div className="orb o1" />
      <div className="orb o2" />
      <div id="glow" ref={glowRef} />
    </>
  );
}
