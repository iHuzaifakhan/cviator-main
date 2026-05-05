// frontend/components/LivePreview.js
// ---------------------------------------------------------------
// Renders an A4 template inside a fluid container that scales to
// fit. The CV itself stays at exact 210×297mm dimensions (so the
// PDF matches), but a CSS transform shrinks it whenever the parent
// is narrower than 210mm. This keeps the preview centered and
// prevents the rightward drift that otherwise happens when
// `width: 210mm` overflows the column.
// ---------------------------------------------------------------

import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import TemplateClassic from './templates/TemplateClassic';
import TemplateModern  from './templates/TemplateModern';

const templates = {
  classic: TemplateClassic,
  modern:  TemplateModern,
};

const A4_WIDTH_PX  = 793.7;   // 210mm at 96dpi
const A4_HEIGHT_PX = 1122.5;  // 297mm at 96dpi

// SSR-safe layout effect: useLayoutEffect on the client, no-op on the server.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function LivePreview({ resume, template }) {
  const Template = templates[template] || TemplateClassic;
  const wrapperRef = useRef(null);
  const [scale, setScale] = useState(1);

  useIsoLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return undefined;
    const update = () => {
      const w = el.clientWidth;
      if (!w) return;
      // Never enlarge — only shrink to fit.
      setScale(Math.min(1, w / A4_WIDTH_PX));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrapperRef} className="w-full">
      {/* This wrapper reserves the scaled height so neighbouring layout
          doesn't jump as the page shrinks/expands. */}
      <div
        style={{
          width:  '100%',
          height: A4_HEIGHT_PX * scale,
          position: 'relative',
        }}
      >
        <div
          style={{
            position:        'absolute',
            top:             0,
            left:            '50%',
            transform:       `translateX(-50%) scale(${scale})`,
            transformOrigin: 'top center',
            width:           `${A4_WIDTH_PX}px`,
            height:          `${A4_HEIGHT_PX}px`,
            background:      '#ffffff',
            boxShadow:       '0 1px 3px rgba(0,0,0,0.05)',
            borderRadius:    '4px',
            overflow:        'hidden',
          }}
        >
          <Template resume={resume} />
        </div>
      </div>
    </div>
  );
}

export default memo(LivePreview);
