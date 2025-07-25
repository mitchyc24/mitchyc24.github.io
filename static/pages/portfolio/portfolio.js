// Portfolio data
const portfolioProjects = [
    {
        id: 'chess',
        title: 'Chess Game',
        description: 'A fully functional chess game built with vanilla JavaScript. Features include move validation, check detection, and game state management.',
        image: 'static/images/chess-preview.png',
        tags: ['JavaScript', 'Game Development', 'Logic'],
        link: 'static/pages/portfolio/chess/chess.html'
    }
    // Add more projects here in the future
];

// Create portfolio page
function createPortfolioPage() {
    const container = document.createElement('div');
    container.className = 'portfolio-container';
    
    // Header
    const header = document.createElement('div');
    header.className = 'portfolio-header';
    header.innerHTML = `
        <h1 class="en">My Portfolio</h1>
        <h1 class="fr">Mon Portfolio</h1>
        <p class="en">A collection of projects I've worked on</p>
        <p class="fr">Une collection de projets sur lesquels j'ai travaillé</p>
    `;
    
    // Projects grid
    const projectsGrid = document.createElement('div');
    projectsGrid.className = 'projects-grid';
    
    // Create project cards
    portfolioProjects.forEach(project => {
        const card = createProjectCard(project);
        projectsGrid.appendChild(card);
    });
    
    container.appendChild(header);
    container.appendChild(projectsGrid);
    
    return container;
}

// Create individual project card
function createProjectCard(project) {
    const card = document.createElement('div');
    card.className = 'project-card';
    card.dataset.projectId = project.id;
    
    card.innerHTML = `
        <div class="card-image">
            <img src="${project.image}" alt="${project.title}" onerror="this.src='static/images/placeholder.png'">
        </div>
        <div class="card-content">
            <h3>${project.title}</h3>
            <p>${project.description}</p>
            <div class="card-tags">
                ${project.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
            </div>
        </div>
        <div class="card-overlay">
            <span class="view-project en">View Project</span>
            <span class="view-project fr">Voir le Projet</span>
        </div>
    `;
    
    // Add click event to navigate using HTMX
    card.addEventListener('click', () => {
        // Use HTMX to load the project page
        htmx.ajax('GET', project.link, {target: '#content-container'});
        
        // Update page styles for chess
        if (project.id === 'chess') {
            const pageStyle = document.getElementById('page-styles');
            pageStyle.setAttribute('href', 'static/pages/portfolio/chess/chess.css');
        }
    });
    
    // Add hover effects
    card.addEventListener('mouseenter', () => {
        card.style.transform = 'translateY(-5px)';
    });
    
    card.addEventListener('mouseleave', () => {
        card.style.transform = 'translateY(0)';
    });
    
    return card;
}

// Initialize portfolio when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('content-container') && !document.querySelector('.portfolio-container')) {
        const portfolioContent = createPortfolioPage();
        const contentContainer = document.getElementById('content-container');
        contentContainer.innerHTML = '';
        contentContainer.appendChild(portfolioContent);
    }
});

// Handle HTMX afterSwap event for portfolio
document.body.addEventListener('htmx:afterSwap', function(evt) {
    const targetElement = evt.detail.target;
    if (targetElement.id === 'content-container' && evt.detail.xhr.responseURL.includes('portfolio.html')) {
        // Portfolio page was loaded, initialize it
        setTimeout(() => {
            if (!document.querySelector('.portfolio-container')) {
                const portfolioContent = createPortfolioPage();
                targetElement.appendChild(portfolioContent);
            }
        }, 50);
    }
});
