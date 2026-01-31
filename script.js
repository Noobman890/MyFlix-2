// script.js
import CONFIG from './config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- FIREBASE SETUP ---
const firebaseConfig = {
    apiKey: "AIzaSyBRCZ76Axl5mk5ajLvEXIdtbP9VD4Ni0nQ",
    authDomain: "myflix-a64b4.firebaseapp.com",
    projectId: "myflix-a64b4",
    storageBucket: "myflix-a64b4.firebasestorage.app",
    messagingSenderId: "101704238237",
    appId: "1:101704238237:web:6666079060abef8fc8c074"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- APP STATE ---
let featuredMovie = null;
let searchTimeout;

// --- WATCHLIST FUNCTIONALITY ---
let currentUser = null;
let userWatchlist = []; // Global source of truth for UI

// Initialize watchlist (from local storage initially)
function initWatchlist() {
    const local = localStorage.getItem('watchlist');
    if (local) {
        userWatchlist = JSON.parse(local);
    } else {
        userWatchlist = [];
        localStorage.setItem('watchlist', JSON.stringify([]));
    }
}

// Get current watchlist (Synchronous for UI speed)
function getWatchlist() {
    return userWatchlist;
}

// Check if item is in watchlist
function isInWatchlist(itemId, itemType) {
    return userWatchlist.some(item => item.id == itemId && item.type === itemType);
}

// Add item to watchlist
async function addToWatchlist(item) {
    // 1. Optimistic Update (UI first)
    if (isInWatchlist(item.id, item.type)) return false;

    userWatchlist.push(item);

    // 2. Persist
    if (currentUser) {
        // Logged In: Save to Firestore
        try {
            const userRef = doc(db, "users", currentUser.uid);
            await updateDoc(userRef, {
                watchlist: arrayUnion(item)
            });
        } catch (e) {
            console.error("Error adding to Firestore, trying setDoc...", e);
            // If doc doesn't exist, create it
            const userRef = doc(db, "users", currentUser.uid);
            await setDoc(userRef, { watchlist: userWatchlist }, { merge: true });
        }
    } else {
        // Guest: Save to LocalStorage
        localStorage.setItem('watchlist', JSON.stringify(userWatchlist));
    }
    return true;
}

// Remove item from watchlist
async function removeFromWatchlist(itemId, itemType) {
    const initialLength = userWatchlist.length;
    const itemToRemove = userWatchlist.find(item => item.id == itemId && item.type === itemType);

    if (!itemToRemove) return false;

    // 1. Optimistic Update
    userWatchlist = userWatchlist.filter(item => !(item.id == itemId && item.type === itemType));

    // 2. Persist
    if (currentUser) {
        try {
            const userRef = doc(db, "users", currentUser.uid);
            await updateDoc(userRef, {
                watchlist: arrayRemove(itemToRemove)
            });
        } catch (e) {
            console.error("Error removing from Firestore:", e);
        }
    } else {
        localStorage.setItem('watchlist', JSON.stringify(userWatchlist));
    }

    return true;
}

// Toggle watchlist status
async function toggleWatchlist(item) {
    if (isInWatchlist(item.id, item.type)) {
        await removeFromWatchlist(item.id, item.type);
        return { success: true, action: 'removed' };
    } else {
        await addToWatchlist(item);
        return { success: true, action: 'added' };
    }
}

// Load watchlist page
async function loadWatchlistPage() {
    const watchlist = getWatchlist();
    const watchlistGrid = document.getElementById('explore-grid'); // Changed to standard grid ID
    const watchlistEmpty = document.getElementById('watchlist-empty');
    const watchlistFilterBar = document.getElementById('watchlist-filter-bar');

    if (watchlist.length === 0) {
        if (watchlistGrid) watchlistGrid.innerHTML = '';
        if (watchlistEmpty) watchlistEmpty.style.display = 'block';
        if (watchlistFilterBar) watchlistFilterBar.style.display = 'none';
        return;
    } else {
        if (watchlistGrid) watchlistGrid.style.display = 'grid';
        if (watchlistEmpty) watchlistEmpty.style.display = 'none';
        if (watchlistFilterBar) watchlistFilterBar.style.display = 'flex';
        watchlistGrid.innerHTML = '';
    }

    // Fetch details for each watchlist item
    for (const item of watchlist) {
        try {
            const res = await fetch(`${CONFIG.BASE_URL}/${item.type}/${item.id}?api_key=${CONFIG.API_KEY}`);
            const data = await res.json();

            const card = document.createElement('div');
            card.className = 'card'; // Standard card class

            const year = (data.release_date || data.first_air_date || "N/A").split('-')[0];
            const rating = data.vote_average ? data.vote_average.toFixed(1) : "N/A";
            const lang = (data.original_language || "en").toUpperCase();

            card.innerHTML = `
                <div class="card-img-container">
                    <img src="${CONFIG.IMG_URL_SMALL + data.poster_path}" alt="${data.title || data.name}" loading="lazy">
                    <button class="watchlist-remove-btn" onclick="removeWatchlistItem(${item.id}, '${item.type}', event)" title="Remove from Watchlist">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
                <div class="card-info">
                    <h4 class="card-title">${data.title || data.name}</h4>
                    <div class="card-meta">
                        <span class="rating-badge">${rating}</span>
                        <span class="card-year">${year}</span>
                        <span class="lang-badge-small">${lang}</span>
                        <span style="border: 1px solid #666; padding: 0 4px; border-radius: 2px; font-size: 9px;">${item.type.toUpperCase()}</span>
                    </div>
                </div>
            `;

            // Add click handler to navigate to details page
            card.onclick = (e) => {
                if (!e.target.closest('.watchlist-remove-btn')) {
                    window.location.href = `details.html?id=${item.id}&type=${item.type}`;
                }
            };

            watchlistGrid.appendChild(card);
        } catch (error) {
            console.error(`Error loading watchlist item ${item.id}:`, error);
        }
    }
}

// Remove watchlist item from UI
window.removeWatchlistItem = function (itemId, itemType, event) {
    event.stopPropagation();
    removeFromWatchlist(itemId, itemType);
    loadWatchlistPage(); // Refresh the watchlist
};

// Filter watchlist
window.filterWatchlist = function () {
    const typeFilter = document.getElementById('watchlist-type-filter').value;
    const sortFilter = document.getElementById('watchlist-sort-filter').value;
    const watchlist = getWatchlist();
    const watchlistGrid = document.getElementById('explore-grid');

    // Filter by type
    let filteredItems = watchlist;
    if (typeFilter !== 'all') {
        filteredItems = watchlist.filter(item => item.type === typeFilter);
    }

    // Sort items
    switch (sortFilter) {
        case 'added':
            // Keep original order (recently added)
            break;
        case 'popularity':
            filteredItems.sort((a, b) => b.popularity - a.popularity);
            break;
        case 'rating':
            filteredItems.sort((a, b) => b.vote_average - a.vote_average);
            break;
        case 'title':
            filteredItems.sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name));
            break;
    }

    // Display filtered items
    displayFilteredWatchlist(filteredItems);
};

