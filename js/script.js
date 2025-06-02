// Header scroll behavior
let scrollThreshold = 80; // Distance from top before header hides
const header = document.querySelector('.header');

function handleScroll() {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    if (scrollTop <= scrollThreshold) {
        // At or near the top - show header
        header.classList.remove('hidden');
        header.classList.add('visible');
    } else {
        // Scrolled down - hide header
        header.classList.add('hidden');
        header.classList.remove('visible');
    }
}

// Throttle scroll events for better performance
let scrollTimeout;
window.addEventListener('scroll', () => {
    if (!scrollTimeout) {
        scrollTimeout = setTimeout(() => {
            handleScroll();
            scrollTimeout = null;
        }, 10);
    }
});

// Initialize header as visible
if (header) {
    header.classList.add('visible');
}

// Add smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const targetId = this.getAttribute('href');
        // Check if the link is on the same page
        if (targetId.startsWith('#')) {
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        } else {
          // If it's a link to another page with a hash, navigate first
          if (targetId.includes('#')) {
            window.location.href = targetId;
          } else {
            // Fallback for simple links or if logic needs to be expanded
             window.location.href = targetId; 
          }
        }
    });
});

// Add fade-in animation on scroll
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver(function(entries) {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('fade-in');
        }
    });
}, observerOptions);

// Observe all feature cards and sections
document.querySelectorAll('.feature-card, .about-content, .section-title, .hero-content, .value-card, .content-text, .highlight-box').forEach(el => {
    observer.observe(el);
});

// Add parallax effect to hero background
window.addEventListener('scroll', () => {
    const scrolled = window.pageYOffset;
    const heroBackground = document.querySelector('.hero-background');
    if (heroBackground) {
        heroBackground.style.transform = `translateY(${scrolled * 0.5}px)`;
    }
});

