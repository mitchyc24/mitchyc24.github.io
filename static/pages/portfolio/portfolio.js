// Portfolio data for future use
const portfolioProjects = [
    {
        id: 'chess',
        title: 'Chess Game',
        description: 'A fully functional chess game built with vanilla JavaScript. Features include move validation, check detection, and game state management.',
        image: 'static/pages/portfolio/chess/images/chess-preview.png',
        tags: ['JavaScript', 'Game Development', 'Logic'],
        link: 'static/pages/portfolio/chess/chess.html',
        css: 'static/pages/portfolio/chess/chess.css'
    },
    {
        id: 'epic-earth',
        title: 'EPIC Earth',
        description: 'A web-based application that visualizes Earth from Lagrange point 1',
        image: 'static/pages/portfolio/epic-earth/images/epic-earth-preview.png',
        tags: ['Data Visualization', 'Environmental Science', '🌍'],
        link: 'static/pages/portfolio/epic-earth/epic-earth.html',
        css: 'static/pages/portfolio/epic-earth/epic-earth.css'
    }
    // Add more projects here in the future
];

// Build quick lookup
const projectMap = portfolioProjects.reduce((m,p) => { m[p.id] = p; return m; }, {});

// Delegated click handler
document.addEventListener('click', (e) => {
    const card = e.target.closest('.project-card');
    if (!card) return;

    const projectId = card.dataset.projectId;
    const project = projectMap[projectId];
    if (!project) return;

    htmx.ajax('GET', project.link, { target: '#content-container' });

    const pageStyle = document.getElementById('page-styles');
    if (pageStyle) pageStyle.setAttribute('href', project.css);
});

// Optional hover (still needs delegation for dynamic nodes)
document.addEventListener('pointerenter', (e) => {
    const card = e.target.closest('.project-card');
    if (card) card.style.transform = 'translateY(-5px)';
}, true);

document.addEventListener('pointerleave', (e) => {
    const card = e.target.closest('.project-card');
    if (card) card.style.transform = 'translateY(0)';
}, true);
