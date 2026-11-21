const STORAGE_KEY = "memolearn.app.v1";
const DEFAULT_GOAL = 10;

const starterCards = [
    { question: "What does HTML stand for?", answer: "HyperText Markup Language. It gives web pages their structure and meaning.", category: "HTML" },
    { question: "What is the purpose of semantic HTML?", answer: "Semantic elements describe the meaning of their content, improving accessibility, readability, and search engine understanding.", category: "HTML" },
    { question: "What does CSS control?", answer: "Cascading Style Sheets control the presentation of web pages, including layout, colors, typography, and responsive behavior.", category: "CSS" },
    { question: "What is the CSS box model?", answer: "Every element is a box made up of its content, padding, border, and margin.", category: "CSS" },
    { question: "What is JavaScript used for?", answer: "JavaScript adds behavior and interactivity to websites, and can also run on servers and other platforms.", category: "JavaScript" },
    { question: "What is a JavaScript array?", answer: "An array is an ordered collection of values that you can access by its index.", category: "JavaScript" },
    { question: "What is a function in programming?", answer: "A function is a reusable block of code that performs a task and can accept inputs and return a result.", category: "Programming" },
    { question: "What is the capital city of Japan?", answer: "Tokyo is the capital city of Japan.", category: "General Knowledge" }
];

const categoryIcons = { HTML: "〈〉", CSS: "✿", JavaScript: "JS", Programming: "⌘", "General Knowledge": "✦", Other: "✧" };
const pageNames = { dashboard: "Dashboard", study: "Study cards", library: "My library", quiz: "Quick quiz", settings: "Settings" };
let stateLoadFailed = false;

