let currentSessionId = null;
let activeExercises = []; // Track exercises added to the current session
let sessionStartTime = null;
let timerInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize DB
    await initDB();

    // Setup Views
    setupNavigation();

    // Load initial data
    renderRecentSessions();
    populateExerciseSelect();

    // Setup Event Listeners for Core Logic
    document.getElementById('startSessionBtn').addEventListener('click', handleStartSession);
    document.getElementById('endSessionBtn').addEventListener('click', handleEndSession);
    document.getElementById('addExerciseBtn').addEventListener('click', handleAddExercise);

    // Rest Timer
    document.getElementById('closeRestTimerBtn').addEventListener('click', hideRestTimer);

    // Settings
    document.getElementById('exportLocalBtn').addEventListener('click', handleExport);
    document.getElementById('importLocalBtn').addEventListener('click', () => document.getElementById('importFileInput').click());
    document.getElementById('importFileInput').addEventListener('change', handleImport);
});

// -- Navigation --

function switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
}

function setupNavigation() {
    document.getElementById('settingsBtn').addEventListener('click', () => switchView('settingsView'));
    document.getElementById('backToHomeBtn').addEventListener('click', () => {
        if (currentSessionId) {
            switchView('activeSessionView');
        } else {
            switchView('homeView');
            renderRecentSessions();
        }
    });
}

// -- Home View --

function renderRecentSessions() {
    const sessions = getRecentSessions();
    const list = document.getElementById('sessionList');
    list.innerHTML = '';

    if (sessions.length === 0) {
        list.innerHTML = '<li>No recent workouts.</li>';
        return;
    }

    sessions.forEach(session => {
        const li = document.createElement('li');
        const start = new Date(session.start_time).toLocaleString();
        const duration = session.end_time
            ? Math.round((new Date(session.end_time) - new Date(session.start_time)) / 60000) + ' min'
            : 'In Progress';

        li.innerHTML = `<strong>Workout</strong><br><small>${start}</small> &bull; <small>${duration}</small>`;

        if (!session.end_time) {
            li.style.cursor = 'pointer';
            li.style.borderLeft = '4px solid var(--primary-color)';
            li.addEventListener('click', () => resumeSession(session.id, session.start_time));
        }

        list.appendChild(li);
    });
}

function populateExerciseSelect() {
    const exercises = getAllExercises();
    const select = document.getElementById('exerciseSelect');

    // Group by target_group
    const groups = {};
    exercises.forEach(ex => {
        if (!groups[ex.target_group]) groups[ex.target_group] = [];
        groups[ex.target_group].push(ex);
    });

    for (const [groupName, exs] of Object.entries(groups)) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = groupName;
        exs.forEach(ex => {
            const option = document.createElement('option');
            option.value = ex.id;
            option.textContent = ex.name;
            optgroup.appendChild(option);
        });
        select.appendChild(optgroup);
    }
}

// -- Active Session Logic --

async function handleStartSession() {
    currentSessionId = await startSession();
    sessionStartTime = new Date();
    activeExercises = [];
    document.getElementById('activeWorkoutSets').innerHTML = '';
    startSessionTimer();
    switchView('activeSessionView');
}

async function resumeSession(sessionId, startTime) {
    currentSessionId = sessionId;
    sessionStartTime = new Date(startTime);
    startSessionTimer();

    const sets = getSetsForSession(sessionId);
    activeExercises = [];
    document.getElementById('activeWorkoutSets').innerHTML = '';

    // Reconstruct UI
    sets.forEach(set => {
        if (!activeExercises.includes(set.exercise_id)) {
            activeExercises.push(set.exercise_id);
            renderExerciseGroup(set.exercise_id, set.exercise_name);
        }
        renderSetItem(set);
    });

    switchView('activeSessionView');
}

async function handleEndSession() {
    if (confirm("Finish workout?")) {
        await endSession(currentSessionId);
        currentSessionId = null;
        stopSessionTimer();
        hideRestTimer();
        switchView('homeView');
        renderRecentSessions();
    }
}

