import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  visible: boolean;
  onClose: () => void;
  onPickCamera: () => void;
  onPickGallery: () => void;
}

/** Web-only camera/gallery chooser — native uses Alert.alert directly since it renders custom buttons fine there. */
export function PhotoSourceModal({ visible, onClose, onPickCamera, onPickGallery }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet}>
          <Text style={styles.title}>ფოტოს დამატება</Text>
          <TouchableOpacity style={styles.option} onPress={onPickCamera} activeOpacity={0.7}>
            <Ionicons name="camera-outline" size={20} color="#2563eb" />
            <Text style={styles.optionText}>კამერა</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.option} onPress={onPickGallery} activeOpacity={0.7}>
            <Ionicons name="images-outline" size={20} color="#2563eb" />
            <Text style={styles.optionText}>გალერეა</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.cancelText}>გაუქმება</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  sheet: {
    backgroundColor: '#fff', borderRadius: 16,
    width: '100%', maxWidth: 340,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
    overflow: 'hidden',
  },
  title: {
    fontSize: 13, fontWeight: '700', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.6,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderColor: '#f0f0f0',
  },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderColor: '#f5f5f5',
  },
  optionText: { fontSize: 15, color: '#1a1a2e', fontWeight: '600' },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center' },
  cancelText: { fontSize: 14, color: '#888', fontWeight: '600' },
});
