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
// app.js - Complete card rendering and interaction logic

(function () {
  const cardGrid = document.getElementById('cardGrid');
  const pageTitle = document.getElementById('pageTitle');
  const menuItems = document.querySelectorAll('.menu-item');
  const menuPanel = document.getElementById('menuPanel');
  const menuBackdrop = document.getElementById('menuBackdrop');
  const menuBtn = document.getElementById('menuBtn');

  let currentCategory = 'Winning Work';

  // Render cards for the current category
  function renderCards() {
    cardGrid.innerHTML = '';
    const categoryData = window.APP[currentCategory];
    
    if (!categoryData) return;

    pageTitle.textContent = categoryData.title;

    categoryData.cards.forEach((card, index) => {
      const cardEl = document.createElement('div');
      cardEl.className = 'card';
      cardEl.innerHTML = `
        <div class="card-head">
          <h3>${card.subtitle}</h3>
          <div class="kv">
            ${Object.entries(card.front || {})
              .map(([key, value]) => `
                <div class="row">
                  <div class="label">${key}:</div>
                  <div>${value}</div>
                </div>
              `)
              .join('')}
          </div>
          <button class="reveal-btn">Show Details</button>
        </div>
        <div class="card-body">
          <div class="ui-block">
            <div class="ui-title">Quick Inputs</div>
            ${(card.ui?.quickInputs || [])
              .map((input, idx) => `
                <div style="margin-bottom: 12px;">
                  <div style="font-size: 12px; font-weight: 600; margin-bottom: 6px;">${input.label}</div>
                  <div class="chips">
                    ${input.options.map(opt => `
                      <label class="chip-label">
                        <input type="radio" name="input-${index}-${idx}" value="${opt}">
                        <span>${opt}</span>
                      </label>
                    `).join('')}
                  </div>
                </div>
              `).join('')}
          </div>
          
          <div class="ui-block">
            <div class="ui-title">Custom Fields</div>
            <div class="fields">
              ${(card.ui?.fields || [])
                .map((field, idx) => `
                  <input type="text" class="type-input" placeholder="${field}" data-field="${idx}">
                `).join('')}
            </div>
          </div>

          <div class="ui-block">
            <div class="ui-title">Prompt</div>
            ${(card.prompts || [])
              .map((prompt, idx) => `
                <div class="prompt-block">
                  <div class="prompt-text">${prompt}</div>
                  <div class="copy-row">
                    <button class="copy-btn" data-prompt-index="${idx}">📋 Copy Prompt</button>
                  </div>
                </div>
              `).join('')}
          </div>
        </div>
      `;

      // Handle card expansion
      const cardHead = cardEl.querySelector('.card-head');
      const revealBtn = cardEl.querySelector('.reveal-btn');
      
      cardHead.addEventListener('click', () => {
        cardEl.classList.toggle('open');
        revealBtn.textContent = cardEl.classList.contains('open') ? 'Hide Details' : 'Show Details';
      });

      // Handle copy prompts
      cardEl.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const promptIndex = parseInt(btn.dataset.promptIndex);
          const promptText = card.prompts[promptIndex];
          navigator.clipboard.writeText(promptText).then(() => {
            const originalText = btn.textContent;
            btn.textContent = '✅ Copied!';
            setTimeout(() => {
              btn.textContent = originalText;
            }, 2000);
          });
        });
      });

      cardGrid.appendChild(cardEl);
    });
  }

  // Handle menu item clicks
  menuItems.forEach(item => {
    item.addEventListener('click', () => {
      const key = item.dataset.key;
      if (key && window.APP[key]) {
        currentCategory = key;
        
        // Update active state
        menuItems.forEach(m => m.classList.remove('active'));
        item.classList.add('active');
        
        // Close menu
        menuPanel.classList.remove('open');
        menuBackdrop.classList.remove('open');
        menuBtn.setAttribute('aria-expanded', 'false');
        menuPanel.setAttribute('aria-hidden', 'true');
        
        // Render new cards
        renderCards();
        
        // Scroll to top
        window.scrollTo(0, 0);
      }
    });
  });

  // Handle menu button
  menuBtn.addEventListener('click', () => {
    const isOpen = menuPanel.classList.contains('open');
    menuPanel.classList.toggle('open');
    menuBackdrop.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', !isOpen);
    menuPanel.setAttribute('aria-hidden', isOpen);
  });

  // Close menu on backdrop click
  menuBackdrop.addEventListener('click', () => {
    menuPanel.classList.remove('open');
    menuBackdrop.classList.remove('open');
    menuBtn.setAttribute('aria-expanded', 'false');
    menuPanel.setAttribute('aria-hidden', 'true');
  });

  // Handle logout buttons
  const logoutBtn = document.getElementById('logoutBtn');
  const footerLogoutBtn = document.getElementById('footerLogoutBtn');
  
  [logoutBtn, footerLogoutBtn].forEach(btn => {
    if (btn) {
      btn.addEventListener('click', async () => {
        if (window.__supabase) {
          await window.__supabase.auth.signOut();
          window.location.replace('./login.html');
        }
      });
    }
  });

  // Handle global inputs
  const globalFirstName = document.getElementById('globalFirstName');
  const globalBizName = document.getElementById('globalBizName');
  const resetDefaultsBtn = document.getElementById('resetDefaultsBtn');

  // Load saved values
  if (globalFirstName) globalFirstName.value = localStorage.getItem('globalFirstName') || '';
  if (globalBizName) globalBizName.value = localStorage.getItem('globalBizName') || '';

  // Save values on input
  if (globalFirstName) {
    globalFirstName.addEventListener('input', (e) => {
      localStorage.setItem('globalFirstName', e.target.value);
    });
  }
  if (globalBizName) {
    globalBizName.addEventListener('input', (e) => {
      localStorage.setItem('globalBizName', e.target.value);
    });
  }

  // Reset defaults
  if (resetDefaultsBtn) {
    resetDefaultsBtn.addEventListener('click', () => {
      localStorage.removeItem('globalFirstName');
      localStorage.removeItem('globalBizName');
      if (globalFirstName) globalFirstName.value = '';
      if (globalBizName) globalBizName.value = '';
    });
  }

  // Initial render
  renderCards();
})();