function handleAddExercise() {
    const select = document.getElementById('exerciseSelect');
    const exId = select.value;
    const exName = select.options[select.selectedIndex].text;

    if (!exId) return;

    if (!activeExercises.includes(exId)) {
        activeExercises.push(exId);
        renderExerciseGroup(exId, exName);
    }

    // Reset select
    select.value = '';
}

function renderExerciseGroup(exerciseId, exerciseName) {
    const template = document.getElementById('exerciseSetTemplate');
    const container = document.getElementById('activeWorkoutSets');

    const clone = template.content.cloneNode(true);
    const group = clone.querySelector('.exercise-group');
    group.dataset.exerciseId = exerciseId;
    group.querySelector('.exercise-title').textContent = exerciseName;

    // Bind Add Set event
    const addBtn = group.querySelector('.add-set-btn');
    const weightInput = group.querySelector('.weight-input');
    const repsInput = group.querySelector('.reps-input');

    addBtn.addEventListener('click', async () => {
        const weight = parseFloat(weightInput.value);
        const reps = parseInt(repsInput.value);

        if (isNaN(weight) || isNaN(reps)) {
            alert("Please enter valid weight and reps.");
            return;
        }

        // Calculate set order
        const list = group.querySelector('.sets-list');
        const setOrder = list.children.length + 1;

        const setId = await logSet(currentSessionId, exerciseId, weight, reps, setOrder);

        renderSetItem({
            id: setId,
            exercise_id: exerciseId,
            weight_kg: weight,
            reps: reps,
            set_order: setOrder
        });

        // Start rest timer
        startRestTimer(90); // default 90s for prototype
    });

    container.appendChild(clone);
}

function renderSetItem(setData) {
    const group = document.querySelector(`.exercise-group[data-exercise-id="${setData.exercise_id}"]`);
    if (!group) return;

    const list = group.querySelector('.sets-list');
    const template = document.getElementById('setItemTemplate');
    const clone = template.content.cloneNode(true);

    const li = clone.querySelector('.set-item');
    li.dataset.setId = setData.id;
    li.querySelector('.set-number').textContent = setData.set_order;
    li.querySelector('.set-weight').textContent = setData.weight_kg;
    li.querySelector('.set-reps').textContent = setData.reps;

    li.querySelector('.delete-set-btn').addEventListener('click', async () => {
        if(confirm("Delete this set?")) {
            await deleteSet(setData.id);
            li.remove();
            // In a full implementation, we would re-calculate set_order for siblings here
        }
    });

    list.appendChild(clone);
}

// -- Timers --

function startSessionTimer() {
    const display = document.getElementById('sessionTimer');

    function update() {
        const now = new Date();
        const diff = Math.floor((now - sessionStartTime) / 1000);
        const mins = String(Math.floor(diff / 60)).padStart(2, '0');
        const secs = String(diff % 60).padStart(2, '0');
        display.textContent = `${mins}:${secs}`;
    }

    update();
    timerInterval = setInterval(update, 1000);
}

function stopSessionTimer() {
    clearInterval(timerInterval);
    document.getElementById('sessionTimer').textContent = "00:00";
}

let restInterval = null;
function startRestTimer(seconds) {
    clearInterval(restInterval);
    const banner = document.getElementById('restTimerBanner');
    const display = document.getElementById('restTimerDisplay');

    let remaining = seconds;
    banner.classList.remove('hidden');
    display.textContent = remaining;

    if (navigator.vibrate) navigator.vibrate(100); // short tick to acknowledge

    restInterval = setInterval(() => {
        remaining--;
        display.textContent = remaining;

        if (remaining <= 0) {
            clearInterval(restInterval);
            banner.classList.add('hidden');
            if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 300]); // alert done
        }
    }, 1000);
}

function hideRestTimer() {
    clearInterval(restInterval);
    document.getElementById('restTimerBanner').classList.add('hidden');
}

// -- Settings / Export --

async function handleExport() {
    const blob = await exportDatabase();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mifitness_backup_${new Date().toISOString().slice(0,10)}.sqlite`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function() {
        try {
            await importDatabase(reader.result);
            alert("Database imported successfully!");
            // Reload page to reflect new DB
            window.location.reload();
        } catch (err) {
            alert("Failed to import DB: " + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}