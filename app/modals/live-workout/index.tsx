import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Edit2, Trash2, Plus, Timer, X, RotateCcw } from 'lucide-react-native';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/auth/store';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import LiveExerciseCard from '@/components/LiveExerciseCard';
import ExerciseModal from '@/components/ExerciseModal';
import ExerciseDetailsModal from '@/components/ExerciseDetailsModal';
import WorkoutNameModal from '@/components/WorkoutNameModal';
import ConfirmationModal from '@/components/ConfirmationModal';
import RestTimerModal from '@/components/RestTimerModal';
import { Audio } from 'expo-av';

type Exercise = {
  id: string;
  name: string;
  muscle: string;
  equipment: string;
  instructions?: string;
  video_url?: string;
  type?: string;
  difficulty?: string;
  sets: {
    id: string;
    weight: string;
    reps: string;
    completed: boolean;
    previousWeight?: string;
    previousReps?: string;
  }[];
};

export default function LiveWorkoutScreen() {
  const router = useRouter();
  const { template_id } = useLocalSearchParams();
  const { userProfile } = useAuthStore();

  // Workout state
  const [workoutName, setWorkoutName] = useState('New Workout');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [isWorkoutStarted, setIsWorkoutStarted] = useState(false);
  const [isWorkoutFinished, setIsWorkoutFinished] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Timers
  const [workoutDuration, setWorkoutDuration] = useState(0); // in seconds
  const [restTime, setRestTime] = useState(120); // default 2 minutes in seconds
  const [activeRestTime, setActiveRestTime] = useState(0);
  const [isRestTimerActive, setIsRestTimerActive] = useState(false);
  const [isTimerDone, setIsTimerDone] = useState(false);
  const [playSoundOnFinish, setPlaySoundOnFinish] = useState(true);

  // Sound
  const [sound, setSound] = useState<Audio.Sound | null>(null);

  // Modals
  const [showExerciseModal, setShowExerciseModal] = useState(false);
  const [showExerciseDetails, setShowExerciseDetails] = useState(false);
  const [showWorkoutNameModal, setShowWorkoutNameModal] = useState(false);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [showRestTimerModal, setShowRestTimerModal] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(
    null
  );

  // References
  const workoutTimerRef = useRef<NodeJS.Timeout | null>(null);
  const restTimerRef = useRef<NodeJS.Timeout | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Animated values
  const progressValue = useSharedValue(0);

  useEffect(() => {
    // Initialize workout
    if (template_id) {
      loadWorkoutTemplate(template_id as string);
    } else {
      setLoading(false);
    }

    // Load sounds
    loadSound();

    // Cleanup timers and sound on unmount
    return () => {
      if (workoutTimerRef.current) clearInterval(workoutTimerRef.current);
      if (restTimerRef.current) clearInterval(restTimerRef.current);
      
      // Unload sound
      sound?.unloadAsync();
    };
  }, [template_id]);

  // Load alarm sound
  const loadSound = async () => {
    try {
      const { sound } = await Audio.Sound.createAsync(
        require('@/assets/sounds/timer-alarm.mp3')
      );
      setSound(sound);
    } catch (error) {
      console.error('Error loading sound:', error);
    }
  };

  // Play alarm sound
  const playAlarmSound = async () => {
    if (sound && playSoundOnFinish) {
      try {
        await sound.setPositionAsync(0);
        await sound.playAsync();
      } catch (error) {
        console.error('Error playing sound:', error);
      }
    }
  };

  // Update progress bar based on completed sets
  useEffect(() => {
    const totalSets = exercises.reduce(
      (total, ex) => total + ex.sets.length,
      0
    );
    const completedSets = exercises.reduce(
      (total, ex) => total + ex.sets.filter((set) => set.completed).length,
      0
    );

    const progress = totalSets > 0 ? completedSets / totalSets : 0;
    progressValue.value = withTiming(progress, { duration: 300 });
  }, [exercises]);

  const loadWorkoutTemplate = async (templateId: string) => {
    try {
      setLoading(true);

      // Fetch template details
      const { data: template, error: templateError } = await supabase
        .from('workout_templates')
        .select('*')
        .eq('id', templateId)
        .single();

      if (templateError) throw templateError;

      if (template) {
        setWorkoutName(template.name);

        // Fetch exercises for the template
        const { data: templateExercises, error: exercisesError } =
          await supabase
            .from('template_exercises')
            .select(
              `
            id,
            exercise_id,
            exercises (
              id,
              name,
              muscle,
              equipment,
              instructions,
              video_url,
              type,
              difficulty
            ),
            template_exercise_sets (
              id,
              min_reps,
              max_reps,
              order
            )
          `
            )
            .eq('template_id', templateId)
            .order('order');

        if (exercisesError) throw exercisesError;

        if (templateExercises && templateExercises.length > 0) {
          // Process exercises and get previous performances
          const processedExercises = await Promise.all(
            templateExercises.map(async (item) => {
              // Get previous performance for this exercise
              const previousPerformance = await getPreviousPerformance(
                item.exercises.id
              );

              return {
                id: item.exercises.id,
                name: item.exercises.name,
                muscle: item.exercises.muscle,
                equipment: item.exercises.equipment,
                instructions: item.exercises.instructions,
                video_url: item.exercises.video_url,
                type: item.exercises.type,
                difficulty: item.exercises.difficulty,
                sets: item.template_exercise_sets.map((set, index) => {
                  const prevSet = previousPerformance[index] || {};
                  return {
                    id: set.id,
                    weight: '',
                    reps: '',
                    completed: false,
                    previousWeight: prevSet.weight || '0',
                    previousReps: prevSet.reps || '0',
                  };
                }),
              };
            })
          );

          setExercises(processedExercises);
        }
      }
    } catch (err: any) {
      console.error('Error loading workout template:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getPreviousPerformance = async (exerciseId: string) => {
    try {
      if (!userProfile?.id) return [];

      // Get the most recent workout where this exercise was performed
      const { data: workoutExercises, error: workoutError } = await supabase
        .from('workout_exercises')
        .select(`
          id,
          workout_id,
          workouts!inner (date)
        `)
        .eq('exercise_id', exerciseId)
        .eq('workouts.user_id', userProfile.id)
        .order('id', { ascending: false }) // Simplified ordering
        .limit(1);

      if (workoutError || !workoutExercises || workoutExercises.length === 0) {
        console.log("No previous workout exercises found:", workoutError?.message);
        return [];
      }

      // Get the sets for this exercise in that workout
      const { data: setData, error: setError } = await supabase
        .from('sets')
        .select('rep_count, weight, set_order')
        .eq('workout_exercise_id', workoutExercises[0].id)
        .order('set_order');

      if (setError) {
        console.log("Error fetching set data:", setError.message);
        return [];
      }

      // Format the set data to include both rep_count and weight
      return setData ? setData.map(set => ({
        reps: set.rep_count.toString(),
        weight: set.weight.toString(),
        set_order: set.set_order
      })) : [];
      
    } catch (error) {
      console.error('Error fetching previous performance:', error);
      return [];
    }
  };

  const startWorkout = () => {
    if (isWorkoutStarted) {
      // If already started, confirm finish
      if (hasIncompleteSets()) {
        setShowFinishModal(true);
      } else {
        finishWorkout();
      }
    } else {
      // Start workout and timer
      setIsWorkoutStarted(true);
      startWorkoutTimer();
    }
  };

  const startWorkoutTimer = () => {
    if (workoutTimerRef.current) clearInterval(workoutTimerRef.current);

    workoutTimerRef.current = setInterval(() => {
      setWorkoutDuration((prev) => prev + 1);
    }, 1000);
  };

  const startRestTimer = () => {
    if (restTimerRef.current) clearInterval(restTimerRef.current);

    setActiveRestTime(restTime);
    setIsRestTimerActive(true);
    setIsTimerDone(false);

    restTimerRef.current = setInterval(() => {
      setActiveRestTime((prev) => {
        if (prev <= 1) {
          // Timer completed
          clearInterval(restTimerRef.current!);
          setIsTimerDone(true);
          // Play sound when timer completes
          playAlarmSound();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const resetRestTimer = () => {
    if (restTimerRef.current) clearInterval(restTimerRef.current);
    setActiveRestTime(restTime);
    setIsTimerDone(false);
  };

  const hasIncompleteSets = () => {
    return exercises.some((ex) => ex.sets.some((set) => !set.completed));
  };

  const finishWorkout = async () => {
    if (!isWorkoutStarted || exercises.length === 0) {
      Alert.alert(
        'Cannot finish',
        'You need to start the workout and add exercises first.'
      );
      return;
    }

    try {
      setIsSaving(true);

      // Stop timers
      if (workoutTimerRef.current) clearInterval(workoutTimerRef.current);
      if (restTimerRef.current) clearInterval(restTimerRef.current);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Create workout record
      const { data: workout, error: workoutError } = await supabase
        .from('workouts')
        .insert({
          user_id: user.id,
          name: workoutName,
          date: new Date().toISOString(),
          duration: `${Math.floor(workoutDuration / 60)} minutes`,
          notes: '',
        })
        .select()
        .single();

      if (workoutError) throw workoutError;

      // Save each exercise and its sets
      for (const [index, exercise] of exercises.entries()) {
        // Only save exercises that have at least one completed set
        if (exercise.sets.some((set) => set.completed)) {
          // Create workout exercise record
          const { data: workoutExercise, error: exerciseError } = await supabase
            .from('workout_exercises')
            .insert({
              workout_id: workout.id,
              exercise_id: exercise.id,
              sets: exercise.sets.filter((set) => set.completed).length,
              order: index,
            })
            .select()
            .single();

          if (exerciseError) throw exerciseError;

          // Save completed sets
          const setsToSave = exercise.sets
            .filter((set) => set.completed)
            .map((set, setIndex) => ({
              workout_exercise_id: workoutExercise.id,
              rep_count: parseFloat(set.reps) || 0, // Parse as float to support decimal reps
              weight: parseFloat(set.weight) || 0,
              completed_at: new Date().toISOString(),
              set_order: setIndex,
            }));

          if (setsToSave.length > 0) {
            const { error: setsError } = await supabase
              .from('sets')
              .insert(setsToSave);

            if (setsError) throw setsError;
          }
        }
      }

      setIsWorkoutFinished(true);
      // Close modal and redirect to home screen
      setShowFinishModal(false);
      router.replace('/(tabs)');
    } catch (err: any) {
      console.error('Error saving workout:', err);
      Alert.alert('Error', `Failed to save workout: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const discardWorkout = () => {
    // Stop timers
    if (workoutTimerRef.current) clearInterval(workoutTimerRef.current);
    if (restTimerRef.current) clearInterval(restTimerRef.current);

    // Navigate back
    router.replace('/(tabs)');
  };

  const updateExerciseSet = (
    exerciseId: string,
    setIndex: number,
    field: 'weight' | 'reps' | 'completed',
    value: string | boolean
  ) => {
    setExercises(
      exercises.map((ex) => {
        if (ex.id === exerciseId) {
          const updatedSets = [...ex.sets];
          updatedSets[setIndex] = {
            ...updatedSets[setIndex],
            [field]: value,
          };

          // If set is marked as completed, start rest timer
          if (field === 'completed' && value === true) {
            startRestTimer();
          }

          return { ...ex, sets: updatedSets };
        }
        return ex;
      })
    );
  };

  const addSet = (exerciseId: string) => {
    setExercises(
      exercises.map((ex) => {
        if (ex.id === exerciseId) {
          const newSet = {
            id: Date.now().toString() + Math.random().toString(36).substring(2, 9), // Use unique ID
            weight: '',
            reps: '',
            completed: false,
            previousWeight: ex.sets[ex.sets.length - 1]?.previousWeight || '0',
            previousReps: ex.sets[ex.sets.length - 1]?.previousReps || '0',
          };
          return { ...ex, sets: [...ex.sets, newSet] };
        }
        return ex;
      })
    );
  };

  const removeSet = (exerciseId: string) => {
    setExercises(
      exercises.map((ex) => {
        if (ex.id === exerciseId && ex.sets.length > 1) {
          const newSets = [...ex.sets];
          newSets.pop();
          return { ...ex, sets: newSets };
        }
        return ex;
      })
    );
  };

  const removeExercise = (exerciseId: string) => {
    setExercises(exercises.filter((ex) => ex.id !== exerciseId));
  };

  const handleExerciseSelection = (selectedExercises: any[]) => {
    const newExercises = selectedExercises.map((ex) => ({
      id: ex.id,
      name: ex.name,
      muscle: ex.muscle,
      equipment: ex.equipment,
      instructions: ex.instructions,
      video_url: ex.video_url,
      type: ex.type,
      difficulty: ex.difficulty,
      sets: Array(4)
        .fill(null)
        .map(() => ({
          id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
          weight: '',
          reps: '',
          completed: false,
          previousWeight: '0',
          previousReps: '0',
        })),
    }));

    setExercises([...exercises, ...newExercises]);
    setShowExerciseModal(false);
  };

  const handleExerciseInfo = (exercise: Exercise) => {
    setSelectedExercise(exercise);
    setShowExerciseDetails(true);
  };

  const handleUpdateWorkoutName = (name: string) => {
    setWorkoutName(name);
    setShowWorkoutNameModal(false);
  };

  const reorderExercises = (fromIndex: number, toIndex: number) => {
    const reordered = [...exercises];
    const [removed] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, removed);
    setExercises(reordered);
  };

  const formatTime = (timeInSeconds: number) => {
    // Format as M:SS (no hours)
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = timeInSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatWorkoutTime = (timeInSeconds: number) => {
    const hours = Math.floor(timeInSeconds / 3600);
    const minutes = Math.floor((timeInSeconds % 3600) / 60);
    const seconds = timeInSeconds % 60;
    return `${hours.toString().padStart(1, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const progressBarStyle = useAnimatedStyle(() => {
    return {
      width: `${progressValue.value * 100}%`,
      height: 3,
      backgroundColor: '#14b8a6',
    };
  });

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#14b8a6" />
        <Text style={styles.loadingText}>Loading workout...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Pressable
            onPress={() =>
              isWorkoutStarted ? setShowDiscardModal(true) : router.back()
            }
            style={styles.backButton}
            hitSlop={8}
          >
            <ArrowLeft size={24} color="#5eead4" />
          </Pressable>

          <Text style={styles.timerText}>{formatWorkoutTime(workoutDuration)}</Text>

          <Pressable
            style={[
              styles.controlButton,
              isWorkoutStarted ? styles.finishButton : styles.startButton,
            ]}
            onPress={startWorkout}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#021a19" />
            ) : (
              <Text style={styles.controlButtonText}>
                {isWorkoutStarted ? 'Finish' : 'Start'}
              </Text>
            )}
          </Pressable>
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>{workoutName}</Text>
          <Pressable onPress={() => setShowWorkoutNameModal(true)} hitSlop={8}>
            <Edit2 size={18} color="#5eead4" />
          </Pressable>
        </View>

        <View style={styles.progressBarContainer}>
          <Animated.View style={progressBarStyle} />
        </View>
      </View>

      <GestureHandlerRootView style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={true}
          // Add passive flag to prevent scroll blocking warning
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          // Make the scrolling event listener passive
          onScroll={undefined}
        >
          {exercises.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                Add exercises to start your workout
              </Text>
            </View>
          ) : (
            exercises.map((exercise, index) => (
              <LiveExerciseCard
                key={exercise.id}
                exercise={exercise}
                index={index}
                onRemove={removeExercise}
                onSetUpdate={updateExerciseSet}
                onAddSet={addSet}
                onRemoveSet={removeSet}
                onInfo={() => handleExerciseInfo(exercise)}
                onReorder={reorderExercises}
                isInWorkout={true}
              />
            ))
          )}

          <View style={styles.buttonContainer}>
            <Pressable
              style={styles.addExerciseButton}
              onPress={() => setShowExerciseModal(true)}
            >
              <Plus size={20} color="#ccfbf1" />
              <Text style={styles.addExerciseText}>Add Exercise</Text>
            </Pressable>

            {isWorkoutStarted && (
              <Pressable
                style={styles.discardButton}
                onPress={() => setShowDiscardModal(true)}
              >
                <Trash2 size={20} color="#ef4444" />
                <Text style={styles.discardButtonText}>Discard Workout</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </GestureHandlerRootView>

      {/* Rest Timer Button - Always visible */}
      <Pressable
        style={[
          styles.restTimerButton, 
          isTimerDone && styles.restTimerButtonDone
        ]}
        onPress={() => setShowRestTimerModal(true)}
      >
        <Timer size={20} color="#ccfbf1" />
        <Text style={styles.restTimerText}>
          {isRestTimerActive || activeRestTime > 0 ? formatTime(activeRestTime) : formatTime(restTime)}
        </Text>
        <Pressable
          style={styles.resetRestTimer}
          onPress={resetRestTimer}
          hitSlop={8}
        >
          <RotateCcw size={16} color="#ccfbf1" />
        </Pressable>
      </Pressable>

      {/* Modals */}
      <ExerciseModal
        visible={showExerciseModal}
        onClose={() => setShowExerciseModal(false)}
        onSelect={handleExerciseSelection}
        excludeExercises={exercises.map((e) => e.id)}
      />

      <ExerciseDetailsModal
        visible={showExerciseDetails}
        onClose={() => setShowExerciseDetails(false)}
        exercise={selectedExercise}
      />

      <WorkoutNameModal
        visible={showWorkoutNameModal}
        onClose={() => setShowWorkoutNameModal(false)}
        onConfirm={handleUpdateWorkoutName}
        initialName={workoutName}
      />

      <ConfirmationModal
        visible={showDiscardModal}
        onClose={() => setShowDiscardModal(false)}
        onConfirm={discardWorkout}
        title="Discard Workout"
        message="Are you sure you want to discard this workout? All progress will be lost."
        confirmText="Discard"
        confirmColor="#ef4444"
      />

      <ConfirmationModal
        visible={showFinishModal}
        onClose={() => setShowFinishModal(false)}
        onConfirm={finishWorkout}
        title="Finish Workout"
        message="You have incomplete sets. Are you sure you want to finish the workout?"
        confirmText="Finish"
        confirmColor="#14b8a6"
      />

      <RestTimerModal
        visible={showRestTimerModal}
        onClose={() => setShowRestTimerModal(false)}
        currentTime={restTime}
        playSoundOnFinish={playSoundOnFinish}
        onSoundToggle={() => setPlaySoundOnFinish(!playSoundOnFinish)}
        onTimeSelected={(time) => {
          setRestTime(time);
          setActiveRestTime(time);
          setShowRestTimerModal(false);

          // Restart timer with new time
          if (isRestTimerActive) {
            if (restTimerRef.current) clearInterval(restTimerRef.current);
            startRestTimer();
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#021a19',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#021a19',
  },
  loadingText: {
    marginTop: 16,
    color: '#5eead4',
    fontSize: 16,
    fontFamily: 'Inter-Regular',
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: '#021a19',
    borderBottomWidth: 1,
    borderBottomColor: '#115e59',
    zIndex: 10,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timerText: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    color: '#ccfbf1',
  },
  controlButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  startButton: {
    backgroundColor: '#14b8a6',
  },
  finishButton: {
    backgroundColor: '#0d9488',
  },
  controlButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#021a19',
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: '#ccfbf1',
    textAlign: 'center',
  },
  progressBarContainer: {
    height: 3,
    width: '100%',
    backgroundColor: '#115e59',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 100,
  },
  emptyState: {
    backgroundColor: '#115e59',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyStateText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#5eead4',
    textAlign: 'center',
    marginBottom: 16,
  },
  buttonContainer: {
    gap: 16,
    marginBottom: 20,
  },
  addExerciseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0d3d56',
    borderRadius: 12,
    padding: 16,
  },
  addExerciseText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#ccfbf1',
    marginLeft: 8,
  },
  discardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#450a0a',
    borderRadius: 12,
    padding: 16,
  },
  discardButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#ef4444',
    marginLeft: 8,
  },
  restTimerButton: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    backgroundColor: '#14b8a6',
    borderRadius: 24,
    paddingVertical: 8,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    width: 140,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
  restTimerButtonDone: {
    backgroundColor: '#f97316', // Orange color when timer is done
  },
  restTimerText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#ccfbf1',
    marginLeft: 8,
    flex: 1,
    textAlign: 'center',
  },
  resetRestTimer: {
    padding: 4,
  },
  closeRestTimer: {
    marginLeft: 8,
    padding: 4,
  },
});