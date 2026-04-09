// ===================== SITE EFFECTS =====================

document.addEventListener('DOMContentLoaded', () => {
  // Smooth scroll behavior for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const href = this.getAttribute('href');
      if (href !== '#' && document.querySelector(href)) {
        e.preventDefault();
        document.querySelector(href).scrollIntoView({
          behavior: 'smooth'
        });
      }
    });
  });

  // Lazy load images when they come into viewport (Performance)
  const imageObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        if (img.dataset.src) {
          img.src = img.dataset.src;
          img.classList.add('loaded');
          imageObserver.unobserve(img);
        }
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('img[data-src]').forEach(img => {
    imageObserver.observe(img);
  });
});