// The product's photos (design 18-edit-product): the first is the cover. Hold and drag to
// reorder (react-native-draggable-flatlist, decision #57); tapping a photo always offers
// Make cover / Move left / Move right / Remove, so reordering works even without dragging.
// If the drag list fails to render on this phone, an error boundary shows a plain row.
import Feather from '@expo/vector-icons/Feather';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import type { PhotoInput } from './api';
import type { Picked } from '@/onboarding/photos';
import { DragBoundary } from '@/ui/dragBoundary';
import { colors, fonts, radii, spacing, text } from '@/theme';

export interface Slot {
  id: string;
  preview: string;
  status: 'uploading' | 'done' | 'failed';
  photo: PhotoInput | null;
  picked: Picked | null;
}

const TILE = 96;

function Tile({
  slot,
  cover,
  active = false,
  onPress,
  onLongPress,
}: {
  slot: Slot;
  cover: boolean;
  active?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        slot.status === 'failed'
          ? 'Photo failed to upload. Tap for options.'
          : cover
            ? 'Cover photo. Tap for options.'
            : 'Photo. Tap for options.'
      }
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={250}
      style={[styles.tile, cover && styles.tileCover, active && styles.tileActive]}
    >
      {slot.preview ? (
        <Image source={{ uri: slot.preview }} style={styles.image} resizeMode="cover" />
      ) : null}
      {slot.status === 'uploading' ? (
        <View style={styles.overlay}>
          <ActivityIndicator color={colors.textOnNavy} accessibilityLabel="Uploading" />
        </View>
      ) : slot.status === 'failed' ? (
        <View style={styles.overlay}>
          <Feather name="alert-circle" size={22} color={colors.textOnNavy} />
        </View>
      ) : null}
      {cover ? (
        <View style={styles.coverBand}>
          <Text style={styles.coverText}>COVER</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function AddTile({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add photos"
      onPress={onPress}
      style={({ pressed }) => [styles.tile, styles.add, pressed && styles.pressed]}
    >
      <Feather name="plus" size={24} color={colors.navy} />
      <Text style={styles.addText}>Add</Text>
    </Pressable>
  );
}

export function PhotoStrip({
  slots,
  canAdd,
  onAdd,
  onTap,
  onReorder,
  dragAvailable,
  onDragUnavailable,
}: {
  slots: Slot[];
  canAdd: boolean;
  onAdd: () => void;
  onTap: (slot: Slot, index: number) => void;
  onReorder: (slots: Slot[]) => void;
  dragAvailable: boolean;
  onDragUnavailable: () => void;
}) {
  const plain = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {slots.map((slot, i) => (
        <Tile key={slot.id} slot={slot} cover={i === 0} onPress={() => onTap(slot, i)} />
      ))}
      {canAdd ? <AddTile onPress={onAdd} /> : null}
    </ScrollView>
  );
  if (!dragAvailable) return plain;
  return (
    <DragBoundary fallback={plain} onFail={onDragUnavailable}>
      <GestureHandlerRootView>
        <DraggableFlatList
          horizontal
          data={slots}
          keyExtractor={(slot) => slot.id}
          onDragEnd={({ data }) => onReorder(data)}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
          renderItem={({ item, drag, isActive, getIndex }) => (
            <ScaleDecorator>
              <Tile
                slot={item}
                cover={getIndex() === 0}
                active={isActive}
                onPress={() => onTap(item, getIndex() ?? 0)}
                onLongPress={drag}
              />
            </ScaleDecorator>
          )}
          ListFooterComponent={canAdd ? <AddTile onPress={onAdd} /> : null}
        />
      </GestureHandlerRootView>
    </DragBoundary>
  );
}

const styles = StyleSheet.create({
  row: { paddingRight: spacing.md },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: radii.lg,
    backgroundColor: colors.beige,
    overflow: 'hidden',
    marginRight: spacing.md,
  },
  tileCover: { borderWidth: 2, borderColor: colors.navy },
  tileActive: { opacity: 0.85 },
  image: { width: '100%', height: '100%' },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(28,26,46,0.45)', // navy at 45%
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.navy,
    paddingVertical: 2,
    alignItems: 'center',
  },
  coverText: { ...text('small'), fontFamily: fonts.bold, color: colors.textOnNavy },
  add: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.toggleOff,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addText: { ...text('bodyStrong'), fontFamily: fonts.bold, color: colors.navy },
  pressed: { opacity: 0.85 },
});
