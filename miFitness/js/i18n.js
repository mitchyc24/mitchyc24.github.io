// i18n.js — English/French strings and the helpers that resolve them.
//
// Keys are flat and dotted. `{name}` placeholders are interpolated; entries
// written as `{ one, other }` are chosen with Intl.PluralRules, so French gets
// its own rule (0 and 1 are singular) rather than English's.
//
// Numbers stay in "1234.5" form in every locale: weights are typed into
// <input type="number">, which only accepts a dot, and a display that
// disagreed with the input beside it would read as a bug.

export const LOCALES = ['en', 'fr'];

export const LOCALE_NAMES = { en: 'English', fr: 'Français' };

const en = {
    // --- Shell
    'app.loading': 'Opening your training log…',
    'nav.train': 'Train',
    'nav.history': 'History',
    'nav.exercises': 'Exercises',
    'nav.progress': 'Progress',
    'nav.settings': 'Settings',
    'app.failed': 'miFitness could not start.',

    // --- Common
    'common.cancel': 'Cancel',
    'common.save': 'Save',
    'common.delete': 'Delete',
    'common.add': 'Add',
    'common.addCount': 'Add {count}',
    'common.remove': 'Remove',
    'common.rename': 'Rename',
    'common.confirm': 'Confirm',
    'common.close': 'Close',
    'common.edit': 'Edit',
    'common.back': 'Back',
    'common.all': 'All',
    'common.name': 'Name',
    'common.notes': 'Notes',
    'common.options': 'Options',
    'common.areYouSure': 'Are you sure?',
    'common.loadMore': 'Load more',
    'common.seeAll': 'See all',
    'common.new': 'New',
    'common.nothingMatches': 'Nothing matches',
    'common.sets': { one: '{count} set', other: '{count} sets' },
    'common.exercisesCount': { one: '{count} exercise', other: '{count} exercises' },
    'common.workoutsCount': { one: '{count} workout', other: '{count} workouts' },
    'common.workingSets': { one: '{count} working set', other: '{count} working sets' },
    'common.perSide': '{load} → {plates} per side',
    'common.perSideShort': '{load} → {plates} per side ({short} short)',
    'common.justTheBar': 'just the bar',
    'common.setsWord': 'sets',
    'common.minus15': '−15s',
    'common.plus15': '+15s',

    // --- Duration units (appended straight after the number)
    'duration.hours': 'h',
    'duration.minutes': 'm',
    'duration.seconds': 's',

    // --- Home
    'home.eyebrowWelcome': 'Welcome',
    'home.eyebrowReady': 'Ready when you are',
    'home.titleFirst': 'Log your first workout',
    'home.titleReady': 'Start training',
    'home.subFirst': 'Pick a routine or start empty. Everything stays on this device.',
    'home.subReady': {
        one: '{count} workout logged · {volume} {unit} lifted all time.',
        other: '{count} workouts logged · {volume} {unit} lifted all time.'
    },
    'home.emptyWorkout': 'Empty workout',
    'home.fromRoutine': 'From a routine',
    'home.thisWeek': 'This week',
    'home.routines': 'Routines',
    'home.recent': 'Recent workouts',
    'home.noRoutines': 'No routines yet',
    'home.noRoutinesHint': 'Save a workout as a routine, or build one from scratch.',
    'home.noWorkouts': 'No workouts yet',
    'home.noWorkoutsHint': 'Finished workouts show up here.',
    'home.inProgress': 'Workout in progress',
    'home.resume': 'Resume',
    'home.resumeMeta': {
        one: 'Started {when} · {count} set logged',
        other: 'Started {when} · {count} sets logged'
    },
    'home.startFromRoutine': 'Start from a routine',
    'home.alreadyRunning': 'A workout is already running',
    'home.alreadyRunningHint': 'Finish or discard it before starting another.',
    'home.openIt': 'Open it',

    // --- Stat tiles
    'stat.workouts': 'Workouts',
    'stat.volume': 'Volume',
    'stat.workSets': 'Work sets',
    'stat.weekStreak': 'Week streak',
    'stat.reps': 'Reps',
    'stat.exercises': 'Exercises',
    'stat.heaviest': 'Heaviest',
    'stat.oneRepMax': 'Est. 1RM',
    'stat.bestSet': 'Best set',
    'stat.setsLogged': 'Sets logged',

    // --- Workout
    'workout.title': 'Workout',
    'workout.minimise': 'Minimise',
    'workout.minimiseHint': 'Leave the workout running and come back later',
    'workout.options': 'Workout options',
    'workout.exerciseOptions': 'Exercise options',
    'workout.addExercise': 'Add exercise',
    'workout.finish': 'Finish workout',
    'workout.nothingAdded': 'Nothing added yet',
    'workout.nothingAddedHint': 'Add the first exercise to start logging sets.',
    'workout.colSet': 'Set',
    'workout.colReps': 'Reps',
    'workout.colRpe': 'RPE',
    'workout.addSet': 'Add set',
    'workout.addWarmup': '+ Warm-up',
    'workout.warmupShort': 'W',
    'workout.markWarmup': 'Tap to mark as a warm-up',
    'workout.unmarkWarmup': 'Warm-up set — tap to make it a working set',
    'workout.weightAria': 'Weight for set {index}',
    'workout.repsAria': 'Reps for set {index}',
    'workout.completeSet': 'Complete this set',
    'workout.undoSet': 'Undo this set',
    'workout.needReps': 'Enter the reps first',
    'workout.rpeTitle': 'Rate of perceived exertion',
    'workout.rpeClear': 'Clear',
    'workout.rpeNone': 'No RPE recorded',
    'workout.rpeFailure': 'No reps left in the tank',
    'workout.rpeOne': 'One rep in reserve',
    'workout.rpeTwo': 'Two reps in reserve',
    'workout.rpeEasy': 'Comfortably short of failure',
    'workout.viewHistory': 'View history & records',
    'workout.plateCalculator': 'Plate calculator',
    'workout.moveUp': 'Move up',
    'workout.moveDown': 'Move down',
    'workout.removeExercise': 'Remove from workout',
    'workout.removeConfirm': 'Remove {name}?',
    'workout.removeConfirmHint': 'Its sets in this workout will be deleted.',
    'workout.renameWorkout': 'Rename workout',
    'workout.workoutName': 'Workout name',
    'workout.discard': 'Discard workout',
    'workout.discardConfirm': 'Discard this workout?',
    'workout.discardConfirmHint': 'Every set logged in it will be deleted. This cannot be undone.',
    'workout.discardAction': 'Discard',
    'workout.discarded': 'Workout discarded',
    'workout.nothingLogged': 'Nothing logged',
    'workout.nothingLoggedHint': 'This workout has no completed sets. Discard it?',
    'workout.finishConfirm': 'Finish workout?',
    'workout.finishConfirmHint': '{sets} · {volume} {unit} of volume · {duration}.',
    'workout.finishAction': 'Finish',
    'workout.saved': 'Workout saved',
    'workout.renamed': 'Renamed',
    'workout.routineSaved': 'Routine saved',
    'workout.prWeight': 'heaviest set',
    'workout.pr1rm': 'best estimated 1RM',
    'workout.prVolume': 'best set volume',
    'workout.prToast': '{name}: {record}!',

    // --- Rest timer
    'rest.label': 'Rest',
    'rest.skip': 'Skip',
    'rest.done': 'Rest over — next set',

    // --- History
    'history.title': 'History',
    'history.today': 'Today',
    'history.yesterday': 'Yesterday',
    'history.empty': 'No history yet',
    'history.emptyHint': 'Finish a workout and it will be filed here.',
    'session.saveAsRoutine': 'Save as routine',
    'session.deleteWorkout': 'Delete workout',
    'session.deleteConfirm': 'Delete this workout?',
    'session.deleteConfirmHint': 'Its sets are removed from your history and records.',
    'session.deleted': 'Workout deleted',

    // --- Exercises
    'exercises.title': 'Exercises',
    'exercises.search': 'Search exercises',
    'exercises.neverTrained': 'never trained',
    'exercises.setsLogged': { one: '{count} set logged', other: '{count} sets logged' },
    'exercises.noMatchHint': 'Try a different search, or add a custom exercise.',
    'exercises.pickerNoMatchHint': 'Add it as a custom exercise from the Exercises tab.',
    'exercises.favourite': 'Favourite',
    'exercises.custom': 'custom',
    'exercises.noHistory': 'No history yet',
    'exercises.noHistoryHint': 'Log this exercise in a workout and its records appear here.',
    'exercises.sessionHistory': 'Session history',
    'exercises.newTitle': 'New exercise',
    'exercises.editTitle': 'Edit exercise',
    'exercises.namePlaceholder': 'e.g. Pendlay Row',
    'exercises.muscleGroup': 'Muscle group',
    'exercises.equipment': 'Equipment',
    'exercises.restLabel': 'Rest between sets (seconds)',
    'exercises.restPlaceholder': 'Use the default',
    'exercises.notesPlaceholder': 'Setup cues, seat height, grip…',
    'exercises.deleteConfirm': 'Delete {name}?',
    'exercises.deleteConfirmHint': 'Exercises with logged sets are archived instead, so your history stays intact.',
    'exercises.archived': 'Archived — history kept',
    'exercises.deleted': 'Deleted',
    'exercises.updated': 'Exercise updated',
    'exercises.added': 'Exercise added',

    // --- Routines
    'routine.newTitle': 'New routine',
    'routine.editTitle': 'Edit routine',
    'routine.edit': 'Edit routine',
    'routine.namePlaceholder': 'e.g. Upper A',
    'routine.description': 'Description',
    'routine.descriptionPlaceholder': 'Optional',
    'routine.exercises': 'Exercises',
    'routine.addExercise': 'Add exercise',
    'routine.addToRoutine': 'Add to routine',
    'routine.save': 'Save routine',
    'routine.noExercises': 'No exercises yet',
    'routine.noExercisesHint': 'Add the movements this routine should prompt you for.',
    'routine.needExercise': 'Add at least one exercise',
    'routine.deleteConfirm': 'Delete {name}?',
    'routine.deleteConfirmHint': 'Workouts already logged from it are not affected.',
    'routine.deleted': 'Routine deleted',
    'routine.created': 'Routine created',
    'routine.updated': 'Routine updated',
    'routine.setsAria': 'Sets for {name}',
    'routine.repsAria': 'Reps for {name}',

    // --- Progress
    'progress.title': 'Progress',
    'progress.range30': '30d',
    'progress.range90': '90d',
    'progress.range365': '1y',
    'progress.rangeAria': 'Time range',
    'progress.empty': 'Nothing in this window',
    'progress.emptyHint': 'Log a workout, or widen the range, to see your trends.',
    'progress.weeklyVolume': 'Weekly volume',
    'progress.weeklyVolumeSub': 'Working-set tonnage per week, in {unit}.',
    'progress.muscleSplit': 'Muscle group split',
    'progress.muscleSplitSub': 'Share of working sets — the balance check.',
    'progress.mostTrained': 'Most trained',
    'progress.bodyWeight': 'Body weight',
    'progress.bodyWeightSub': 'Logged from Settings, in {unit}.',
    'progress.oneRepMax': 'Estimated 1RM',
    'progress.oneRepMaxSub': 'Best set of each session, {unit} (Epley estimate).',
    'progress.noVolume': 'No volume logged in this window yet.',
    'progress.nothingLogged': 'Nothing logged in this window yet.',
    'progress.notEnough': 'Not enough history to chart yet.',
    'progress.showNumbers': 'Show the numbers',
    'progress.colWeekOf': 'Week of',
    'progress.colVolume': 'Volume ({unit})',
    'progress.colSets': 'Sets',
    'progress.colDate': 'Date',
    'progress.colTopSet': 'Top set',
    'progress.col1rm': 'Est. 1RM ({unit})',
    'progress.barChartAria': 'Bar chart, {count} periods',
    'progress.lineChartAria': 'Line chart, {count} points',
    'progress.donutAria': 'Donut chart of {count} categories',
    'progress.other': 'Other',
    'progress.tooltipVolume': '{volume} {unit}',
    'progress.tooltipWeek': '{sets} · week of {date}',
    'progress.tooltip1rm': '{value} est. 1RM',

    // --- Settings
    'settings.title': 'Settings',
    'settings.language': 'Language',
    'settings.languageHint': 'Changes every label in the app.',
    'settings.training': 'Training',
    'settings.units': 'Units',
    'settings.unitsHint': 'Weights are stored in kilograms and converted for display.',
    'settings.defaultRest': 'Default rest',
    'settings.defaultRestHint': 'Used when an exercise has no rest of its own.',
    'settings.rest60': '60s',
    'settings.rest90': '90s',
    'settings.rest120': '2m',
    'settings.rest180': '3m',
    'settings.autoRest': 'Auto-start rest timer',
    'settings.autoRestHint': 'Starts counting the moment you tick a set off.',
    'settings.vibrate': 'Vibrate when rest ends',
    'settings.vibrateHint': 'Needs a device with a vibration motor.',
    'settings.sound': 'Beep when rest ends',
    'settings.soundHint': 'A short tone, even with the screen off.',
    'settings.wakeLock': 'Keep the screen awake',
    'settings.wakeLockHint': 'Holds a wake lock while a workout is running.',
    'settings.appearance': 'Appearance',
    'settings.theme': 'Theme',
    'settings.themeAuto': 'Auto',
    'settings.themeLight': 'Light',
    'settings.themeDark': 'Dark',
    'settings.accent': 'Accent',
    'settings.accentAria': '{name} accent',
    'settings.bodyWeight': 'Body weight',
    'settings.bodyWeightPlaceholder': "Today's weight",
    'settings.logWeight': 'Log',
    'settings.weightLogged': 'Body weight logged',
    'settings.needWeight': 'Enter a weight first',
    'settings.noWeightEntries': 'No entries yet. Logging weight adds a trend chart to Progress.',
    'settings.deleteEntry': 'Delete entry',
    'settings.yourData': 'Your data',
    'settings.dataHint': 'Everything lives in this browser. Export a backup before clearing site data or switching device.',
    'settings.exportSqlite': 'Export database (.sqlite)',
    'settings.exportJson': 'Export as JSON',
    'settings.import': 'Import a .sqlite backup',
    'settings.reset': 'Reset everything',
    'settings.about': 'About',
    'settings.aboutPartOf': '<strong>miFitness</strong> — part of <a href="../">miApps</a>.',
    'settings.aboutStorage': '{workouts} · {sets} · {volume} {unit} lifted, all stored in this browser.',
    'data.backupDownloaded': 'Backup downloaded',
    'data.jsonExported': 'JSON exported',
    'data.importConfirm': 'Replace your data?',
    'data.importConfirmHint': 'Importing {name} replaces everything currently stored on this device.',
    'data.import': 'Import',
    'data.restored': 'Backup restored',
    'data.importFailed': 'Import failed: {error}',
    'data.resetConfirm': 'Reset everything?',
    'data.resetConfirmHint': 'Every workout, routine and custom exercise is deleted, and the seed library comes back. Export a backup first if you might want it.',
    'data.resetAction': 'Delete everything',
    'data.resetDone': 'Reset complete',

    // --- Taxonomy (stored canonically in English, translated for display)
    'group.Chest': 'Chest',
    'group.Back': 'Back',
    'group.Shoulders': 'Shoulders',
    'group.Biceps': 'Biceps',
    'group.Triceps': 'Triceps',
    'group.Quads': 'Quads',
    'group.Hamstrings & Glutes': 'Hamstrings & Glutes',
    'group.Calves': 'Calves',
    'group.Core': 'Core',
    'group.Cardio': 'Cardio',
    'group.Other': 'Other',
    'equipment.Barbell': 'Barbell',
    'equipment.Dumbbell': 'Dumbbell',
    'equipment.Machine': 'Machine',
    'equipment.Cable': 'Cable',
    'equipment.Bodyweight': 'Bodyweight',
    'equipment.Kettlebell': 'Kettlebell',
    'equipment.Band': 'Band',
    'equipment.Other': 'Other'
};