async function displayFilteredWatchlist(items) {
    const watchlistGrid = document.getElementById('explore-grid'); // Use standard grid
    watchlistGrid.innerHTML = '';

    for (const item of items) {
        try {
            const res = await fetch(`${CONFIG.BASE_URL}/${item.type}/${item.id}?api_key=${CONFIG.API_KEY}`);
            const data = await res.json();

            const card = document.createElement('div');
            card.className = 'card'; // Standard card class

            const year = (data.release_date || data.first_air_date || "N/A").split('-')[0];
            const rating = data.vote_average ? data.vote_average.toFixed(1) : "N/A";
            const lang = (data.original_language || "en").toUpperCase();

            card.innerHTML = `
                <div class="card-img-container">
                    <img src="${CONFIG.IMG_URL_SMALL + data.poster_path}" alt="${data.title || data.name}" loading="lazy">
                    <button class="watchlist-remove-btn" onclick="removeWatchlistItem(${item.id}, '${item.type}', event)" title="Remove from Watchlist">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
                <div class="card-info">
                    <h4 class="card-title">${data.title || data.name}</h4>
                    <div class="card-meta">
                        <span class="rating-badge">${rating}</span>
                        <span class="card-year">${year}</span>
                        <span class="lang-badge-small">${lang}</span>
                        <span style="border: 1px solid #666; padding: 0 4px; border-radius: 2px; font-size: 9px;">${item.type.toUpperCase()}</span>
                    </div>
                </div>
            `;

            // Add click handler to navigate to details page
            card.onclick = (e) => {
                if (!e.target.closest('.watchlist-remove-btn')) {
                    window.location.href = `details.html?id=${item.id}&type=${item.type}`;
                }
            };

            watchlistGrid.appendChild(card);
        } catch (error) {
            console.error(`Error loading watchlist item ${item.id}:`, error);
        }
    }
}

// Add to watchlist from details page
// Add to watchlist from details page
window.addToWatchlistFromDetails = async function () {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const type = params.get('type') || 'movie';

    if (!id) return;

    const item = { id, type };
    const result = await toggleWatchlist(item);

    const watchlistBtn = document.getElementById('watchlist-btn');
    if (watchlistBtn) {
        if (result.action === 'added') {
            watchlistBtn.innerHTML = '<i class="fa-solid fa-check"></i> Added to Watchlist';
            watchlistBtn.classList.add('added');
        } else {
            watchlistBtn.innerHTML = '<i class="fa-solid fa-bookmark"></i> Add to Watchlist';
            watchlistBtn.classList.remove('added');
        }
    }
};