function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return `card-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeCard(card) {
    if (!card || typeof card.question !== "string" || typeof card.answer !== "string") return null;
    return {
        id: typeof card.id === "string" && card.id ? card.id : createId(),
        question: card.question.trim(),
        answer: card.answer.trim(),
        category: typeof card.category === "string" && card.category.trim() ? card.category.trim() : "General Knowledge",
        difficulty: ["Easy", "Medium", "Difficult"].includes(card.difficulty) ? card.difficulty : "Medium"
    };
}

function freshState() {
    return {
        cards: starterCards.map(card => ({ ...card, id: createId(), difficulty: "Medium" })),
        studiedCardIds: [],
        dailyLogs: {},
        quizHistory: [],
        dailyGoal: DEFAULT_GOAL,
        theme: "light"
    };
}

function loadState() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed && Array.isArray(parsed.cards)) {
                const cards = parsed.cards.map(normalizeCard).filter(Boolean);
                const validIds = new Set(cards.map(card => card.id));
                const dailyLogs = {};
                if (parsed.dailyLogs && typeof parsed.dailyLogs === "object" && !Array.isArray(parsed.dailyLogs)) {
                    Object.entries(parsed.dailyLogs).forEach(([day, ids]) => {
                        if (Array.isArray(ids)) dailyLogs[day] = [...new Set(ids.filter(id => typeof id === "string" && validIds.has(id)))];
                    });
                }
                return {
                    cards,
                    studiedCardIds: Array.isArray(parsed.studiedCardIds)
                        ? [...new Set(parsed.studiedCardIds.filter(id => typeof id === "string" && validIds.has(id)))]
                        : [],
                    dailyLogs,
                    quizHistory: Array.isArray(parsed.quizHistory)
                        ? parsed.quizHistory.filter(item => item && Number.isFinite(item.score) && Number.isFinite(item.total) && item.total > 0)
                        : [],
                    dailyGoal: Number.isInteger(parsed.dailyGoal) && parsed.dailyGoal >= 1 && parsed.dailyGoal <= 100 ? parsed.dailyGoal : DEFAULT_GOAL,
                    theme: parsed.theme === "dark" ? "dark" : "light"
                };
            }
        }

        const legacy = localStorage.getItem("flashcards");
        if (legacy) {
            const parsedLegacy = JSON.parse(legacy);
            if (Array.isArray(parsedLegacy)) {
                const migrated = parsedLegacy.map(normalizeCard).filter(Boolean);
                if (migrated.length) return { ...freshState(), cards: migrated };
            }
        }
        return freshState();
    } catch (error) {
        stateLoadFailed = true;
        console.error("Could not load saved flashcards:", error);
        return freshState();
    }
}

let state = loadState();
let currentView = "dashboard";
let studyOrder = state.cards.map(card => card.id);
let currentIndex = 0;
let sessionStudied = new Set();
let editingId = null;
let quizQuestions = [];
let quizIndex = 0;
let quizScore = 0;
let quizAnswered = false;
let toastTimer;

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

function todayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        return true;
    } catch (error) {
        console.error("Could not save flashcard progress:", error);
        showToast("Your browser couldn’t save this change. Check available storage and try again.", true);
        return false;
    }
}

function showToast(message, isError = false) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.toggle("error", isError);
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2800);
}

function getDailyCount() {
    const log = state.dailyLogs[todayKey()];
    return Array.isArray(log) ? log.length : 0;
}

function getStreak() {
    const activeDays = new Set(Object.keys(state.dailyLogs).filter(day => Array.isArray(state.dailyLogs[day]) && state.dailyLogs[day].length));
    const date = new Date();
    if (!activeDays.has(todayKey())) date.setDate(date.getDate() - 1);
    let streak = 0;
    while (true) {
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        if (!activeDays.has(key)) break;
        streak += 1;
        date.setDate(date.getDate() - 1);
    }
    return streak;
}

function setTheme() {
    document.documentElement.dataset.theme = state.theme;
    $("#themeToggle").textContent = state.theme === "dark" ? "☀" : "☾";
    $("#themeToggle").setAttribute("aria-label", state.theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
}

function renderStats() {
    const categories = new Set(state.cards.map(card => card.category));
    const attempts = state.quizHistory.length;
    const average = attempts
        ? Math.round(state.quizHistory.reduce((total, result) => total + (result.score / result.total) * 100, 0) / attempts)
        : null;
    const dailyCount = getDailyCount();
    const progress = Math.min(100, Math.round((dailyCount / state.dailyGoal) * 100));
    const streak = getStreak();

    $("#totalCardsStat").textContent = state.cards.length;
    $("#categoriesStat").textContent = categories.size;
    $("#studiedStat").textContent = state.studiedCardIds.length;
    $("#averageStat").textContent = average === null ? "—" : `${average}%`;
    $("#attemptsStat").textContent = attempts;
    $("#goalBadge").textContent = `${dailyCount} / ${state.dailyGoal} cards`;
    $("#dailyProgress").style.width = `${progress}%`;
    $("#dailyProgressLabel").textContent = `${progress}% complete`;
    $("#goalEncouragement").textContent = dailyCount >= state.dailyGoal
        ? "Goal complete — amazing work today!"
        : "Every card counts. You’ve got this!";
    $("#navCardCount").textContent = state.cards.length;
    $("#streakCount").textContent = streak;
    $("#settingsStreak").textContent = `${streak} ${streak === 1 ? "day" : "days"}`;
    $("#goalInput").value = state.dailyGoal;
    $("#todayLabel").textContent = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(new Date());
}

function renderCategories() {
    const grid = $("#categoryGrid");
    grid.replaceChildren();
    const counts = new Map();
    state.cards.forEach(card => counts.set(card.category, (counts.get(card.category) || 0) + 1));
    $("#dashboardEmpty").classList.toggle("hidden", state.cards.length > 0);
    grid.classList.toggle("hidden", state.cards.length === 0);

    Array.from(counts.entries()).slice(0, 8).forEach(([category, count]) => {
        const button = document.createElement("button");
        button.className = "category-card";
        button.type = "button";
        const icon = document.createElement("span");
        icon.className = "category-emoji";
        icon.textContent = categoryIcons[category] || "✧";
        const title = document.createElement("strong");
        title.textContent = category;
        const detail = document.createElement("small");
        detail.textContent = `${count} ${count === 1 ? "flashcard" : "flashcards"}`;
        button.append(icon, title, detail);
        button.addEventListener("click", () => {
            navigate("library");
            $("#filterCategory").value = category;
            renderLibrary();
        });
        grid.append(button);
    });
}

function cardAtIndex() {
    const id = studyOrder[currentIndex];
    return state.cards.find(card => card.id === id) || null;
}

function renderStudy() {
    studyOrder = studyOrder.filter(id => state.cards.some(card => card.id === id));
    state.cards.forEach(card => {
        if (!studyOrder.includes(card.id)) studyOrder.push(card.id);
    });
    if (currentIndex >= studyOrder.length) currentIndex = Math.max(0, studyOrder.length - 1);

    const isEmpty = studyOrder.length === 0;
    $("#studyEmpty").classList.toggle("hidden", !isEmpty);
    $$(".study-toolbar, .study-stage, .study-controls, .study-footer").forEach(element => element.classList.toggle("hidden", isEmpty));
    if (isEmpty) return;

    const card = cardAtIndex();
    const isFlipped = $("#studyCard").classList.contains("is-flipped");
    $("#studyPosition").textContent = `Card ${currentIndex + 1} of ${studyOrder.length}`;
    $("#studyCategory").textContent = card.category;
    $("#studyQuestion").textContent = card.question;
    $("#studyAnswer").textContent = card.answer;
    $("#studyQuestion").classList.toggle("hidden", isFlipped);
    $("#studyAnswer").classList.toggle("hidden", !isFlipped);
    $("#cardSideLabel").textContent = isFlipped ? "ANSWER" : "QUESTION";
    $("#studyCard").setAttribute("aria-label", isFlipped ? "Show question" : "Reveal answer");
    $("#flipHint").innerHTML = isFlipped ? "Tap anywhere to see question <span>↻</span>" : "Tap anywhere to flip <span>↻</span>";
    $("#revealBtn").innerHTML = isFlipped ? "Show question <span>↻</span>" : "Show answer <span>↻</span>";
    $$(".difficulty-btn").forEach(button => button.classList.toggle("selected", button.dataset.difficulty === card.difficulty));

    const progress = Math.round((sessionStudied.size / Math.max(1, studyOrder.length)) * 100);
    $("#sessionProgress").style.width = `${progress}%`;
    $("#sessionProgressLabel").textContent = `${progress}%`;
    $("#sessionCount").textContent = `${sessionStudied.size} of ${studyOrder.length} reviewed · ${Math.max(0, studyOrder.length - sessionStudied.size)} remaining`;
}

function renderLibrary() {
    const categorySelect = $("#filterCategory");
    const selectedCategory = categorySelect.value || "all";
    categorySelect.replaceChildren();
    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "All topics";
    categorySelect.append(allOption);
    Array.from(new Set(state.cards.map(card => card.category))).sort().forEach(category => {
        const option = document.createElement("option");
        option.value = category;
        option.textContent = category;
        categorySelect.append(option);
    });
    categorySelect.value = Array.from(categorySelect.options).some(option => option.value === selectedCategory) ? selectedCategory : "all";

    const query = $("#searchInput").value.trim().toLowerCase();
    const category = categorySelect.value;
    const filtered = state.cards.filter(card => (category === "all" || card.category === category)
        && `${card.question} ${card.answer} ${card.category}`.toLowerCase().includes(query));
    const list = $("#flashcardList");
    list.replaceChildren();
    filtered.forEach(card => {
        const item = document.createElement("article");
        item.className = "library-card";
        const content = document.createElement("div");
        const meta = document.createElement("div");
        meta.className = "card-meta";
        const categoryLabel = document.createElement("span");
        categoryLabel.className = "card-category";
        categoryLabel.textContent = card.category;
        const difficulty = document.createElement("span");
        difficulty.className = "card-level";
        difficulty.textContent = card.difficulty;
        meta.append(categoryLabel, difficulty);
        const question = document.createElement("h3");
        question.textContent = card.question;
        const answer = document.createElement("p");
        answer.textContent = card.answer;
        content.append(meta, question, answer);

        const actions = document.createElement("div");
        actions.className = "card-actions";
        const editButton = document.createElement("button");
        editButton.className = "card-action";
        editButton.type = "button";
        editButton.dataset.action = "edit";
        editButton.dataset.id = card.id;
        editButton.setAttribute("aria-label", "Edit card");
        editButton.title = "Edit";
        editButton.textContent = "✎";
        const deleteButton = document.createElement("button");
        deleteButton.className = "card-action delete";
        deleteButton.type = "button";
        deleteButton.dataset.action = "delete";
        deleteButton.dataset.id = card.id;
        deleteButton.setAttribute("aria-label", "Delete card");
        deleteButton.title = "Delete";
        deleteButton.textContent = "×";
        actions.append(editButton, deleteButton);
        item.append(content, actions);
        list.append(item);
    });

    $("#libraryEmpty").classList.toggle("hidden", filtered.length > 0);
    $("#libraryTotal").textContent = `${state.cards.length} ${state.cards.length === 1 ? "card" : "cards"}`;
}

function renderAll() {
    renderStats();
    renderCategories();
    renderStudy();
    renderLibrary();
}

function navigate(view) {
    if (!pageNames[view]) return;
    if (view === "study" && currentView !== "study") {
        studyOrder = state.cards.map(card => card.id);
        currentIndex = 0;
        sessionStudied = new Set();
        $("#studyCard").classList.remove("is-flipped");
    }
    currentView = view;
    $$(".view").forEach(section => section.classList.toggle("active", section.id === `${view}View`));
    $$(".nav-item[data-view]").forEach(button => button.classList.toggle("active", button.dataset.view === view));
    $("#pageTitle").textContent = pageNames[view];
    $("#sidebar").classList.remove("open");
    if (view === "study") renderStudy();
    if (view === "library") renderLibrary();
}

function markStudied(card) {
    sessionStudied.add(card.id);
    if (!state.studiedCardIds.includes(card.id)) state.studiedCardIds.push(card.id);
    const key = todayKey();
    if (!Array.isArray(state.dailyLogs[key])) state.dailyLogs[key] = [];
    if (!state.dailyLogs[key].includes(card.id)) state.dailyLogs[key].push(card.id);
    saveState();
    renderStats();
    renderStudy();
}

function flipStudyCard() {
    if (!studyOrder.length) return;
    const card = cardAtIndex();
    const isFlipped = !$("#studyCard").classList.contains("is-flipped");
    $("#studyCard").classList.toggle("is-flipped", isFlipped);
    if (isFlipped) markStudied(card);
    else renderStudy();
}

function clearEditor() {
    editingId = null;
    $("#cardForm").reset();
    $("#formEyebrow").textContent = "ADD SOMETHING NEW";
    $("#formTitle").textContent = "Create a flashcard";
    $("#saveCardBtn").textContent = "Add flashcard";
    $("#cancelEditBtn").classList.add("hidden");
}

function startEditing(id) {
    const card = state.cards.find(item => item.id === id);
    if (!card) return;
    editingId = id;
    $("#questionInput").value = card.question;
    $("#answerInput").value = card.answer;
    const categorySelect = $("#categoryInput");
    if (!Array.from(categorySelect.options).some(option => option.value === card.category)) {
        const option = document.createElement("option");
        option.value = card.category;
        option.textContent = card.category;
        categorySelect.append(option);
    }
    categorySelect.value = card.category;
    $("#formEyebrow").textContent = "MAKE IT JUST RIGHT";
    $("#formTitle").textContent = "Edit your flashcard";
    $("#saveCardBtn").textContent = "Save changes";
    $("#cancelEditBtn").classList.remove("hidden");
    $("#questionInput").focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function shuffle(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
        const randomIndex = Math.floor(Math.random() * (index + 1));
        [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
    }
    return result;
}

function startQuiz() {
    if (!state.cards.length) {
        $("#quizIntro").classList.add("hidden");
        $("#quizQuestionPanel").classList.add("hidden");
        $("#quizResult").classList.add("hidden");
        $("#quizEmpty").classList.remove("hidden");
        return;
    }
    quizQuestions = shuffle(state.cards).slice(0, 10);
    quizIndex = 0;
    quizScore = 0;
    quizAnswered = false;
    $("#quizIntro").classList.add("hidden");
    $("#quizResult").classList.add("hidden");
    $("#quizEmpty").classList.add("hidden");
    $("#quizQuestionPanel").classList.remove("hidden");
    renderQuizQuestion();
}

function makeOptions(correctAnswer) {
    const options = shuffle([...new Set(state.cards.map(card => card.answer).filter(answer => answer !== correctAnswer))]).slice(0, 3);
    ["A different concept", "Something to explore further", "Not quite — try another idea"].forEach(answer => {
        if (options.length < 3 && answer !== correctAnswer && !options.includes(answer)) options.push(answer);
    });
    return shuffle([correctAnswer, ...options]);
}

function renderQuizQuestion() {
    const card = quizQuestions[quizIndex];
    quizAnswered = false;
    $("#quizQuestionCount").textContent = `Question ${quizIndex + 1} of ${quizQuestions.length}`;
    $("#quizScore").textContent = `${quizScore} correct`;
    $("#quizProgress").style.width = `${(quizIndex / quizQuestions.length) * 100}%`;
    $("#quizCategory").textContent = card.category;
    $("#quizQuestion").textContent = card.question;
    $("#quizFeedback").className = "quiz-feedback hidden";
    $("#quizFeedback").textContent = "";
    $("#quizTip").textContent = "Choose the best answer";
    $("#quizNextBtn").classList.add("hidden");

    const optionsContainer = $("#quizOptions");
    optionsContainer.replaceChildren();
    makeOptions(card.answer).forEach((option, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "quiz-option";
        button.dataset.correct = String(option === card.answer);
        const letter = document.createElement("span");
        letter.className = "option-letter";
        letter.textContent = String.fromCharCode(65 + index);
        const text = document.createElement("span");
        text.textContent = option;
        button.append(letter, text);
        button.addEventListener("click", () => answerQuiz(button));
        optionsContainer.append(button);
    });
}

function answerQuiz(selectedButton) {
    if (quizAnswered) return;
    quizAnswered = true;
    const correct = selectedButton.dataset.correct === "true";
    if (correct) quizScore += 1;
    $$(".quiz-option").forEach(button => {
        button.disabled = true;
        if (button.dataset.correct === "true") button.classList.add("correct");
    });
    if (!correct) selectedButton.classList.add("incorrect");

    const feedback = $("#quizFeedback");
    feedback.textContent = correct ? "That’s right — nice work!" : `Not quite. The correct answer is: ${quizQuestions[quizIndex].answer}`;
    feedback.classList.remove("hidden");
    feedback.classList.add(correct ? "good" : "bad");
    $("#quizScore").textContent = `${quizScore} correct`;
    $("#quizTip").textContent = correct ? "Keep that momentum going." : "Every answer is a chance to learn.";
    $("#quizNextBtn").textContent = quizIndex === quizQuestions.length - 1 ? "See your results →" : "Next question →";
    $("#quizNextBtn").classList.remove("hidden");
}

function finishQuiz() {
    state.quizHistory.push({ score: quizScore, total: quizQuestions.length, date: new Date().toISOString() });
    const saved = saveState();
    renderStats();
    $("#quizQuestionPanel").classList.add("hidden");
    $("#quizResult").classList.remove("hidden");
    $("#quizProgress").style.width = "100%";
    const percentage = Math.round((quizScore / quizQuestions.length) * 100);
    $("#resultTitle").textContent = percentage === 100 ? "Perfect score!" : percentage >= 70 ? "Nicely done!" : "Good effort!";
    $("#resultScore").innerHTML = `${quizScore}<span> / ${quizQuestions.length}</span>`;
    $("#resultMessage").textContent = `You got ${percentage}% correct. ${percentage >= 70 ? "Your practice is paying off." : "Keep studying and you’ll get even stronger."}`;
    if (!saved) return;
}

function initialize() {
    setTheme();
    renderAll();
    if (stateLoadFailed) showToast("Saved data could not be read. A fresh library has been loaded.", true);

    $$(".nav-item[data-view]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.view)));
    $$("[data-go]").forEach(button => button.addEventListener("click", event => {
        event.preventDefault();
        navigate(button.dataset.go);
    }));
    $("#themeToggle").addEventListener("click", () => {
        state.theme = state.theme === "dark" ? "light" : "dark";
        setTheme();
        saveState();
    });
    $("#menuToggle").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
    document.addEventListener("click", event => {
        if (window.innerWidth <= 760 && $("#sidebar").classList.contains("open")
            && !$("#sidebar").contains(event.target) && !$("#menuToggle").contains(event.target)) {
            $("#sidebar").classList.remove("open");
        }
    });

    $("#studyCard").addEventListener("click", flipStudyCard);
    $("#revealBtn").addEventListener("click", flipStudyCard);
    $("#studyNext").addEventListener("click", () => {
        if (!studyOrder.length) return;
        currentIndex = (currentIndex + 1) % studyOrder.length;
        $("#studyCard").classList.remove("is-flipped");
        renderStudy();
    });
    $("#studyPrev").addEventListener("click", () => {
        if (!studyOrder.length) return;
        currentIndex = (currentIndex - 1 + studyOrder.length) % studyOrder.length;
        $("#studyCard").classList.remove("is-flipped");
        renderStudy();
    });
    $("#shuffleBtn").addEventListener("click", () => {
        if (studyOrder.length < 2) {
            showToast(studyOrder.length ? "Add more cards to shuffle your deck." : "Add cards to start studying.", true);
            return;
        }
        studyOrder = shuffle(studyOrder);
        currentIndex = 0;
        sessionStudied = new Set();
        $("#studyCard").classList.remove("is-flipped");
        renderStudy();
        showToast("Your study deck has been shuffled.");
    });
    $("#randomBtn").addEventListener("click", () => {
        if (!studyOrder.length) return;
        currentIndex = Math.floor(Math.random() * studyOrder.length);
        $("#studyCard").classList.remove("is-flipped");
        renderStudy();
    });
    $$(".difficulty-btn").forEach(button => button.addEventListener("click", () => {
        const card = cardAtIndex();
        if (!card) return;
        card.difficulty = button.dataset.difficulty;
        markStudied(card);
        showToast(`Marked as ${card.difficulty.toLowerCase()}.`);
    }));

    $("#cardForm").addEventListener("submit", event => {
        event.preventDefault();
        const question = $("#questionInput").value.trim();
        const answer = $("#answerInput").value.trim();
        const category = $("#categoryInput").value;
        if (!question || !answer) {
            showToast("Add both a question and an answer before saving.", true);
            return;
        }
        if (question.length > 240 || answer.length > 600) {
            showToast("Your question or answer is too long. Please shorten it and try again.", true);
            return;
        }

        let successMessage;
        if (editingId) {
            const card = state.cards.find(item => item.id === editingId);
            if (!card) {
                showToast("That flashcard could not be found. Refresh and try again.", true);
                clearEditor();
                return;
            }
            card.question = question;
            card.answer = answer;
            card.category = category;
            successMessage = "Flashcard updated.";
        } else {
            const card = { id: createId(), question, answer, category, difficulty: "Medium" };
            state.cards.push(card);
            studyOrder.push(card.id);
            currentIndex = studyOrder.length - 1;
            successMessage = "Flashcard added to your library.";
        }
        const saved = saveState();
        clearEditor();
        renderAll();
        if (saved) showToast(successMessage);
    });
    $("#cancelEditBtn").addEventListener("click", clearEditor);
    $("#searchInput").addEventListener("input", renderLibrary);
    $("#filterCategory").addEventListener("change", renderLibrary);
    $("#flashcardList").addEventListener("click", event => {
        const button = event.target.closest("[data-action]");
        if (!button) return;
        const id = button.dataset.id;
        if (button.dataset.action === "edit") {
            startEditing(id);
            return;
        }
        const card = state.cards.find(item => item.id === id);
        if (!card || !window.confirm(`Delete “${card.question}”? This cannot be undone.`)) return;
        const activeStudyId = studyOrder[currentIndex];
        state.cards = state.cards.filter(item => item.id !== id);
        studyOrder = studyOrder.filter(cardId => cardId !== id);
        sessionStudied.delete(id);
        $("#studyCard").classList.remove("is-flipped");
        currentIndex = activeStudyId === id
            ? Math.min(currentIndex, Math.max(0, studyOrder.length - 1))
            : Math.max(0, studyOrder.indexOf(activeStudyId));
        state.studiedCardIds = state.studiedCardIds.filter(cardId => cardId !== id);
        Object.keys(state.dailyLogs).forEach(day => {
            state.dailyLogs[day] = state.dailyLogs[day].filter(cardId => cardId !== id);
            if (!state.dailyLogs[day].length) delete state.dailyLogs[day];
        });
        if (editingId === id) clearEditor();
        const saved = saveState();
        renderAll();
        if (saved) showToast("Flashcard deleted.");
    });

    $("#startQuizBtn").addEventListener("click", startQuiz);
    $("#restartQuizBtn").addEventListener("click", startQuiz);
    $("#quizNextBtn").addEventListener("click", () => {
        if (quizIndex < quizQuestions.length - 1) {
            quizIndex += 1;
            renderQuizQuestion();
        } else {
            finishQuiz();
        }
    });
    $("#goalForm").addEventListener("submit", event => {
        event.preventDefault();
        const goal = Number($("#goalInput").value);
        if (!Number.isInteger(goal) || goal < 1 || goal > 100) {
            showToast("Choose a daily goal between 1 and 100 cards.", true);
            return;
        }
        state.dailyGoal = goal;
        const saved = saveState();
        renderStats();
        if (saved) showToast("Daily learning goal saved.");
    });
    $("#resetProgressBtn").addEventListener("click", () => {
        if (!window.confirm("Reset your studied-card history, quiz scores, daily activity, and streak? Your flashcards will not be deleted.")) return;
        state.studiedCardIds = [];
        state.dailyLogs = {};
        state.quizHistory = [];
        sessionStudied = new Set();
        const saved = saveState();
        renderAll();
        if (saved) showToast("Your learning progress has been reset.");
    });
}

initialize();
