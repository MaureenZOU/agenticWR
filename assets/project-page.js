export function mountProjectPage(mounts) {
  const root = document.documentElement;
  const header = document.querySelector('.header');
  const resize = new ResizeObserver(() => {
    root.style.setProperty('--site-header-height', `${header.offsetHeight}px`);
  });
  resize.observe(header);

  const loader = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const section = entry.target;
      loader.unobserve(section);
      section.dataset.demoState = 'loading';
      Promise.resolve().then(mounts[section.dataset.chapter]).then(() => {
        section.dataset.demoState = 'ready';
      }).catch(error => {
        section.dataset.demoState = 'error';
        console.error(`Could not load ${section.dataset.chapter}`, error);
      });
    }
  }, { rootMargin: '400px 0px' });
  for (const name of Object.keys(mounts)) loader.observe(document.querySelector(`[data-chapter="${name}"]`));

  const states = new Map();
  function updateVideo(video) {
    const state = states.get(video);
    if (state.visible && state.resume && !document.hidden) video.play().catch(() => {});
    else video.pause();
  }
  const videos = new IntersectionObserver(entries => {
    for (const entry of entries) {
      states.get(entry.target).visible = entry.isIntersecting;
      updateVideo(entry.target);
    }
  }, { rootMargin: `-${header.offsetHeight}px 0px 0px` });
  document.querySelectorAll('[data-chapter="real-robot"] video').forEach(video => {
    const state = { visible: false, resume: true };
    states.set(video, state);
    video.addEventListener('play', () => { state.resume = true; });
    video.addEventListener('pause', () => {
      if (state.visible && !document.hidden) state.resume = false;
    });
    videos.observe(video);
  });
  document.addEventListener('visibilitychange', () => states.forEach((_, video) => updateVideo(video)));
}