// Check watchlist status on details page load
async function checkWatchlistStatus() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const type = params.get('type') || 'movie';

    if (!id) return;

    const watchlistBtn = document.getElementById('watchlist-btn');
    if (watchlistBtn) {
        if (isInWatchlist(id, type)) {
            watchlistBtn.innerHTML = '<i class="fa-solid fa-check"></i> Added to Watchlist';
            watchlistBtn.classList.add('added');
        } else {
            watchlistBtn.innerHTML = '<i class="fa-solid fa-bookmark"></i> Add to Watchlist';
            watchlistBtn.classList.remove('added');
        }
    }
}

// --- MAIN INIT ---
async function startApp() {
    // Initialize watchlist
    initWatchlist();

    // Check if we are on watchlist page
    if (window.location.pathname.includes('watchlist.html')) {
        loadWatchlistPage();
        return;
    }

    // Check if we are on details page
    if (window.location.pathname.includes('details.html')) {
        loadDetailsPage();
        // Add watchlist button to details page
        setTimeout(() => {
            addWatchlistButtonToDetails();
            checkWatchlistStatus();
        }, 1000);
        return;
    }

    try {
        await Promise.all([
            loadHero(),
            loadRow('now_playing', 'new-releases-row'),
            loadRow('popular', 'movie-row'),
            loadTVRow('on_the_air', 'new-tv-row'),
            loadTVRow('top_rated', 'tv-row'),
            loadCombinedLanguageRow('ko', 'korean-combined-row'),
            loadCombinedLanguageRow('zh', 'chinese-combined-row'),
        ]);
        console.log("App Started Successfully");
    } catch (error) {
        console.error("Error starting app:", error);
    }
}

// Add watchlist button to details page
function addWatchlistButtonToDetails() {
    const detailsActions = document.querySelector('.details-actions');
    if (!detailsActions) return;

    const watchlistBtn = document.createElement('button');
    watchlistBtn.id = 'watchlist-btn';
    watchlistBtn.className = 'btn btn-secondary';
    watchlistBtn.onclick = addToWatchlistFromDetails;

    // Initial state
    watchlistBtn.innerHTML = '<i class="fa-solid fa-bookmark"></i> Add to Watchlist';

    detailsActions.appendChild(watchlistBtn);

    // Add some styling for the added state
    const style = document.createElement('style');
    style.textContent = `
        #watchlist-btn.added {
            background: #46d369 !important;
            color: black !important;
            border: 1px solid rgba(70, 211, 105, 0.3) !important;
        }
        #watchlist-btn.added:hover {
            background: #3bb35a !important;
            transform: translateY(-5px);
        }
    `;
    document.head.appendChild(style);
}

// --- HERO SECTION (Dynamic Slider) ---
let heroItems = [];
let currentHeroIndex = 0;
let heroTimer;

async function loadHero() {
    try {
        // Fetch trending movies and tv shows separately for a balanced mix
        const [movieRes, tvRes] = await Promise.all([
            fetch(`${CONFIG.BASE_URL}/trending/movie/day?api_key=${CONFIG.API_KEY}`),
            fetch(`${CONFIG.BASE_URL}/trending/tv/day?api_key=${CONFIG.API_KEY}`)
        ]);

        const movieData = await movieRes.json();
        const tvData = await tvRes.json();

        // Take 4 of each with backdrops
        const movies = movieData.results.filter(m => m.backdrop_path).slice(0, 4).map(m => ({ ...m, media_type: 'movie' }));
        const shows = tvData.results.filter(s => s.backdrop_path).slice(0, 4).map(s => ({ ...s, media_type: 'tv' }));

        // Interleave: Movie, Show, Movie, Show...
        heroItems = [];
        for (let i = 0; i < 4; i++) {
            if (movies[i]) heroItems.push(movies[i]);
            if (shows[i]) heroItems.push(shows[i]);
        }

        displayHero(0);
        setupHeroIndicators();
        setupHeroSwipes(); // Enable mobile swipe gestures
        startHeroTimer();
    } catch (error) {
        console.error("Error loading hero:", error);
    }
}

// Enable Swipe for Mobile
function setupHeroSwipes() {
    const hero = document.querySelector('.hero-container');
    let touchStartX = 0;
    let touchEndX = 0;

    hero.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    hero.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    }, { passive: true });

    function handleSwipe() {
        const threshold = 50; // Minimum distance for swipe
        let nextIndex;

        if (touchEndX < touchStartX - threshold) {
            // Swipe Left -> Next Movie
            nextIndex = (currentHeroIndex + 1) % heroItems.length;
            displayHero(nextIndex);
            resetHeroTimer();
        } else if (touchEndX > touchStartX + threshold) {
            // Swipe Right -> Previous Movie
            nextIndex = (currentHeroIndex - 1 + heroItems.length) % heroItems.length;
            displayHero(nextIndex);
            resetHeroTimer();
        }
    }
}

