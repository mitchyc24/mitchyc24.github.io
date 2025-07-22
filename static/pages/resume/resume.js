document.addEventListener('DOMContentLoaded', function() {
  // Tab navigation
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      // Remove active class from all tabs
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));
      
      // Add active class to current tab
      button.classList.add('active');
      const tabId = button.getAttribute('data-tab');
      document.getElementById(`${tabId}-tab`).classList.add('active');
      
      // Trigger animations for the newly visible content
      animateSkillBars();
    });
  });
  
  // Expandable timeline items
  const expandHeaders = document.querySelectorAll('.expandable-header');
  
  expandHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const targetId = header.getAttribute('data-target');
      const detailsElement = document.getElementById(targetId);
      detailsElement.classList.toggle('expanded');
      
      // Rotate chevron icon
      const chevron = header.querySelector('.expand-btn i');
      chevron.style.transform = detailsElement.classList.contains('expanded') ? 'rotate(180deg)' : 'rotate(0)';
    });
  });
  
  // Flip cards functionality
  const flipCards = document.querySelectorAll('.flip-card');
  
  flipCards.forEach(card => {
    card.addEventListener('click', () => {
      card.classList.toggle('flipped');
    });
  });
  
  // Language toggle
  const langToggleBtn = document.getElementById('lang-toggle-btn');
  const enElements = document.querySelectorAll('.en');
  const frElements = document.querySelectorAll('.fr');
  const enIcon = document.querySelector('.lang-icon.en');
  const frIcon = document.querySelector('.lang-icon.fr');
  
  let currentLang = 'en';
  
  function setLanguage(lang) {
    if (lang === 'en') {
      enElements.forEach(el => el.style.display = 'block');
      frElements.forEach(el => el.style.display = 'none');
      enIcon.classList.add('active');
      frIcon.classList.remove('active');
    } else {
      enElements.forEach(el => el.style.display = 'none');
      frElements.forEach(el => el.style.display = 'block');
      enIcon.classList.remove('active');
      frIcon.classList.add('active');
    }
    currentLang = lang;
    localStorage.setItem('preferredLanguage', lang);
  }
  
  langToggleBtn.addEventListener('click', () => {
    const newLang = currentLang === 'en' ? 'fr' : 'en';
    setLanguage(newLang);
  });
  
  // Initialize language from local storage or default
  const savedLang = localStorage.getItem('preferredLanguage') || 'en';
  setLanguage(savedLang);
  
  // Animate skill bars on scroll
  function animateSkillBars() {
    if (document.getElementById('skills-tab').classList.contains('active')) {
      const skillLevels = document.querySelectorAll('.skill-level');
      skillLevels.forEach(level => {
        const width = level.style.width;
        level.style.width = '0';
        setTimeout(() => {
          level.style.width = width;
        }, 100);
      });
    }
  }
  
  // Trigger animations on scroll
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-slide-up');
        if (entry.target.classList.contains('skills-card')) {
          animateSkillBars();
        }
      }
    });
  }, {
    threshold: 0.1
  });
  
  document.querySelectorAll('.skills-card, .education-card, .timeline-card, .contact-card').forEach(element => {
    observer.observe(element);
  });
  
  // Initially animate skill bars if skills tab is active on load
  animateSkillBars();
  
  // Tech bubble random animation
  const techBubbles = document.querySelectorAll('.tech-bubble');
  
  function animateTechBubble() {
    const randomIndex = Math.floor(Math.random() * techBubbles.length);
    const bubble = techBubbles[randomIndex];
    
    bubble.classList.add('pulse-animation');
    setTimeout(() => {
      bubble.classList.remove('pulse-animation');
    }, 2000);
    
    setTimeout(animateTechBubble, 3000);
  }
  
  setTimeout(animateTechBubble, 3000);
});
