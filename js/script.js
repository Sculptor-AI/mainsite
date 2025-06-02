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
    header.classList.add('transparent'); // Make header transparent by default
}

// Navigation bar toggle functionality
/*
(function() {
    const navToggle = document.getElementById('navToggle');
    const header = document.querySelector('.header');
    
    if (!navToggle || !header) return;
    
    let isTransparent = false;
    
    // Load saved preference from localStorage
    const savedPreference = localStorage.getItem('navBarStyle');
    if (savedPreference === 'transparent') {
        isTransparent = true;
        header.classList.add('transparent');
        updateToggleIcon();
    }
    
    function updateToggleIcon() {
        const toggleIcon = navToggle.querySelector('.toggle-icon');
        if (isTransparent) {
            toggleIcon.textContent = '🏠'; // House icon for solid/normal mode
            navToggle.title = 'Switch to normal navigation';
        } else {
            toggleIcon.textContent = '🎨'; // Art palette icon for transparent mode
            navToggle.title = 'Switch to transparent navigation';
        }
    }
    
    function toggleNavStyle() {
        isTransparent = !isTransparent;
        
        if (isTransparent) {
            header.classList.add('transparent');
            localStorage.setItem('navBarStyle', 'transparent');
        } else {
            header.classList.remove('transparent');
            localStorage.setItem('navBarStyle', 'normal');
        }
        
        updateToggleIcon();
        
        // Add a small animation feedback
        navToggle.style.transform = 'scale(0.9)';
        setTimeout(() => {
            navToggle.style.transform = '';
        }, 150);
    }
    
    navToggle.addEventListener('click', toggleNavStyle);
    
    // Initialize the icon based on current state
    updateToggleIcon();
})();
*/

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
    
    if (!svg || !backgroundStars || starGroups.length === 0) {
        console.warn("Constellation SVG elements not found, animation will not run.");
        return;
    }
    
    // Generate random background stars
    const numBackgroundStars = 200;
    for (let i = 0; i < numBackgroundStars; i++) {
        const star = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        star.setAttribute('cx', Math.random() * 2400 - 600); 
        star.setAttribute('cy', Math.random() * 1600 - 400); 
        star.setAttribute('r', Math.random() * 1.5 + 0.3);
        star.classList.add('background-star');
        star.style.opacity = Math.random() * 0.6 + 0.2; 
        backgroundStars.appendChild(star);
    }

    let currentStar = 0;
    let featuresTop = 0;
    let sectionHeight = 0;

    // Animation state variables for lerping
    let targetScale = 1.0;
    let currentScale = 1.0;
    let targetPanXVector = 0; // Represents (centerX - starPos.x)
    let currentPanXVector = 0;
    let targetPanYVector = 0; // Represents (centerY - starPos.y)
    let currentPanYVector = 0;

    function updateDimensions() {
        const featuresSection = document.querySelector('.features');
        if (featuresSection) {
            featuresTop = featuresSection.offsetTop;
            sectionHeight = featuresSection.offsetHeight;
        }
    }

    function getStarPosition(starElement) {
        const starCore = starElement.querySelector('.star-core');
        if (!starCore) return { x: 0, y: 0 }; // Fallback
        const cx = parseFloat(starCore.getAttribute('cx'));
        const cy = parseFloat(starCore.getAttribute('cy'));
        return { x: cx, y: cy };
    }

    function updateConstellationTargets() { // Renamed to clarify it sets targets
        const scrollY = window.pageYOffset;
        const featuresSection = document.querySelector('.features');
        
        if (!featuresSection || !svg.viewBox || !svg.viewBox.baseVal) return; // Guard against missing elements/viewBox

        const sectionTop = featuresSection.offsetTop;
        const sectionBottom = sectionTop + featuresSection.offsetHeight;

        if (scrollY + window.innerHeight < sectionTop + 100 || scrollY > sectionBottom - 100) {
            targetScale = 1.0;
            targetPanXVector = 0;
            targetPanYVector = 0;
            
            starGroups.forEach(star => star.classList.remove('active'));
            starInfos.forEach(info => info.classList.remove('active'));
            constellationContainer.classList.remove('zoomed');
            currentStar = 0;
            return;
        }

        const relativeScroll = scrollY - sectionTop + window.innerHeight;
        
        if (relativeScroll > window.innerHeight * 0.2) {
            constellationContainer.classList.add('zoomed');
        } else {
            constellationContainer.classList.remove('zoomed');
        }

        const totalScrollDistance = sectionHeight - window.innerHeight;
        if (totalScrollDistance <= 0) {
            targetScale = 1.0;
            targetPanXVector = 0;
            targetPanYVector = 0;
            return;
        }

        const scrollProgress = Math.max(0, Math.min(1, (relativeScroll - window.innerHeight) / totalScrollDistance));
        
        const numStars = starGroups.length;
        if (numStars === 0) return;

        const starIndex = Math.min(Math.floor(scrollProgress * numStars), numStars - 1);
        const starLocalProgress = (scrollProgress * numStars) % 1;

        // Ensure starIndex is valid before proceeding
        if (starIndex >= 0 && starIndex < numStars) {
            if (starIndex !== currentStar) {
                currentStar = starIndex; // Update currentStar only if it actually changes
            }
            // Always update active classes based on the current valid starIndex
            starGroups.forEach((star, i) => star.classList.toggle('active', i === starIndex));
            starInfos.forEach((info, i) => info.classList.toggle('active', i === starIndex));
        } else {
            // If starIndex is somehow out of bounds (e.g., numStars is 0 after check, or bad calculation)
            // Deactivate all stars and infos as a fallback.
            starGroups.forEach(star => star.classList.remove('active'));
            starInfos.forEach(info => info.classList.remove('active'));
            currentStar = -1; // Indicate no star is active
        }

        if (currentStar >= 0 && currentStar < numStars && starGroups[currentStar]) {
            const targetStarElement = starGroups[currentStar];
            const starPos = getStarPosition(targetStarElement);
            
            const svgWidth = svg.viewBox.baseVal.width;
            const svgHeight = svg.viewBox.baseVal.height;
            const centerX = svgWidth / 2;
            const centerY = svgHeight / 2;

            const baseZoom = 1.1; 
            const additionalZoom = 0.4; 
            const peakZoomProgress = 0.5;
            let progressForAdditionalZoom = 0;
            if (starLocalProgress < peakZoomProgress) {
                progressForAdditionalZoom = starLocalProgress / peakZoomProgress;
            } else {
                progressForAdditionalZoom = (1 - starLocalProgress) / (1 - peakZoomProgress);
            }
            const easedAdditionalZoomProgress = easeInOutCubic(progressForAdditionalZoom);
            const easedZoom = baseZoom + (easedAdditionalZoomProgress * additionalZoom);

            targetScale = easedZoom;
            targetPanXVector = centerX - starPos.x;
            targetPanYVector = centerY - starPos.y;
        } else {
            // Fallback if currentStar is out of bounds or targetStarElement is null
            targetScale = 1.0;
            targetPanXVector = 0;
            targetPanYVector = 0;
        }
    }
    
    function animationLoop() {
        const smoothingFactor = 0.05; // Reduced for more smoothness

        // Lerp current values towards target values
        currentScale += (targetScale - currentScale) * smoothingFactor;
        currentPanXVector += (targetPanXVector - currentPanXVector) * smoothingFactor;
        currentPanYVector += (targetPanYVector - currentPanYVector) * smoothingFactor;

        // Calculate the final pan values for the transform string
        const finalDisplayPanX = currentPanXVector * currentScale;
        const finalDisplayPanY = currentPanYVector * currentScale;

        // Check if we are "close enough" to the target idle state
        const isTargetIdle = Math.abs(targetScale - 1.0) < 0.001 &&
                           Math.abs(targetPanXVector) < 0.001 &&
                           Math.abs(targetPanYVector) < 0.001;

        const isCurrentEffectivelyIdle = Math.abs(currentScale - 1.0) < 0.001 &&
                                     Math.abs(currentPanXVector) < 0.001 &&
                                     Math.abs(currentPanYVector) < 0.001;

        if (isTargetIdle && isCurrentEffectivelyIdle) {
            // If at the target idle state and current is also effectively idle,
            // ensure transform is precisely set to the clean idle state.
            // Only update if not already in the exact clean state to avoid redundant style changes.
            if (svg.style.transform !== 'translate(-50%, -50%) scale(1) translate(0px, 0px)') {
                svg.style.transform = `translate(-50%, -50%) scale(1) translate(0px, 0px)`;
            }
            // No need to explicitly snap currentScale, currentPanXVector, currentPanYVector here;
            // the lerping will naturally bring them extremely close to the target values.
        } else {
            // Otherwise, always update the transform with the lerped values
            svg.style.transform = `translate(-50%, -50%) scale(${currentScale}) translate(${finalDisplayPanX}px, ${finalDisplayPanY}px)`;
        }

        requestAnimationFrame(animationLoop);
    }

    function easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    window.addEventListener('scroll', updateConstellationTargets); // Changed to call target updater
    
    animationLoop(); // Start the animation loop
    
    starGroups.forEach((star, index) => {
        star.style.cursor = 'pointer';
        star.addEventListener('click', () => {
            const featuresSection = document.querySelector('.features');
            if (!featuresSection) return; // Guard clause

            const sectionTop = featuresSection.offsetTop;
            const totalScrollDistance = sectionHeight - window.innerHeight;
            if (totalScrollDistance <=0) return; // Avoid division by zero

            const numStars = starGroups.length;
            if (numStars === 0) return; // No stars

            const targetProgress = (index + 0.5) / numStars; // Center on the star
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