const fr = {
    'app.loading': 'Ouverture de votre carnet…',
    'nav.train': 'Séance',
    'nav.history': 'Historique',
    'nav.exercises': 'Exercices',
    'nav.progress': 'Progrès',
    'nav.settings': 'Réglages',
    'app.failed': 'miFitness n’a pas pu démarrer.',

    'common.cancel': 'Annuler',
    'common.save': 'Enregistrer',
    'common.delete': 'Supprimer',
    'common.add': 'Ajouter',
    'common.addCount': 'Ajouter {count}',
    'common.remove': 'Retirer',
    'common.rename': 'Renommer',
    'common.confirm': 'Confirmer',
    'common.close': 'Fermer',
    'common.edit': 'Modifier',
    'common.back': 'Retour',
    'common.all': 'Tous',
    'common.name': 'Nom',
    'common.notes': 'Notes',
    'common.options': 'Options',
    'common.areYouSure': 'Confirmer ?',
    'common.loadMore': 'Afficher plus',
    'common.seeAll': 'Tout voir',
    'common.new': 'Nouveau',
    'common.nothingMatches': 'Aucun résultat',
    'common.sets': { one: '{count} série', other: '{count} séries' },
    'common.exercisesCount': { one: '{count} exercice', other: '{count} exercices' },
    'common.workoutsCount': { one: '{count} séance', other: '{count} séances' },
    'common.workingSets': { one: '{count} série effective', other: '{count} séries effectives' },
    'common.perSide': '{load} → {plates} de chaque côté',
    'common.perSideShort': '{load} → {plates} de chaque côté (il manque {short})',
    'common.justTheBar': 'la barre seule',
    'common.setsWord': 'séries',
    'common.minus15': '−15 s',
    'common.plus15': '+15 s',

    'duration.hours': ' h',
    'duration.minutes': ' min',
    'duration.seconds': ' s',

    'home.eyebrowWelcome': 'Bienvenue',
    'home.eyebrowReady': 'Quand vous voulez',
    'home.titleFirst': 'Enregistrez votre première séance',
    'home.titleReady': 'Commencer l’entraînement',
    'home.subFirst': 'Choisissez un programme ou partez de zéro. Tout reste sur cet appareil.',
    'home.subReady': {
        one: '{count} séance enregistrée · {volume} {unit} soulevés au total.',
        other: '{count} séances enregistrées · {volume} {unit} soulevés au total.'
    },
    'home.emptyWorkout': 'Séance libre',
    'home.fromRoutine': 'Depuis un programme',
    'home.thisWeek': 'Cette semaine',
    'home.routines': 'Programmes',
    'home.recent': 'Séances récentes',
    'home.noRoutines': 'Aucun programme',
    'home.noRoutinesHint': 'Enregistrez une séance comme programme, ou créez-en un de toutes pièces.',
    'home.noWorkouts': 'Aucune séance',
    'home.noWorkoutsHint': 'Vos séances terminées apparaîtront ici.',
    'home.inProgress': 'Séance en cours',
    'home.resume': 'Reprendre',
    'home.resumeMeta': {
        one: 'Commencée {when} · {count} série enregistrée',
        other: 'Commencée {when} · {count} séries enregistrées'
    },
    'home.startFromRoutine': 'Démarrer depuis un programme',
    'home.alreadyRunning': 'Une séance est déjà en cours',
    'home.alreadyRunningHint': 'Terminez-la ou abandonnez-la avant d’en commencer une autre.',
    'home.openIt': 'L’ouvrir',

    'stat.workouts': 'Séances',
    'stat.volume': 'Volume',
    'stat.workSets': 'Séries eff.',
    'stat.weekStreak': 'Semaines d’affilée',
    'stat.reps': 'Répétitions',
    'stat.exercises': 'Exercices',
    'stat.heaviest': 'Plus lourd',
    'stat.oneRepMax': '1RM est.',
    'stat.bestSet': 'Meilleure série',
    'stat.setsLogged': 'Séries enreg.',

    'workout.title': 'Séance',
    'workout.minimise': 'Réduire',
    'workout.minimiseHint': 'Laisser la séance en cours et y revenir plus tard',
    'workout.options': 'Options de la séance',
    'workout.exerciseOptions': 'Options de l’exercice',
    'workout.addExercise': 'Ajouter un exercice',
    'workout.finish': 'Terminer la séance',
    'workout.nothingAdded': 'Rien pour l’instant',
    'workout.nothingAddedHint': 'Ajoutez un premier exercice pour enregistrer vos séries.',
    'workout.colSet': 'Série',
    'workout.colReps': 'Réps',
    'workout.colRpe': 'RPE',
    'workout.addSet': 'Ajouter une série',
    'workout.addWarmup': '+ Échauffement',
    'workout.warmupShort': 'É',
    'workout.markWarmup': 'Marquer comme échauffement',
    'workout.unmarkWarmup': 'Série d’échauffement — toucher pour la compter comme série effective',
    'workout.weightAria': 'Poids de la série {index}',
    'workout.repsAria': 'Répétitions de la série {index}',
    'workout.completeSet': 'Valider cette série',
    'workout.undoSet': 'Annuler cette série',
    'workout.needReps': 'Saisissez d’abord les répétitions',
    'workout.rpeTitle': 'Effort perçu (RPE)',
    'workout.rpeClear': 'Effacer',
    'workout.rpeNone': 'Aucun RPE enregistré',
    'workout.rpeFailure': 'Plus aucune répétition en réserve',
    'workout.rpeOne': 'Une répétition en réserve',
    'workout.rpeTwo': 'Deux répétitions en réserve',
    'workout.rpeEasy': 'Bien avant l’échec',
    'workout.viewHistory': 'Historique et records',
    'workout.plateCalculator': 'Calcul des disques',
    'workout.moveUp': 'Monter',
    'workout.moveDown': 'Descendre',
    'workout.removeExercise': 'Retirer de la séance',
    'workout.removeConfirm': 'Retirer {name} ?',
    'workout.removeConfirmHint': 'Ses séries dans cette séance seront supprimées.',
    'workout.renameWorkout': 'Renommer la séance',
    'workout.workoutName': 'Nom de la séance',
    'workout.discard': 'Abandonner la séance',
    'workout.discardConfirm': 'Abandonner cette séance ?',
    'workout.discardConfirmHint': 'Toutes les séries enregistrées seront supprimées. C’est irréversible.',
    'workout.discardAction': 'Abandonner',
    'workout.discarded': 'Séance abandonnée',
    'workout.nothingLogged': 'Rien d’enregistré',
    'workout.nothingLoggedHint': 'Cette séance ne contient aucune série validée. L’abandonner ?',
    'workout.finishConfirm': 'Terminer la séance ?',
    'workout.finishConfirmHint': '{sets} · {volume} {unit} de volume · {duration}.',
    'workout.finishAction': 'Terminer',
    'workout.saved': 'Séance enregistrée',
    'workout.renamed': 'Renommé',
    'workout.routineSaved': 'Programme enregistré',
    'workout.prWeight': 'série la plus lourde',
    'workout.pr1rm': 'meilleur 1RM estimé',
    'workout.prVolume': 'meilleur volume sur une série',
    'workout.prToast': '{name} : {record} !',

    'rest.label': 'Repos',
    'rest.skip': 'Passer',
    'rest.done': 'Repos terminé — série suivante',

    'history.title': 'Historique',
    'history.today': 'Aujourd’hui',
    'history.yesterday': 'Hier',
    'history.empty': 'Aucun historique',
    'history.emptyHint': 'Terminez une séance et elle sera classée ici.',
    'session.saveAsRoutine': 'Enregistrer comme programme',
    'session.deleteWorkout': 'Supprimer la séance',
    'session.deleteConfirm': 'Supprimer cette séance ?',
    'session.deleteConfirmHint': 'Ses séries seront retirées de votre historique et de vos records.',
    'session.deleted': 'Séance supprimée',

    'exercises.title': 'Exercices',
    'exercises.search': 'Rechercher un exercice',
    'exercises.neverTrained': 'jamais travaillé',
    'exercises.setsLogged': { one: '{count} série enregistrée', other: '{count} séries enregistrées' },
    'exercises.noMatchHint': 'Essayez une autre recherche, ou ajoutez un exercice personnalisé.',
    'exercises.pickerNoMatchHint': 'Ajoutez-le comme exercice personnalisé depuis l’onglet Exercices.',
    'exercises.favourite': 'Favori',
    'exercises.custom': 'personnalisé',
    'exercises.noHistory': 'Aucun historique',
    'exercises.noHistoryHint': 'Travaillez cet exercice dans une séance et ses records apparaîtront ici.',
    'exercises.sessionHistory': 'Historique des séances',
    'exercises.newTitle': 'Nouvel exercice',
    'exercises.editTitle': 'Modifier l’exercice',
    'exercises.namePlaceholder': 'ex. Rowing Pendlay',
    'exercises.muscleGroup': 'Groupe musculaire',
    'exercises.equipment': 'Matériel',
    'exercises.restLabel': 'Repos entre les séries (secondes)',
    'exercises.restPlaceholder': 'Utiliser la valeur par défaut',
    'exercises.notesPlaceholder': 'Réglages, hauteur du siège, prise…',
    'exercises.deleteConfirm': 'Supprimer {name} ?',
    'exercises.deleteConfirmHint': 'Les exercices déjà travaillés sont archivés à la place, pour que votre historique reste intact.',
    'exercises.archived': 'Archivé — historique conservé',
    'exercises.deleted': 'Supprimé',
    'exercises.updated': 'Exercice mis à jour',
    'exercises.added': 'Exercice ajouté',

    'routine.newTitle': 'Nouveau programme',
    'routine.editTitle': 'Modifier le programme',
    'routine.edit': 'Modifier le programme',
    'routine.namePlaceholder': 'ex. Haut du corps A',
    'routine.description': 'Description',
    'routine.descriptionPlaceholder': 'Facultatif',
    'routine.exercises': 'Exercices',
    'routine.addExercise': 'Ajouter un exercice',
    'routine.addToRoutine': 'Ajouter au programme',
    'routine.save': 'Enregistrer le programme',
    'routine.noExercises': 'Aucun exercice',
    'routine.noExercisesHint': 'Ajoutez les mouvements que ce programme doit proposer.',
    'routine.needExercise': 'Ajoutez au moins un exercice',
    'routine.deleteConfirm': 'Supprimer {name} ?',
    'routine.deleteConfirmHint': 'Les séances déjà enregistrées à partir de ce programme ne sont pas affectées.',
    'routine.deleted': 'Programme supprimé',
    'routine.created': 'Programme créé',
    'routine.updated': 'Programme mis à jour',
    'routine.setsAria': 'Séries pour {name}',
    'routine.repsAria': 'Répétitions pour {name}',

    'progress.title': 'Progrès',
    'progress.range30': '30 j',
    'progress.range90': '90 j',
    'progress.range365': '1 an',
    'progress.rangeAria': 'Période',
    'progress.empty': 'Rien sur cette période',
    'progress.emptyHint': 'Enregistrez une séance, ou élargissez la période, pour voir vos tendances.',
    'progress.weeklyVolume': 'Volume hebdomadaire',
    'progress.weeklyVolumeSub': 'Tonnage des séries effectives par semaine, en {unit}.',
    'progress.muscleSplit': 'Répartition musculaire',
    'progress.muscleSplitSub': 'Part des séries effectives — le test d’équilibre.',
    'progress.mostTrained': 'Les plus travaillés',
    'progress.bodyWeight': 'Poids de corps',
    'progress.bodyWeightSub': 'Enregistré depuis les Réglages, en {unit}.',
    'progress.oneRepMax': '1RM estimé',
    'progress.oneRepMaxSub': 'Meilleure série de chaque séance, en {unit} (estimation d’Epley).',
    'progress.noVolume': 'Aucun volume enregistré sur cette période.',
    'progress.nothingLogged': 'Rien d’enregistré sur cette période.',
    'progress.notEnough': 'Pas encore assez d’historique pour tracer un graphique.',
    'progress.showNumbers': 'Afficher les chiffres',
    'progress.colWeekOf': 'Semaine du',
    'progress.colVolume': 'Volume ({unit})',
    'progress.colSets': 'Séries',
    'progress.colDate': 'Date',
    'progress.colTopSet': 'Meilleure série',
    'progress.col1rm': '1RM est. ({unit})',
    'progress.barChartAria': 'Diagramme en barres, {count} périodes',
    'progress.lineChartAria': 'Courbe, {count} points',
    'progress.donutAria': 'Diagramme en anneau, {count} catégories',
    'progress.other': 'Autre',
    'progress.tooltipVolume': '{volume} {unit}',
    'progress.tooltipWeek': '{sets} · semaine du {date}',
    'progress.tooltip1rm': '{value} 1RM est.',

    'settings.title': 'Réglages',
    'settings.language': 'Langue',
    'settings.languageHint': 'Change tous les libellés de l’application.',
    'settings.training': 'Entraînement',
    'settings.units': 'Unités',
    'settings.unitsHint': 'Les poids sont stockés en kilogrammes puis convertis à l’affichage.',
    'settings.defaultRest': 'Repos par défaut',
    'settings.defaultRestHint': 'Utilisé quand un exercice n’a pas son propre temps de repos.',
    'settings.rest60': '60 s',
    'settings.rest90': '90 s',
    'settings.rest120': '2 min',
    'settings.rest180': '3 min',
    'settings.autoRest': 'Démarrage auto du repos',
    'settings.autoRestHint': 'Le décompte démarre dès que vous validez une série.',
    'settings.vibrate': 'Vibrer à la fin du repos',
    'settings.vibrateHint': 'Nécessite un appareil doté d’un vibreur.',
    'settings.sound': 'Bip à la fin du repos',
    'settings.soundHint': 'Une tonalité brève, même écran éteint.',
    'settings.wakeLock': 'Garder l’écran allumé',
    'settings.wakeLockHint': 'Maintient l’écran actif pendant une séance.',
    'settings.appearance': 'Apparence',
    'settings.theme': 'Thème',
    'settings.themeAuto': 'Auto',
    'settings.themeLight': 'Clair',
    'settings.themeDark': 'Sombre',
    'settings.accent': 'Couleur d’accent',
    'settings.accentAria': 'Accent {name}',
    'settings.bodyWeight': 'Poids de corps',
    'settings.bodyWeightPlaceholder': 'Poids du jour',
    'settings.logWeight': 'Enregistrer',
    'settings.weightLogged': 'Poids de corps enregistré',
    'settings.needWeight': 'Saisissez d’abord un poids',
    'settings.noWeightEntries': 'Aucune entrée. Enregistrer votre poids ajoute une courbe dans Progrès.',
    'settings.deleteEntry': 'Supprimer l’entrée',
    'settings.yourData': 'Vos données',
    'settings.dataHint': 'Tout vit dans ce navigateur. Exportez une sauvegarde avant d’effacer les données du site ou de changer d’appareil.',
    'settings.exportSqlite': 'Exporter la base (.sqlite)',
    'settings.exportJson': 'Exporter en JSON',
    'settings.import': 'Importer une sauvegarde .sqlite',
    'settings.reset': 'Tout réinitialiser',
    'settings.about': 'À propos',
    'settings.aboutPartOf': '<strong>miFitness</strong> — fait partie de <a href="../">miApps</a>.',
    'settings.aboutStorage': '{workouts} · {sets} · {volume} {unit} soulevés, le tout stocké dans ce navigateur.',
    'data.backupDownloaded': 'Sauvegarde téléchargée',
    'data.jsonExported': 'JSON exporté',
    'data.importConfirm': 'Remplacer vos données ?',
    'data.importConfirmHint': 'Importer {name} remplacera tout ce qui est actuellement stocké sur cet appareil.',
    'data.import': 'Importer',
    'data.restored': 'Sauvegarde restaurée',
    'data.importFailed': 'Échec de l’import : {error}',
    'data.resetConfirm': 'Tout réinitialiser ?',
    'data.resetConfirmHint': 'Chaque séance, programme et exercice personnalisé sera supprimé, et la bibliothèque d’origine reviendra. Exportez une sauvegarde si vous pourriez en avoir besoin.',
    'data.resetAction': 'Tout supprimer',
    'data.resetDone': 'Réinitialisation terminée',

    'group.Chest': 'Pectoraux',
    'group.Back': 'Dos',
    'group.Shoulders': 'Épaules',
    'group.Biceps': 'Biceps',
    'group.Triceps': 'Triceps',
    'group.Quads': 'Quadriceps',
    'group.Hamstrings & Glutes': 'Ischios & Fessiers',
    'group.Calves': 'Mollets',
    'group.Core': 'Abdominaux',
    'group.Cardio': 'Cardio',
    'group.Other': 'Autre',
    'equipment.Barbell': 'Barre',
    'equipment.Dumbbell': 'Haltères',
    'equipment.Machine': 'Machine',
    'equipment.Cable': 'Poulie',
    'equipment.Bodyweight': 'Poids du corps',
    'equipment.Kettlebell': 'Kettlebell',
    'equipment.Band': 'Élastique',
    'equipment.Other': 'Autre',

    // Seeded exercise names, keyed by their stable slug id. Only used when the
    // stored name is still the untouched English seed name.
    'seed.barbell-bent-over-row': 'Rowing barre buste penché',
    'seed.chest-supported-t-bar-row': 'Rowing T-bar avec appui pectoral',
    'seed.conventional-deadlift': 'Soulevé de terre classique',
    'seed.neutral-grip-lat-pulldown': 'Tirage vertical prise neutre',
    'seed.pull-up': 'Traction',
    'seed.seated-cable-row': 'Rowing assis à la poulie',
    'seed.single-arm-dumbbell-row': 'Rowing haltère à un bras',
    'seed.cable-hammer-curl': 'Curl marteau à la poulie',
    'seed.ez-bar-preacher-curl': 'Curl au pupitre à la barre EZ',
    'seed.standing-incline-dumbbell-curl': 'Curl incliné aux haltères',
    'seed.seated-calf-raise': 'Extension mollets assis',
    'seed.standing-calf-raise': 'Extension mollets debout',
    'seed.dips-chest-leaning': 'Dips (buste penché)',
    'seed.flat-barbell-bench-press': 'Développé couché à la barre',
    'seed.incline-dumbbell-press': 'Développé incliné aux haltères',
    'seed.low-to-high-cable-flye': 'Écarté à la poulie basse',
    'seed.machine-chest-press': 'Développé à la machine',
    'seed.cable-crunch': 'Crunch à la poulie',
    'seed.hanging-leg-raise': 'Relevé de jambes suspendu',
    'seed.plank': 'Gainage',
    'seed.barbell-hip-thrust': 'Hip thrust à la barre',
    'seed.lying-leg-curl': 'Leg curl allongé',
    'seed.romanian-deadlift': 'Soulevé de terre roumain',
    'seed.seated-leg-curl': 'Leg curl assis',
    'seed.barbell-high-bar-back-squat': 'Squat barre haute',
    'seed.bulgarian-split-squat': 'Fente bulgare',
    'seed.hack-squat': 'Hack squat',
    'seed.leg-press': 'Presse à cuisses',
    'seed.seated-leg-extension': 'Leg extension assis',
    'seed.dumbbell-lateral-raise': 'Élévation latérale aux haltères',
    'seed.incline-rear-delt-dumbbell-flye': 'Oiseau incliné aux haltères',
    'seed.seated-dumbbell-overhead-press': 'Développé militaire assis aux haltères',
    'seed.standing-cable-lateral-raise': 'Élévation latérale à la poulie',
    'seed.standing-overhead-press': 'Développé militaire debout',
    'seed.close-grip-bench-press': 'Développé couché prise serrée',
    'seed.dual-rope-cable-triceps-pushdown': 'Extension triceps à la corde',
    'seed.overhead-cable-triceps-extension': 'Extension triceps au-dessus de la tête',
    'seed.skull-crusher': 'Barre au front',

    // Starter routines, keyed by their stable id.
    'seed.routine-push': 'Séance Poussée',
    'seed.routine-pull': 'Séance Tirage',
    'seed.routine-legs': 'Séance Jambes',
    'seedDesc.routine-push': 'Pectoraux, épaules et triceps.',
    'seedDesc.routine-pull': 'Dos et biceps.',
    'seedDesc.routine-legs': 'Quadriceps, ischios et mollets.'
};

