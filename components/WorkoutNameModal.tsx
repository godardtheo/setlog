import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  Platform,
} from 'react-native';
import { X } from 'lucide-react-native';
import { useState, useEffect } from 'react';
import Animated, {
  FadeIn,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated';

type Props = {
  visible: boolean;
  onClose: () => void;
  onConfirm: (name: string) => void;
  initialName: string;
};

export default function WorkoutNameModal({
  visible,
  onClose,
  onConfirm,
  initialName,
}: Props) {
  const [name, setName] = useState(initialName);

  // Reset to initial name when modal opens
  useEffect(() => {
    if (visible) {
      setName(initialName);
    }
  }, [visible, initialName]);

  const handleConfirm = () => {
    if (name.trim()) {
      onConfirm(name.trim());
    } else {
      onConfirm(initialName); // Fallback to initial name if empty
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      onRequestClose={onClose}
      animationType="fade"
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View
          style={styles.modalContainer}
          entering={SlideInDown.springify().damping(15)}
          exiting={SlideOutDown.springify().damping(15)}
        >
          <View style={styles.modalContent}>
            <View style={styles.header}>
              <Text style={styles.title}>Workout Name</Text>
              <Pressable
                onPress={onClose}
                style={styles.closeButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={24} color="#5eead4" />
              </Pressable>
            </View>

            <View style={styles.inputContainer}>
              <TextInput
                style={[styles.input, Platform.OS === 'web' && styles.inputWeb]}
                value={name}
                onChangeText={setName}
                placeholder="Enter workout name"
                placeholderTextColor="#5eead4"
                autoFocus
                selectTextOnFocus
              />
            </View>

            <View style={styles.actions}>
              <Pressable
                style={[styles.button, styles.cancelButton]}
                onPress={onClose}
              >
                <Text style={[styles.buttonText, styles.cancelButtonText]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                style={[styles.button, styles.confirmButton]}
                onPress={handleConfirm}
              >
                <Text style={[styles.buttonText, styles.confirmButtonText]}>
                  Save
                </Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 26, 25, 0.8)',
  },
  modalContainer: {
    width: '90%',
    maxWidth: 400,
    backgroundColor: '#115e59',
    borderRadius: 24,
    overflow: 'hidden',
  },
  modalContent: {
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
    color: '#ccfbf1',
  },
  closeButton: {
    padding: 4,
  },
  inputContainer: {
    marginBottom: 24,
  },
  input: {
    backgroundColor: '#0d3d56',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#ccfbf1',
  },
  inputWeb: {
    outlineStyle: 'none',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#0d3d56',
  },
  confirmButton: {
    backgroundColor: '#14b8a6',
  },
  buttonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
  cancelButtonText: {
    color: '#5eead4',
  },
  confirmButtonText: {
    color: '#021a19',
  },
});
