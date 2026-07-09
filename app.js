document.addEventListener('DOMContentLoaded', () => {
    // --- Service Worker Registration ---
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js')
                .then(registration => {
                    console.log('ServiceWorker registration successful with scope: ', registration.scope);
                })
                .catch(err => {
                    console.log('ServiceWorker registration failed: ', err);
                });
        });
    }

    // --- Timer Logic ---
    const timeDisplay = document.getElementById('time-display');
    const modeDisplay = document.getElementById('mode-display');
    const startBtn = document.getElementById('start-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const resetBtn = document.getElementById('reset-btn');
    const modeBtns = document.querySelectorAll('.mode-btn');
    const circle = document.querySelector('.progress-ring__circle');

    let timerInterval;
    let timeLeft = 25 * 60; // Default 25 minutes
    let totalTime = 25 * 60;
    let isRunning = false;
    let currentMode = 'Pomodoro';

    // Circle initialization
    const radius = circle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = circumference;

    function setProgress(percent) {
        const offset = circumference - percent / 100 * circumference;
        circle.style.strokeDashoffset = offset;
    }

    function updateDisplay() {
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        const displayString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        timeDisplay.textContent = displayString;
        document.title = `${displayString} - Zenith Focus`;

        const percent = ((totalTime - timeLeft) / totalTime) * 100;
        setProgress(percent);
    }

    function startTimer() {
        if (isRunning) return;
        isRunning = true;
        startBtn.classList.add('hidden');
        pauseBtn.classList.remove('hidden');

        timerInterval = setInterval(() => {
            timeLeft--;
            updateDisplay();

            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                isRunning = false;
                startBtn.classList.remove('hidden');
                pauseBtn.classList.add('hidden');
                notifyUser();
                resetTimer(); // Or auto-switch to next mode based on preference
            }
        }, 1000);
    }

    function pauseTimer() {
        if (!isRunning) return;
        clearInterval(timerInterval);
        isRunning = false;
        startBtn.classList.remove('hidden');
        pauseBtn.classList.add('hidden');
    }

    function resetTimer() {
        pauseTimer();
        timeLeft = totalTime;
        updateDisplay();
    }

    function setMode(mode, minutes) {
        currentMode = mode;
        modeDisplay.textContent = mode + " Mode";
        totalTime = minutes * 60;
        timeLeft = totalTime;
        updateDisplay();

        // Update active button styling
        modeBtns.forEach(btn => btn.classList.remove('active'));
        const activeBtn = Array.from(modeBtns).find(btn => btn.textContent.includes(mode));
        if(activeBtn) activeBtn.classList.add('active');
    }

    function notifyUser() {
        if (Notification.permission === "granted") {
            new Notification("Time's up!", {
                body: `Your ${currentMode} session is complete.`,
                icon: "icons/icon-192x192.png"
            });
        }
    }

    // --- Event Listeners ---
    startBtn.addEventListener('click', startTimer);
    pauseBtn.addEventListener('click', pauseTimer);
    resetBtn.addEventListener('click', resetTimer);

    modeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const minutes = parseInt(e.target.getAttribute('data-time'));
            const modeName = e.target.textContent;
            setMode(modeName, minutes);
        });
    });

    // Request notification permission
    if (Notification.permission !== "denied") {
        Notification.requestPermission();
    }

    // Initial display update
    updateDisplay();
});