const CATALOGS = { en, fr };

let locale = 'en';
let pluralRules = new Intl.PluralRules('en');

/** The browser's preference, when we have a catalog for it. */
export const detectLocale = () => {
    const tags = globalThis.navigator?.languages?.length
        ? globalThis.navigator.languages
        : [globalThis.navigator?.language].filter(Boolean);
    for (const tag of tags) {
        const base = String(tag).toLowerCase().split('-')[0];
        if (CATALOGS[base]) return base;
    }
    return 'en';
};

export const getLocale = () => locale;

export const setLocale = (next) => {
    locale = CATALOGS[next] ? next : 'en';
    pluralRules = new Intl.PluralRules(intlLocale());
    if (globalThis.document) globalThis.document.documentElement.lang = locale;
    return locale;
};

/**
 * The tag to hand to Intl. A viewer whose browser is set to fr-CA keeps
 * Canadian date formatting when they pick French.
 */
export const intlLocale = () => {
    const tags = globalThis.navigator?.languages || [];
    const regional = [...tags].find((tag) => String(tag).toLowerCase().startsWith(locale));
    return regional || locale;
};

const interpolate = (text, params) => (params
    ? text.replace(/\{(\w+)\}/g, (match, key) => (key in params ? String(params[key]) : match))
    : text);