function displayHero(index) {
    const item = heroItems[index];
    if (!item) return;

    currentHeroIndex = index;
    featuredMovie = item;

    // 1. Background Image with Premium Fade & Shutter Animation
    const bgContainer = document.getElementById('hero-bg');
    const existingImg = bgContainer.querySelector('img');

    // Trigger shutter effect class for mobile animation
    bgContainer.classList.add('changing');

    const newImg = document.createElement('img');
    newImg.src = CONFIG.IMG_URL + item.backdrop_path;
    newImg.style.opacity = '0';
    newImg.style.transition = 'opacity 1.2s cubic-bezier(0.4, 0, 0.2, 1)';

    newImg.onload = () => {
        if (existingImg) {
            existingImg.style.opacity = '0';
            setTimeout(() => {
                bgContainer.innerHTML = '';
                bgContainer.appendChild(newImg);
                requestAnimationFrame(() => {
                    newImg.style.opacity = '1';
                    // Remove changing class after transition completes
                    setTimeout(() => bgContainer.classList.remove('changing'), 1200);
                });
            }, 1000); // Slightly longer wait for old image to exit
        } else {
            bgContainer.innerHTML = '';
            bgContainer.appendChild(newImg);
            requestAnimationFrame(() => {
                newImg.style.opacity = '1';
                setTimeout(() => bgContainer.classList.remove('changing'), 500);
            });
        }
    };

    // 2. Text Content with Animations
    const titleEl = document.getElementById('hero-title');
    const descEl = document.getElementById('hero-desc');
    const badgeEl = document.getElementById('hero-badge');
    const typeBadge = document.getElementById('hero-type-badge');
    const langBadge = document.getElementById('hero-lang-badge');
    const ratingBadge = document.getElementById('hero-rating-badge');

    // Trigger reset of animations
    [titleEl, descEl, badgeEl, typeBadge, ratingBadge, langBadge].forEach(el => {
        if (!el) return;
        el.style.animation = 'none';
        el.offsetHeight; // force reflow
        el.style.animation = null;
    });

    titleEl.innerText = item.title || item.name;
    descEl.innerText = item.overview;

    // Global Rating
    if (ratingBadge) {
        const rating = item.vote_average ? item.vote_average.toFixed(1) : "N/A";
        ratingBadge.innerHTML = `<i class="fa-solid fa-star" style="color: #46d369;"></i> ${rating} Rating`;
    }

    // Professional Editorial Tags instead of strange numbers
    const taglines = [
        "WORLDWIDE TOP PICK",
        "CRITICS' SELECTION",
        "MUST-WATCH TODAY",
        "AUDIENCE FAVORITE",
        "TOP TRENDING",
        "EDITOR'S CHOICE",
        "HIGHLY ACCLAIMED",
        "GLOBAL HIT"
    ];

    const tagline = taglines[index] || "TOP SELECTION";

    if (index === 0) {
        badgeEl.innerHTML = `<i class="fa-solid fa-crown"></i> ${tagline}`;
        badgeEl.classList.add('premium');
        badgeEl.style.background = ''; // Clear previous inline styles
        badgeEl.style.borderColor = '';
    } else {
        badgeEl.innerHTML = `<i class="fa-solid fa-fire"></i> ${tagline}`;
        badgeEl.classList.remove('premium');
        badgeEl.style.background = '';
        badgeEl.style.borderColor = '';
    }

    // Media Type Badge
    if (typeBadge) {
        typeBadge.innerHTML = item.media_type === 'movie' ?
            `<i class="fa-solid fa-film"></i> Movie` :
            `<i class="fa-solid fa-tv"></i> TV Series`;
    }

    // Language Badge
    if (langBadge) {
        const langCode = (item.original_language || "en").toUpperCase();
        langBadge.innerHTML = `<i class="fa-solid fa-globe"></i> ${langCode}`;
    }

    // 3. Update Indicators
    const indicators = document.querySelectorAll('.indicator');
    indicators.forEach((ind, i) => {
        ind.classList.toggle('active', i === index);
    });

    // 4. Buttons
    document.getElementById('hero-play-btn').onclick = () => playMedia(item.id, item.media_type);
    document.getElementById('hero-info-btn').onclick = () => window.location.href = `details.html?id=${item.id}&type=${item.media_type}`;
}

function setupHeroIndicators() {
    const container = document.getElementById('hero-indicators');
    container.innerHTML = '';
    heroItems.forEach((_, i) => {
        const dot = document.createElement('div');
        dot.className = `indicator ${i === 0 ? 'active' : ''}`;
        dot.onclick = () => {
            displayHero(i);
            resetHeroTimer();
        };
        container.appendChild(dot);
    });
}

function startHeroTimer() {
    heroTimer = setInterval(() => {
        let nextIndex = (currentHeroIndex + 1) % heroItems.length;
        displayHero(nextIndex);
    }, 8000); // Switch every 8 seconds
}

function resetHeroTimer() {
    clearInterval(heroTimer);
    startHeroTimer();
}

// --- ROW LOADERS ---
async function loadRow(category, elementId) {
    const res = await fetch(`${CONFIG.BASE_URL}/movie/${category}?api_key=${CONFIG.API_KEY}`);
    const data = await res.json();
    fillShelf(data.results, elementId, 'movie');
}

