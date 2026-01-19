// script.js
import CONFIG from './config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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

// --- APP STATE ---
let featuredMovie = null;
let searchTimeout;

// --- MAIN INIT ---
async function startApp() {
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
        startHeroTimer();
    } catch (error) {
        console.error("Error loading hero:", error);
    }
}

function displayHero(index) {
    const item = heroItems[index];
    if (!item) return;

    currentHeroIndex = index;
    featuredMovie = item;

    // 1. Background Image with Premium Fade
    const bgContainer = document.getElementById('hero-bg');
    const existingImg = bgContainer.querySelector('img');

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
                requestAnimationFrame(() => newImg.style.opacity = '1');
            }, 800);
        } else {
            bgContainer.innerHTML = '';
            bgContainer.appendChild(newImg);
            requestAnimationFrame(() => newImg.style.opacity = '1');
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
        card.onclick = () => playMedia(item.id, type);

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
window.playMedia = function (id, type) {
    const overlay = document.getElementById('player-overlay');
    const iframe = document.getElementById('video-iframe');
    // Using vidsrc.cc as requested
    iframe.src = type === 'movie' ?
        `https://vidsrc.cc/v2/embed/movie/${id}` :
        `https://vidsrc.cc/v2/embed/tv/${id}/1/1`;
    overlay.style.display = 'block';
}

window.closePlayer = function () {
    const overlay = document.getElementById('player-overlay');
    const iframe = document.getElementById('video-iframe');
    overlay.style.display = 'none';
    iframe.src = ""; // Stop audio
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
            playMedia(item.id, item.media_type);
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
onAuthStateChanged(auth, (user) => {
    const profileBtn = document.getElementById('user-profile-btn');
    const loginIcon = document.getElementById('logged-out-icon');
    const avatarContainer = document.getElementById('avatar-container');
    const avatarImg = document.getElementById('logged-in-avatar');

    if (user) {
        // Logged In: Show Avatar
        loginIcon.style.display = "none";
        avatarContainer.style.display = "block";
        profileBtn.classList.add('logged-in');

        // Use user's photo or a unique procedurally generated avatar based on UID
        // DiceBear 'avataaars' style creates high-quality professional unique avatars
        const uniqueAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`;
        avatarImg.src = user.photoURL || uniqueAvatar;

        profileBtn.onclick = () => {
            if (confirm(`Logout from ${user.email}?`)) {
                signOut(auth).then(() => {
                    window.location.reload();
                });
            }
        };
    } else {
        // Logged Out: Show Guest Icon
        loginIcon.style.display = "block";
        avatarContainer.style.display = "none";
        profileBtn.classList.remove('logged-in');
        profileBtn.onclick = () => window.location.href = 'auth.html';
    }
});

// Start
startApp();