const lookup = (key) => {
    const entry = CATALOGS[locale][key];
    return entry === undefined ? CATALOGS.en[key] : entry;
};

/** Translate `key`, interpolating `{placeholders}` from `params`. */
export const t = (key, params) => {
    const entry = lookup(key);
    if (entry === undefined) return key; // a missing key should be obvious, not blank
    if (typeof entry === 'string') return interpolate(entry, params);
    // Plural entry: pick the form for params.count.
    const count = Number(params?.count ?? 0);
    const form = entry[pluralRules.select(count)] ?? entry.other;
    return interpolate(form, params);
};

/** Shorthand for the common `{ count }` case. */
export const tn = (key, count, params = {}) => t(key, { ...params, count });

export const tGroup = (group) => (group ? t(`group.${group}`) : '');
export const tEquipment = (equipment) => (equipment ? t(`equipment.${equipment}`) : '');

/**
 * Display text for a seeded row. A row only gets a translated name while its
 * stored text is still exactly what the seed wrote — the moment the user
 * renames it, their wording wins in every locale. Custom rows carry random
 * ids that are never in `canonical`, so they fall through untouched.
 */
const seedText = (prefix, id, stored, canonical = {}) => {
    if (locale === 'en' || !id || !stored || stored !== canonical[id]) return stored;
    return CATALOGS[locale][`${prefix}.${id}`] || stored;
};

