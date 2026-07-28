import { useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { C, RADIUS, scrim } from './theme';
import { Spinner } from './ui';

/**
 * Full-screen barcode scanner (P17).
 *
 * Kept as its own component rather than inlined in the shopping list, because the same
 * "point at a barcode, get a product" gesture belongs on inventory and price logging too,
 * and the parts that are easy to get wrong (permission states, scanning exactly once per
 * open, the supported symbologies) should only exist once.
 *
 * Retail barcodes only: EAN-13/8 is what European products carry, UPC-A/E covers US
 * imports. QR and the 2D formats are deliberately absent, since a QR code is never a
 * product in a product database and would just produce confusing lookups.
 *
 * The camera is mounted ONLY while the sheet is open, so nothing holds the hardware (or
 * the battery) in the background.
 */
const SYMBOLOGIES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const;

export function BarcodeScanner({
  visible,
  onClose,
  onScanned,
  busy = false,
  hint,
}: {
  visible: boolean;
  onClose: () => void;
  /** Fired at most once per open, with the raw code. */
  onScanned: (code: string) => void;
  /** Parent is resolving the code; keeps the sheet up with a spinner instead of flickering shut. */
  busy?: boolean;
  /** Optional line under the frame, e.g. a "not found" message from the last scan. */
  hint?: string | null;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  // One code per open. Without this the camera fires continuously while the barcode stays
  // in frame, which would spam the lookup and re-open the confirm sheet under the user.
  const [taken, setTaken] = useState(false);

  function close() {
    setTaken(false);
    onClose();
  }

  function handle(code: string) {
    if (taken || busy) return;
    const v = (code || '').trim();
    if (!v) return;
    setTaken(true);
    onScanned(v);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close} onShow={() => setTaken(false)}>
      <View style={s.wrap}>
        {!permission ? (
          <View style={s.center}><Spinner inline color={C.cyan} /></View>
        ) : !permission.granted ? (
          <View style={s.center}>
            <Text style={s.title}>Camera access needed</Text>
            <Text style={s.body}>
              {permission.canAskAgain
                ? 'Pharos uses the camera only while this scanner is open, to read a product barcode.'
                : 'Camera access is off for Pharos. Turn it on in your device settings to scan barcodes.'}
            </Text>
            {permission.canAskAgain && (
              <Pressable onPress={requestPermission} style={s.primary}>
                <Text style={s.primaryText}>Allow camera</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <CameraView
            style={StyleSheet.absoluteFill}
            barcodeScannerSettings={{ barcodeTypes: [...SYMBOLOGIES] }}
            onBarcodeScanned={taken || busy ? undefined : ({ data }) => handle(data)}
          />
        )}

        {permission?.granted && (
          <View style={s.overlay} pointerEvents="box-none">
            <View style={s.frame} />
            <Text style={s.caption}>
              {busy ? 'Looking it up…' : taken ? '' : 'Point at the barcode on the package'}
            </Text>
            {busy && <Spinner inline color={C.cyan} style={{ marginTop: 10 }} />}
            {!!hint && !busy && <Text style={s.hint}>{hint}</Text>}
            {taken && !busy && (
              <Pressable onPress={() => setTaken(false)} style={s.again}>
                <Text style={s.againText}>Scan another</Text>
              </Pressable>
            )}
          </View>
        )}

        <Pressable onPress={close} style={s.close} hitSlop={12}>
          <Text style={s.closeText}>✕</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
  title: { color: C.text, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  body: { color: C.dim, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  primary: { marginTop: 8, backgroundColor: C.accent, borderRadius: RADIUS.md, paddingVertical: 12, paddingHorizontal: 22 },
  primaryText: { color: C.onAccent, fontSize: 15, fontWeight: '700' },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: 24 },
  frame: { width: '78%', aspectRatio: 1.9, borderWidth: 2, borderColor: C.accent, borderRadius: RADIUS.lg, backgroundColor: 'transparent' },
  caption: { color: '#fff', fontSize: 14, marginTop: 18, textAlign: 'center' },
  hint: { color: C.gold, fontSize: 13, marginTop: 10, textAlign: 'center' },
  again: { marginTop: 14, borderWidth: 1, borderColor: C.border, borderRadius: RADIUS.md, paddingVertical: 10, paddingHorizontal: 18, backgroundColor: scrim },
  againText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  close: { position: 'absolute', top: 48, right: 20, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: scrim },
  closeText: { color: '#fff', fontSize: 18, lineHeight: 20 },
});