async function loadTVRow(category, elementId) {
    const res = await fetch(`${CONFIG.BASE_URL}/tv/${category}?api_key=${CONFIG.API_KEY}`);
    const data = await res.json();
    fillShelf(data.results, elementId, 'tv');
}

async function loadCombinedLanguageRow(lang, elementId) {
    try {
        const [movieRes, tvRes] = await Promise.all([
            fetch(`${CONFIG.BASE_URL}/discover/movie?api_key=${CONFIG.API_KEY}&with_original_language=${lang}&sort_by=popularity.desc`),
            fetch(`${CONFIG.BASE_URL}/discover/tv?api_key=${CONFIG.API_KEY}&with_original_language=${lang}&sort_by=popularity.desc`)
        ]);

        const movieData = await movieRes.json();
        const tvData = await tvRes.json();

        // Inject media_type and merge
        const movies = movieData.results.map(m => ({ ...m, media_type: 'movie' }));
        const shows = tvData.results.map(s => ({ ...s, media_type: 'tv' }));

        const combined = [...movies, ...shows].sort((a, b) => b.popularity - a.popularity);

        fillShelf(combined, elementId);
    } catch (error) {
        console.error(`Error loading combined ${lang}:`, error);
    }
}

function fillShelf(items, shelfId, defaultType) {
    const shelf = document.getElementById(shelfId);
    shelf.innerHTML = '';

    items.forEach(item => {
        const type = item.media_type || defaultType || 'movie';
        const title = item.title || item.name;
        const year = (item.release_date || item.first_air_date || "N/A").split('-')[0];
        const rating = item.vote_average ? item.vote_average.toFixed(1) : "N/A";
        const lang = (item.original_language || "en").toUpperCase();

        const card = document.createElement('div');
        card.className = 'card';
        card.onclick = () => window.location.href = `details.html?id=${item.id}&type=${type}`;

        card.innerHTML = `
            <div class="card-img-container">
                <img src="${CONFIG.IMG_URL_SMALL + item.poster_path}" alt="${title}" loading="lazy">
            </div>
            <div class="card-info">
                <h4 class="card-title">${title}</h4>
                <div class="card-meta">
                    <span class="rating-badge">${rating}</span>
                    <span class="card-year">${year}</span>
                    <span class="lang-badge-small">${lang}</span>
                    <span style="border: 1px solid #666; padding: 0 4px; border-radius: 2px; font-size: 9px;">HD</span>
                </div>
            </div>
        `;
        shelf.appendChild(card);
    });
}

// --- GLOBAL UTILS ---
window.playMedia = async function (id, type, season = 1, episode = 1) {
    // Add to history first (if possible)
    try {
        // Fetch basic details to store in history object
        // Note: For speed we might want to store more data initially, but fetching here ensures we have the title/poster
        const res = await fetch(`${CONFIG.BASE_URL}/${type}/${id}?api_key=${CONFIG.API_KEY}`);
        const data = await res.json();

        const item = {
            id: data.id,
            title: data.title || data.name,
            poster_path: data.poster_path, // Could be null
            vote_average: data.vote_average,
            release_date: data.release_date || data.first_air_date,
            media_type: type
        };

        await addToHistory(item);

    } catch (e) {
        console.error("Error adding to history:", e);
    }

    // Redirect to dedicated player page
    window.location.href = `player.html?id=${id}&type=${type}&season=${season}&episode=${episode}`;
}



window.searchMovies = async function () {
    const term = document.getElementById('movie-search').value.trim();
    const dropdown = document.getElementById('search-dropdown');

    clearTimeout(searchTimeout);

    if (term.length < 2) {
        dropdown.style.display = 'none';
        return;
    }

    // Debounce for better performance
    searchTimeout = setTimeout(async () => {
        try {
            const res = await fetch(`${CONFIG.BASE_URL}/search/multi?api_key=${CONFIG.API_KEY}&query=${encodeURIComponent(term)}`);
            const data = await res.json();
            displaySearchDropdown(data.results);
        } catch (error) {
            console.error("Search error:", error);
        }
    }, 300);
}