export const seedName = (id, stored, canonical) => seedText('seed', id, stored, canonical);

export const seedDescription = (id, stored, canonical) => seedText('seedDesc', id, stored, canonical);

/**
 * Fill in every element carrying a data-i18n* attribute. Runs on boot and
 * again whenever the locale changes, so the static markup never goes stale.
 *
 * `data-i18n-html` writes markup instead of text, for the one or two strings
 * that wrap part of themselves in a link. It is only ever fed catalog entries
 * from this file — never anything a user typed.
 */
export const applyStaticStrings = (root = globalThis.document) => {
    if (!root) return;
    const attributes = [
        ['data-i18n', (node, value) => { node.textContent = value; }],
        ['data-i18n-html', (node, value) => { node.innerHTML = value; }],
        ['data-i18n-placeholder', (node, value) => node.setAttribute('placeholder', value)],
        ['data-i18n-title', (node, value) => node.setAttribute('title', value)],
        ['data-i18n-aria-label', (node, value) => node.setAttribute('aria-label', value)]
    ];
    for (const [attribute, apply] of attributes) {
        for (const node of root.querySelectorAll(`[${attribute}]`)) {
            apply(node, t(node.getAttribute(attribute)));
        }
    }
};

// Exposed for the tests, which check the two catalogs stay in step.
export const catalogs = CATALOGS;
