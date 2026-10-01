// Vehicle scans (#363): the AI calls. They go through runVisionJSON / runTextJSON, so the
// master switch, the monthly spend cap (#361) and the AI run history (#362) apply as for every
// other scan. Nothing here saves: the caller prefills a form the user confirms.
import { runTextJSON, runVisionJSON } from './ollama';
import { extractPdfText, looksLikeScannedPdf } from './pdf';
import { pdfFirstPageJpeg } from './pdfThumb';
import { getPromptOverride } from './prompts';
import {
  FUEL_SCAN_PROMPT,
  FuelScanSchema,
  ODOMETER_SCAN_PROMPT,
  OdometerScanSchema,
  SERVICE_SCAN_PROMPT,
  ServiceScanSchema,
  type FuelScan,
  type OdometerScan,
  type ServiceScan,
  type VehicleScanKind,
} from './vehicleScan';

type ScanFor<K extends VehicleScanKind> = K extends 'fuel' ? FuelScan : K extends 'service' ? ServiceScan : OdometerScan;

const SPEC = {
  fuel: { schema: FuelScanSchema, prompt: FUEL_SCAN_PROMPT, key: 'vehicleFuel', ask: 'Extract the fuel purchase as JSON.' },
  service: { schema: ServiceScanSchema, prompt: SERVICE_SCAN_PROMPT, key: 'vehicleService', ask: 'Extract the service invoice as JSON, including its lines.' },
  odometer: { schema: OdometerScanSchema, prompt: ODOMETER_SCAN_PROMPT, key: null, ask: 'Read the odometer (ODO) as JSON.' },
} as const;

/**
 * Read a pump receipt, a garage invoice or a dashboard photo. A PDF with a text layer is read
 * as text (cheaper); a scanned PDF is rasterized and read like a photo.
 */
export async function scanVehicleFile<K extends VehicleScanKind>(kind: K, bytes: Buffer, ext: string): Promise<ScanFor<K>> {
  const spec = SPEC[kind];
  const prompt = (spec.key ? await getPromptOverride(spec.key) : null) ?? spec.prompt;
  const meta = { feature: 'vehicles' as const, trigger: 'user' as const };
  if (ext === 'pdf') {
    const text = await extractPdfText(bytes);
    if (!looksLikeScannedPdf(text)) {
      const { json } = await runTextJSON(prompt, `${spec.ask}\n\n${text}`, meta);
      return spec.schema.parse(json) as ScanFor<K>;
    }
    const img = await pdfFirstPageJpeg(bytes, 1654);
    if (!img) throw new Error('Could not read the PDF');
    bytes = img;
  }
  const { json } = await runVisionJSON(prompt, spec.ask, [bytes.toString('base64')], meta);
  return spec.schema.parse(json) as ScanFor<K>;
}