// Ursa Major Constellation Animation
(function() {
    const constellationContainer = document.querySelector('.constellation-container');
    if (!constellationContainer) return;

    const svg = document.querySelector('.ursa-major-svg');
    const backgroundStars = document.querySelector('.background-stars');
    const starGroups = document.querySelectorAll('.star-group');
    const starInfos = document.querySelectorAll('.star-info');
    
    // Generate random background stars
    const numBackgroundStars = 200; // Increased number for better coverage
    for (let i = 0; i < numBackgroundStars; i++) {
        const star = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        // Distribute stars across a larger area to ensure visibility when zoomed
        star.setAttribute('cx', Math.random() * 2400 - 600); // -600 to 1800
        star.setAttribute('cy', Math.random() * 1600 - 400); // -400 to 1200
        star.setAttribute('r', Math.random() * 1.5 + 0.3);
        star.classList.add('background-star');
        // Add random opacity for natural variation
        star.style.opacity = Math.random() * 0.6 + 0.2; // 0.2 to 0.8
        backgroundStars.appendChild(star);
    }

    // Scroll-based zoom animation
    let currentStar = 0;
    let isZooming = false;
    let scrollProgress = 0;
    let featuresTop = 0;
    let sectionHeight = 0;

    function updateDimensions() {
        const featuresSection = document.querySelector('.features');
        featuresTop = featuresSection.offsetTop;
        sectionHeight = window.innerHeight * 7; // 6 stars + extra space
        // Don't set the section height here - let CSS handle it
    }

    function getStarPosition(starElement) {
        const starGroup = starElement.querySelector('.star-core');
        const cx = parseFloat(starGroup.getAttribute('cx'));
        const cy = parseFloat(starGroup.getAttribute('cy'));
        return { x: cx, y: cy };
    }

    function updateConstellation() {
        const scrollY = window.pageYOffset;
        const featuresSection = document.querySelector('.features');
        const sectionTop = featuresSection.offsetTop;
        const sectionBottom = sectionTop + featuresSection.offsetHeight;
        const relativeScroll = scrollY - sectionTop + window.innerHeight;
        
        // Check if we're in the features section
        if (scrollY + window.innerHeight < sectionTop || scrollY > sectionBottom) {
            // Reset to initial state when outside section
            svg.style.transform = 'translate(-50%, -50%) scale(1)';
            starGroups.forEach(star => star.classList.remove('active'));
            starInfos.forEach(info => info.classList.remove('active'));
            constellationContainer.classList.remove('zoomed');
            currentStar = 0;
            return;
        }

        // Add zoomed class when scrolling begins
        if (relativeScroll > 100) {
            constellationContainer.classList.add('zoomed');
        }

        // Calculate progress through the section (0 to 1)
        const totalScrollDistance = sectionHeight - window.innerHeight;
        const scrollProgress = Math.max(0, Math.min(1, (relativeScroll - window.innerHeight) / totalScrollDistance));
        
        // Calculate which star should be active
        const starIndex = Math.floor(scrollProgress * 6);
        const starLocalProgress = (scrollProgress * 6) % 1;

        if (starIndex !== currentStar && starIndex < 6) {
            currentStar = starIndex;
            
            // Update active star
            starGroups.forEach((star, i) => {
                star.classList.toggle('active', i === currentStar);
            });
            
            starInfos.forEach((info, i) => {
                info.classList.toggle('active', i === currentStar);
            });
        }

        // Zoom and pan to current star
        if (currentStar < 6 && starIndex < 6) {
            const targetStar = starGroups[currentStar];
            const starPos = getStarPosition(targetStar);
            
            // Apply smooth easing to the transform
            const easeProgress = easeInOutCubic(starLocalProgress);
            const easedZoom = 1 + (easeProgress * 2);
            
            // Calculate pan to center the star
            const centerX = 600; // SVG viewBox center (1200/2)
            const centerY = 400;
            const easedPanX = (centerX - starPos.x) * (easedZoom - 1);
            const easedPanY = (centerY - starPos.y) * (easedZoom - 1);
            
            svg.style.transform = `translate(-50%, -50%) translate(${easedPanX}px, ${easedPanY}px) scale(${easedZoom})`;
        }
    }

    // Easing function for smoother animation
    function easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    // Initialize on load
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    window.addEventListener('scroll', updateConstellation);
    
    // Optional: Click to jump to star
    starGroups.forEach((star, index) => {
        star.style.cursor = 'pointer';
        star.addEventListener('click', () => {
            const featuresSection = document.querySelector('.features');
            const sectionTop = featuresSection.offsetTop;
            const totalScrollDistance = sectionHeight - window.innerHeight;
            const targetProgress = (index + 0.5) / 6; // Center on the star
            const targetScroll = sectionTop + (targetProgress * totalScrollDistance);
            
            window.scrollTo({
                top: targetScroll,
                behavior: 'smooth'
            });
        });
    });

    // Remove parallax effect - stars should stay in place
    // The twinkling animation is handled by CSS
})();

// Scroll down arrow functionality
(function() {
    const scrollArrow = document.getElementById('scrollArrow');
    if (!scrollArrow) return;

    let hasScrolled = false;
    const scrollThreshold = 100; // Hide after scrolling 100px down

    function handleArrowScroll() {
        if (hasScrolled) return; // Once hidden, don't show again

        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        
        if (scrollTop > scrollThreshold) {
            hasScrolled = true;
            scrollArrow.classList.add('hidden');
        }
    }

    // Listen for scroll events
    window.addEventListener('scroll', handleArrowScroll);

    // Optional: Make the arrow clickable to scroll down
    scrollArrow.addEventListener('click', function() {
        const featuresSection = document.querySelector('.features');
        if (featuresSection) {
            featuresSection.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        } else {
            // Fallback: scroll down by viewport height
            window.scrollBy({
                top: window.innerHeight,
                behavior: 'smooth'
            });
        }
    });
})(); 