function displaySearchDropdown(items) {
    const dropdown = document.getElementById('search-dropdown');
    dropdown.innerHTML = '';
    dropdown.style.display = 'flex';

    // Filter results to show only movies/TV with posters
    const validItems = items.filter(item => item.media_type !== 'person' && item.poster_path).slice(0, 8);

    if (validItems.length === 0) {
        dropdown.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">No results found</div>';
        return;
    }

    validItems.forEach(item => {
        const title = item.title || item.name;
        const year = (item.release_date || item.first_air_date || "N/A").split('-')[0];
        const rating = item.vote_average ? item.vote_average.toFixed(1) : "N/A";
        const img = item.poster_path ? CONFIG.IMG_URL_SMALL + item.poster_path : 'https://via.placeholder.com/45x65?text=No+Img';

        const itemEl = document.createElement('div');
        itemEl.className = 'search-item';
        itemEl.onclick = () => {
            window.location.href = `details.html?id=${item.id}&type=${item.media_type}`;
            dropdown.style.display = 'none';
        };

        itemEl.innerHTML = `
            <img src="${img}" alt="${title}">
            <div class="search-item-info">
                <div class="search-item-title">${title}</div>
                <div class="search-item-meta">
                    <span class="search-item-rating"><i class="fa-solid fa-star" style="font-size: 10px; color: #46d369;"></i> ${rating}</span>
                    <span>${year}</span>
                    <span style="border: 1px solid #444; padding: 0 4px; border-radius: 2px; font-size: 10px;">${item.media_type.toUpperCase()}</span>
                </div>
            </div>
        `;
        dropdown.appendChild(itemEl);
    });
}

// Close search dropdown when clicking outside
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('search-dropdown');
    const searchBox = document.getElementById('searchBox');
    if (dropdown && !searchBox.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});

window.clearSearch = function () {
    document.getElementById('movie-search').value = '';
    const dropdown = document.getElementById('search-dropdown');
    if (dropdown) dropdown.style.display = 'none';
}

window.focusSearch = function () {
    document.getElementById('movie-search').focus();
}

