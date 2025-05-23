import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Search, ArrowLeft, X, Plus, ChevronRight } from 'lucide-react-native';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useProgramsStore } from '@/lib/store/programsStore';

type Program = {
  id: string;
  name: string;
  description: string | null;
  weekly_workouts: number;
  is_active: boolean;
  created_at: string;
};

export default function ProgramsScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMuscles, setSelectedMuscles] = useState<string[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { needsRefresh, setNeedsRefresh } = useProgramsStore();

  const muscleGroups = [
    'chest',
    'back',
    'shoulders',
    'legs',
    'core',
    'biceps',
    'triceps',
  ];

  useEffect(() => {
    fetchPrograms();
  }, [searchQuery, selectedMuscles]);

  // Refresh data when needsRefresh is true
  useEffect(() => {
    if (needsRefresh) {
      fetchPrograms();
      setNeedsRefresh(false);
    }
  }, [needsRefresh]);

  const fetchPrograms = async () => {
    try {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from('programs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (searchQuery) {
        query = query.ilike('name', `%${searchQuery}%`);
      }

      const { data, error: programsError } = await query;

      if (programsError) throw programsError;

      // Get workout counts for each program
      const enrichedPrograms = await Promise.all(
        (data || []).map(async (program) => {
          // Get the actual count of workouts in the program
          const { count: workoutCount, error: countError } = await supabase
            .from('program_workouts')
            .select('*', { count: 'exact', head: true })
            .eq('program_id', program.id);

          if (countError) {
            console.error('Error fetching workout count:', countError);
            return program;
          }

          return {
            ...program,
            weekly_workouts: workoutCount || 0,
          };
        })
      );

      setPrograms(enrichedPrograms);
    } catch (err: any) {
      console.error('Error fetching programs:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Pressable
            onPress={() => router.push('/(tabs)/action')}
            style={styles.backButton}
            hitSlop={8}
          >
            <ArrowLeft size={24} color="#5eead4" />
          </Pressable>
          <View style={styles.titleContainer}>
            <Text style={styles.title}>My Programs</Text>
            <Text style={styles.subtitle}>Manage your programs</Text>
          </View>
        </View>

        <View style={styles.searchContainer}>
          <Search size={20} color="#5eead4" />
          <TextInput
            style={[
              styles.searchInput,
              Platform.OS === 'web' && styles.searchInputWeb,
            ]}
            placeholder="Search programs..."
            placeholderTextColor="#5eead4"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      <ScrollView
        style={styles.programsList}
        contentContainerStyle={styles.programsListContent}
      >
        {loading ? (
          <Text style={styles.statusText}>Loading programs...</Text>
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : programs.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>No programs found</Text>
            <Text style={styles.emptyStateText}>
              Create your first training program to get started
            </Text>
          </View>
        ) : (
          programs.map((program) => (
            <Pressable
              key={program.id}
              style={styles.programCard}
              onPress={() => router.push(`/modals/programs/${program.id}`)}
            >
              <View style={styles.programInfo}>
                <Text style={styles.programName}>{program.name}</Text>
                <View style={styles.programDetails}>
                  <Text style={styles.workoutCount}>
                    {program.weekly_workouts} workouts/week
                  </Text>
                  <View
                    style={[
                      styles.statusBadge,
                      program.is_active
                        ? styles.activeBadge
                        : styles.inactiveBadge,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        program.is_active
                          ? styles.activeText
                          : styles.inactiveText,
                      ]}
                    >
                      {program.is_active ? 'Active' : 'Inactive'}
                    </Text>
                  </View>
                </View>
              </View>
              <ChevronRight size={20} color="#5eead4" />
            </Pressable>
          ))
        )}
      </ScrollView>

      <View style={styles.bottomButtonContainer}>
        <Pressable
          style={styles.newProgramButton}
          onPress={() => router.push('/modals/programs/new')}
        >
          <Plus size={20} color="#021a19" />
          <Text style={styles.newProgramButtonText}>New Program</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#021a19',
  },
  header: {
    paddingTop: Platform.OS === 'web' ? 40 : 60,
    paddingHorizontal: 24,
    backgroundColor: '#021a19',
    borderBottomWidth: 1,
    borderBottomColor: '#115e59',
    zIndex: 10,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  backButton: {
    marginRight: 16,
    marginTop: 4,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontFamily: 'Inter-Bold',
    color: '#ccfbf1',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#5eead4',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#115e59',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    color: '#ccfbf1',
    marginLeft: 12,
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    padding: 0,
  },
  searchInputWeb: {
    outlineStyle: 'none',
  },
  programsList: {
    flex: 1,
  },
  programsListContent: {
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 140 : 120,
  },
  programCard: {
    backgroundColor: '#115e59',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  programInfo: {
    flex: 1,
  },
  programName: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: '#ccfbf1',
    marginBottom: 8,
  },
  programDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  workoutCount: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#5eead4',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    height: 24, // Fixed height to contain text properly
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60, // Ensure minimum width for the badge
  },
  activeBadge: {
    backgroundColor: '#065f46',
  },
  inactiveBadge: {
    backgroundColor: '#450a0a',
  },
  statusText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
    lineHeight: 14, // Close to fontSize for better vertical centering
    includeFontPadding: false, // Removes extra padding in Android
  },
  activeText: {
    color: '#34d399',
  },
  inactiveText: {
    color: '#f87171',
  },
  emptyState: {
    alignItems: 'center',
    padding: 24,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: '#ccfbf1',
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#5eead4',
    textAlign: 'center',
  },
  statusText: {
    color: '#5eead4',
    textAlign: 'center',
    fontFamily: 'Inter-Regular',
  },
  errorText: {
    color: '#ef4444',
    textAlign: 'center',
    marginTop: 24,
    fontFamily: 'Inter-Regular',
  },
  bottomButtonContainer: {
    position: Platform.OS === 'web' ? 'fixed' : 'absolute',
    bottom: 24,
    left: 24,
    right: 24,
    backgroundColor: 'transparent',
    zIndex: 100,
  },
  newProgramButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#14b8a6',
    borderRadius: 16,
    padding: 16,
    gap: 8,
    minHeight: 56,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 8,
      },
    }),
  },
  newProgramButtonText: {
    color: '#021a19',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
});
