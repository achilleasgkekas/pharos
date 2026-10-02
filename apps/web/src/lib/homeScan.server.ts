// Home scans: the AI calls. They go through runVisionJSON / runTextJSON, so the master switch,
// the monthly spend cap and the AI run history apply as for every other scan.
import 'server-only';
import { runTextJSON, runVisionJSON } from './ollama';
import { extractPdfText, looksLikeScannedPdf } from './pdf';
import { pdfFirstPageJpeg } from './pdfThumb';
import { getPromptOverride } from './prompts';
import {
  BILL_SCAN_PROMPT,
  BillScanSchema,
  DOCUMENT_SCAN_PROMPT,
  DocumentScanSchema,
  METER_SCAN_PROMPT,
  MeterScanSchema,
  type BillScan,
  type DocumentScan,
  type HomeScanKind,
  type MeterScan,
} from './homeScan';

type ScanFor<K extends HomeScanKind> = K extends 'document' ? DocumentScan : K extends 'bill' ? BillScan : MeterScan;

const SPEC = {
  document: { schema: DocumentScanSchema, prompt: DOCUMENT_SCAN_PROMPT, key: 'document', feature: 'documents', ask: 'Read the document as JSON.' },
  bill: { schema: BillScanSchema, prompt: BILL_SCAN_PROMPT, key: 'bill', feature: 'bills', ask: 'Read the bill as JSON.' },
  meter: { schema: MeterScanSchema, prompt: METER_SCAN_PROMPT, key: 'meter', feature: 'meters', ask: 'Read the meter as JSON.' },
} as const;

/** Read a document, a bill or a meter photo. A PDF with a text layer is read as text (cheaper);
 *  a scanned PDF is rasterized and read like a photo. */
export async function scanHomeFile<K extends HomeScanKind>(kind: K, bytes: Buffer, ext: string): Promise<ScanFor<K>> {
  const spec = SPEC[kind];
  const prompt = (await getPromptOverride(spec.key)) ?? spec.prompt;
  const meta = { feature: spec.feature, trigger: 'user' as const };
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
