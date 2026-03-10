// app.js

// Assuming APP is defined in index.html
const app = window.APP;

// Function to render cards  
function renderCards(data) {
    const cardContainer = document.getElementById('card-container');
    cardContainer.innerHTML = '';
    data.forEach(cardData => {
        const card = createCard(cardData);
        cardContainer.appendChild(card);
    });
}

// Function to create a single card  
function createCard(data) {
    const card = document.createElement('div');
    card.classList.add('card');
    card.innerHTML = `
        <h2>${data.title}</h2>
        <p>${data.description}</p>
        <button class='expand'>Expand</button>
        <button class='copy'>Copy Prompt</button>
    `;

    card.querySelector('.expand').addEventListener('click', () => {
        card.classList.toggle('expanded');
        // Update display
    });

    card.querySelector('.copy').addEventListener('click', () => {
        navigator.clipboard.writeText(data.prompt);
        alert('Prompt copied to clipboard!');
    });

    return card;
}

// Function to handle navigation  
function handleNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const targetSection = event.target.getAttribute('href');
            navigateToSection(targetSection);
        });
    });
}

function navigateToSection(section) {
    const sections = document.querySelectorAll('.section');
    sections.forEach(sec => sec.style.display = 'none');
    document.querySelector(section).style.display = 'block';
}

// Function to save global inputs to local storage  
function saveToLocalStorage(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

// Initial setup function  
function init() {
    const globalInput = document.getElementById('global-input');
    globalInput.value = JSON.parse(localStorage.getItem('globalInput')) || '';
    globalInput.addEventListener('input', (event) => {
        saveToLocalStorage('globalInput', event.target.value);
    });
    handleNavigation();
}

document.addEventListener('DOMContentLoaded', async () => {
    // Load initial data
    const initialData = await fetch('/api/cards').then(res => res.json());
    renderCards(initialData);
    init();
});