export type ExerciseType = "weight_reps" | "bodyweight_reps" | "time" | "cardio";

export const EXERCISE_TYPE_LABELS: Record<ExerciseType, string> = {
	weight_reps: "Weight × reps",
	bodyweight_reps: "Bodyweight reps",
	time: "Timed (e.g. plank)",
	cardio: "Cardio (distance + time)",
};

export const MUSCLE_GROUPS = [
	"Chest",
	"Back",
	"Shoulders",
	"Biceps",
	"Triceps",
	"Forearms",
	"Core",
	"Quads",
	"Hamstrings",
	"Glutes",
	"Calves",
	"Full body",
	"Cardio",
	"Other",
];

export interface Exercise {
	id: string;
	name: string;
	type: ExerciseType;
	muscleGroup: string;
	equipment?: string;
	notes?: string;
	createdAt: number;
}

/** Planned work for one exercise. Durations are in seconds, distances in km, weights in kg. */
export interface ExerciseTarget {
	sets: number;
	repsMin?: number;
	repsMax?: number;
	weight?: number;
	duration?: number;
	distance?: number;
}

export interface TemplateExercise extends ExerciseTarget {
	exerciseId: string;
}

export interface WorkoutTemplate {
	id: string;
	name: string;
	exercises: TemplateExercise[];
	notes?: string;
	createdAt: number;
}

export interface SetEntry {
	weight?: number;
	reps?: number;
	duration?: number;
	distance?: number;
	done: boolean;
}

export interface SessionExercise {
	exerciseId: string;
	sets: SetEntry[];
	target?: ExerciseTarget;
}

export interface WorkoutSession {
	id: string;
	name: string;
	templateId?: string;
	/** Local calendar date, YYYY-MM-DD. */
	date: string;
	startedAt: number;
	finishedAt?: number;
	exercises: SessionExercise[];
	notes?: string;
	notePath?: string;
}

export interface BodyweightEntry {
	/** YYYY-MM-DD; at most one entry per date. */
	date: string;
	weight: number;
}

export type RangeKey = "1m" | "3m" | "6m" | "1y" | "all";

export interface WorkoutSettings {
	notesFolder: string;
	createNotes: boolean;
	defaultRange: RangeKey;
	weekStartsMonday: boolean;
}

export interface WorkoutData {
	version: number;
	settings: WorkoutSettings;
	exercises: Exercise[];
	templates: WorkoutTemplate[];
	sessions: WorkoutSession[];
	activeSession: WorkoutSession | null;
	bodyweight: BodyweightEntry[];
}

export const DEFAULT_SETTINGS: WorkoutSettings = {
	notesFolder: "Workouts",
	createNotes: true,
	defaultRange: "3m",
	weekStartsMonday: true,
};
