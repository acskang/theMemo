export function createMasonry(container, { minWidth = 280, gap = 18 } = {}) {
  let frame = 0;
  const layout = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const cards = [...container.children].filter(item => item.matches('.note-card'));
      if (!cards.length) { container.style.height = 'auto'; return; }
      const width = container.clientWidth;
      const columns = Math.max(1, Math.floor((width + gap) / (minWidth + gap)));
      const cardWidth = (width - gap * (columns - 1)) / columns;
      const heights = Array(columns).fill(0);
      cards.forEach((card, index) => {
        const column = index < columns ? index : heights.indexOf(Math.min(...heights));
        card.style.width = `${cardWidth}px`;
        card.style.transform = `translate(${column * (cardWidth + gap)}px, ${heights[column]}px)`;
        heights[column] += card.offsetHeight + gap;
      });
      container.style.height = `${Math.max(0, ...heights) - (cards.length ? gap : 0)}px`;
    });
  };
  const observer = new ResizeObserver(layout);
  observer.observe(container);
  container.addEventListener('load', layout, true);
  container.addEventListener('error', layout, true);
  layout();
  return { layout, destroy() { cancelAnimationFrame(frame); observer.disconnect(); } };
}
