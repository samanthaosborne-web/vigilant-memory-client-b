// Create an APP object to store data
const APP = {
    cards: [
        { title: 'Card 1', description: 'This is the first card.', prompt: 'Please enter your name.' },
        { title: 'Card 2', description: 'This is the second card.', prompt: 'What is your favorite color?' },
    ],
    currentCard: 0,
};

// Function to render a card
function renderCard() {
    const card = APP.cards[APP.currentCard];
    document.getElementById('card-title').innerText = card.title;
    document.getElementById('card-description').innerText = card.description;
    document.getElementById('card-prompt').innerText = card.prompt;
}

// Function to handle next card navigation
function handleNextCard() {
    if (APP.currentCard < APP.cards.length - 1) {
        APP.currentCard++;
        renderCard();
    } else {
        alert('You have reached the end of the cards.');
    }
}

// Function to handle previous card navigation
function handlePreviousCard() {
    if (APP.currentCard > 0) {
        APP.currentCard--;
        renderCard();
    } else {
        alert('You are at the first card.');
    }
}

// Function to manage user input
function handleInput() {
    const userInput = document.getElementById('user-input').value;
    console.log('User input:', userInput);
    // Additional logic for handling inputs can go here
}

// Function to initialize app
function init() {
    renderCard();
    document.getElementById('next-button').addEventListener('click', handleNextCard);
    document.getElementById('prev-button').addEventListener('click', handlePreviousCard);
    document.getElementById('user-input').addEventListener('input', handleInput);
}

// Call init function when the document is ready
document.addEventListener('DOMContentLoaded', init);