// --- AUTH UI UPDATES ---
onAuthStateChanged(auth, async (user) => {
    const profileBtn = document.getElementById('user-profile-btn');
    const loginIcon = document.getElementById('logged-out-icon');
    const avatarContainer = document.getElementById('avatar-container');
    const avatarImg = document.getElementById('logged-in-avatar');

    currentUser = user; // Update global user

    if (user) {
        // Logged In
        loginIcon.style.display = "none";
        avatarContainer.style.display = "block";
        profileBtn.classList.add('logged-in');

        // Avatar
        const uniqueAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`;
        avatarImg.src = user.photoURL || uniqueAvatar;

        // --- SYNC WATCHLIST ---
        try {
            const userRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(userRef);

            if (docSnap.exists()) {
                // Merge cloud data with any local (guest) data
                const cloudWatchlist = docSnap.data().watchlist || [];

                // Identify items currently in local that aren't in cloud (newly added while guest)
                // Note: userWatchlist currently holds local storage data from initWatchlist()
                const localOnly = userWatchlist.filter(localItem =>
                    !cloudWatchlist.some(cloudItem => cloudItem.id == localItem.id && cloudItem.type === localItem.type)
                );

                if (localOnly.length > 0) {
                    console.log("Merging local items to cloud...", localOnly);
                    // Add local items to cloud
                    await updateDoc(userRef, {
                        watchlist: arrayUnion(...localOnly)
                    });
                    // Final list is cloud + local
                    // Final list is cloud + local
                    userWatchlist = [...cloudWatchlist, ...localOnly];
                } else {
                    userWatchlist = cloudWatchlist;
                }
            } else {
                // First login, create user doc with local data if any
                await setDoc(userRef, {
                    watchlist: userWatchlist,
                    continueWatching: []
                }, { merge: true });
            }

            // Sync Continue Watching
            loadContinueWatching(user.uid);

        } catch (error) {
            console.error("Error syncing data:", error);
        }

        // Logout Handler
        profileBtn.onclick = () => {
            if (confirm(`Logout from ${user.email}?`)) {
                signOut(auth).then(() => {
                    userWatchlist = []; // Clear sensitive data
                    localStorage.removeItem('watchlist'); // Optional clean
                    window.location.reload();
                });
            }
        };

    } else {
        // Logged Out
        loginIcon.style.display = "block";
        avatarContainer.style.display = "none";
        profileBtn.classList.remove('logged-in');

        // Login Handler
        profileBtn.onclick = () => window.location.href = 'auth.html';


        // Hide Continue Watching
        const cwContainer = document.getElementById('continue-watching-container');
        const cwSeparator = document.getElementById('continue-watching-separator');
        if (cwContainer) cwContainer.style.display = 'none';
        if (cwSeparator) cwSeparator.style.display = 'none';

        // Revert to local storage watchlist
        initWatchlist();
    }

    // Update UI
    if (window.location.pathname.includes('watchlist.html')) {
        loadWatchlistPage();
    } else {
        checkWatchlistStatus(); // Update buttons if on details page
    }
});

// --- CONTINUE WATCHING LOGIC ---
async function loadContinueWatching(uid) {
    if (!uid) return;

    console.log("[DEBUG] Loading Continue Watching for:", uid);

    try {
        const userRef = doc(db, "users", uid);
        const docSnap = await getDoc(userRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            console.log("[DEBUG] User Data:", data);

            if (data.continueWatching) {
                const history = data.continueWatching;
                console.log("[DEBUG] History found, length:", history.length);

                if (history.length > 0) {
                    // Show Container
                    const container = document.getElementById('continue-watching-container');
                    const separator = document.getElementById('continue-watching-separator');

                    if (container) {
                        container.style.display = 'block';
                        console.log("[DEBUG] Container set to block");
                    } else {
                        console.error("[DEBUG] Container element NOT found");
                    }

                    if (separator) separator.style.display = 'block';

                    // Render
                    fillShelf(history, 'continue-watching-row', 'movie');
                } else {
                    console.log("[DEBUG] History is empty");
                }
            } else {
                console.log("[DEBUG] No continueWatching field");
            }
        } else {
            console.log("[DEBUG] User doc does not exist");
        }
    } catch (e) {
        console.error("[DEBUG] Error loading history:", e);
    }
}

async function addToHistory(item) {
    if (!currentUser) {
        console.log("[DEBUG] addToHistory skipped: No user logged in");
        return;
    }

    console.log("[DEBUG] addToHistory called for:", item.title);

    try {
        const userRef = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(userRef);

        let currentHistory = [];
        if (docSnap.exists()) {
            currentHistory = docSnap.data().continueWatching || [];
        }

        // Remove if exists (to move to front)
        const filteredHistory = currentHistory.filter(h => !(h.id == item.id && h.type === item.type));

        // Add to front with new timestamp
        const newItem = {
            ...item,
            lastWatched: Date.now()
        };

        const newHistory = [newItem, ...filteredHistory].slice(0, 20); // Keep last 20

        await updateDoc(userRef, {
            continueWatching: newHistory
        });
        console.log("[DEBUG] Firestore updated with new history");

        // Refresh UI if on home
        if (window.location.pathname.includes('index.html')) {
            loadContinueWatching(currentUser.uid);
        }

    } catch (e) {
        console.error("[DEBUG] Error updating history:", e);
    }
}



// --- DETAILS PAGE LOGIC ---
async function loadDetailsPage() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const type = params.get('type') || 'movie';

    if (!id) return;

    try {
        const res = await fetch(`${CONFIG.BASE_URL}/${type}/${id}?api_key=${CONFIG.API_KEY}&append_to_response=credits,recommendations,similar,external_ids`);
        const data = await res.json();

        // 1. Hero & Meta
        document.title = `${data.title || data.name} | MyFlix`;
        document.getElementById('details-backdrop').innerHTML = `<img src="${CONFIG.IMG_URL + data.backdrop_path}" alt="">`;
        document.getElementById('details-poster').src = CONFIG.IMG_URL_SMALL + data.poster_path;
        document.getElementById('details-title').innerText = data.title || data.name;
        document.getElementById('details-overview').innerText = data.overview;

        // Setup Play Button
        window.playCurrentMedia = () => window.playMedia(id, type);

        // Meta Tags
        const year = (data.release_date || data.first_air_date || "N/A").split('-')[0];
        const rating = data.vote_average ? data.vote_average.toFixed(1) : "N/A";
        const runtime = type === 'movie' ? `${data.runtime}m` : `${data.number_of_seasons} Seasons`;
        const status = data.status;

        const metaContainer = document.getElementById('details-meta');
        metaContainer.innerHTML = `
            <span class="meta-tag rating-badge"><i class="fa-solid fa-star"></i> ${rating}</span>
            <span class="meta-tag">${year}</span>
            <span class="meta-tag">${runtime}</span>
            <span class="meta-tag">${status}</span>
        `;

        // 2. Cast
        const castList = document.getElementById('cast-list');
        if (data.credits && data.credits.cast) {
            data.credits.cast.slice(0, 10).forEach(person => {
                if (!person.profile_path) return;
                const div = document.createElement('div');
                div.className = 'cast-item';
                div.innerHTML = `
                    <img class="cast-img" src="${CONFIG.IMG_URL_SMALL + person.profile_path}" alt="${person.name}">
                    <div class="cast-name">${person.name}</div>
                    <div class="cast-role">${person.character}</div>
                `;
                castList.appendChild(div);
            });
        }

        // 3. Seasons (TV Only)
        if (type === 'tv' && data.seasons) {
            document.getElementById('seasons-section').style.display = 'block';
            const seasonShelf = document.getElementById('seasons-list');
            data.seasons.forEach(season => {
                if (season.season_number === 0) return; // Skip specials usually
                const div = document.createElement('div');
                div.className = 'card';
                div.style.flex = '0 0 140px';
                div.onclick = () => loadEpisodes(id, season.season_number, season.name);

                div.innerHTML = `
                    <div class="card-img-container">
                        <img src="${season.poster_path ? CONFIG.IMG_URL_SMALL + season.poster_path : 'https://via.placeholder.com/150'}" loading="lazy">
                    </div>
                    <div class="card-info">
                        <h4 class="card-title">${season.name}</h4>
                        <span style="font-size:11px; color:#aaa;">${season.episode_count} Episodes</span>
                    </div>
                `;
                seasonShelf.appendChild(div);
            });
        }

        // 4. Collection (Movies Only)
        if (type === 'movie' && data.belongs_to_collection) {
            loadCollection(data.belongs_to_collection.id);
        }

        // 5. Recommendations / Related (Strict Genre Matching)
        let relatedResults = data.recommendations.results.length > 0 ? data.recommendations.results : data.similar.results;

        // Filter by matching at least one genre if genres are available
        if (data.genres && data.genres.length > 0) {
            const currentGenreIds = data.genres.map(g => g.id);
            relatedResults = relatedResults.filter(item =>
                item.genre_ids && item.genre_ids.some(id => currentGenreIds.includes(id))
            );
        }

        // If filter removed too many, fallback to original list (top 15)
        if (relatedResults.length < 3) {
            relatedResults = data.recommendations.results.length > 0 ? data.recommendations.results : data.similar.results;
        }

        fillShelf(relatedResults, 'related-list', type);

    } catch (error) {
        console.error("Error loading details:", error);
    }
}

async function loadCollection(collectionId) {
    try {
        const res = await fetch(`${CONFIG.BASE_URL}/collection/${collectionId}?api_key=${CONFIG.API_KEY}`);
        const data = await res.json();

        // Sort by release date
        const parts = data.parts.sort((a, b) => new Date(a.release_date) - new Date(b.release_date));

        if (parts.length > 0) {
            document.getElementById('collection-section').style.display = 'block';
            document.querySelector('#collection-section .section-title').innerText = data.name; // "Star Wars Collection"
            fillShelf(parts, 'collection-list', 'movie');
        }
    } catch (e) {
        console.error("Collection error:", e);
    }
}

// Start
startApp();

async function loadEpisodes(seriesId, seasonNum, seasonName) {
    try {
        const res = await fetch(`${CONFIG.BASE_URL}/tv/${seriesId}/season/${seasonNum}?api_key=${CONFIG.API_KEY}`);
        const data = await res.json();

        if (data.episodes && data.episodes.length > 0) {
            const episodesSection = document.getElementById('episodes-section');
            const episodesList = document.getElementById('episodes-list');
            const episodesTitle = document.getElementById('episodes-title');

            episodesSection.style.display = 'block';
            episodesTitle.innerText = `${seasonName || 'Season ' + seasonNum} - Episodes`;
            episodesList.innerHTML = ''; // Clear previous

            data.episodes.forEach(ep => {
                const card = document.createElement('div');
                card.className = 'card';
                // Cinematic Wide Card
                card.style.flex = '0 0 260px';
                card.onclick = () => window.playMedia(seriesId, 'tv', seasonNum, ep.episode_number);

                const imgContent = ep.still_path ?
                    `<img src="${CONFIG.IMG_URL_SMALL + ep.still_path}" loading="lazy" style="height:100%; width: 100%; object-fit: cover; opacity: 0.9; transition: opacity 0.3s;">` :
                    `<div style="height: 100%; width: 100%; background: linear-gradient(135deg, #1f1f1f 0%, #121212 100%); display: flex; align-items: center; justify-content: center; color: #555; font-size: 10px; font-weight: 700; text-transform: uppercase;">
                        <i class="fa-solid fa-clapperboard" style="margin-right: 5px;"></i> No Preview
                     </div>`;

                const runtimeBadge = ep.runtime ?
                    `<span style="position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.7); color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; backdrop-filter: blur(4px);">${ep.runtime}m</span>`
                    : '';

                // Add Hover Play Icon Overlay
                const playOverlay = `<div class="play-overlay" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.3); opacity: 0; transition: opacity 0.3s;">
                    <i class="fa-solid fa-circle-play" style="font-size: 36px; color: white; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.5));"></i>
                </div>`;

                card.innerHTML = `
                    <div class="card-img-container" style="height: 146px; border-radius: 8px; overflow: hidden; position: relative; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
                        ${imgContent}
                        ${playOverlay}
                        ${runtimeBadge}
                    </div>
                    
                    <div class="card-info" style="padding: 12px 2px;">
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px;">
                                <span style="font-size: 11px; color: #46d369; font-weight: 700; text-transform: uppercase;">S${seasonNum} E${ep.episode_number}</span>
                                <span style="font-size: 10px; color: #eee; font-weight: 600; background: rgba(255,255,255,0.15); padding: 2px 6px; border-radius: 4px;">${ep.air_date || 'TBA'}</span>
                            </div>
                            <span style="font-size: 14px; font-weight: 600; color: #fff; line-height: 1.3;">${ep.name}</span>
                        </div>
                    </div>
                    
                    <style>
                        .card:hover .card-img-container img { opacity: 1; transform: scale(1.05); transition: transform 0.4s ease; }
                        .card:hover .play-overlay { opacity: 1; }
                    </style>
                `;
                episodesList.appendChild(card);
            });

            // smooth scroll to episodes
            episodesSection.scrollIntoView({ behavior: 'smooth' });
        }
    } catch (error) {
        console.error("Error loading episodes:", error);
    }
}