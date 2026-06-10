/**
 * Migration: LocalStorage JSON export → MongoDB
 *
 * Usage:
 *   1. Στο network_tracker.html, ⋮ menu → Export JSON
 *   2. Save το αρχείο σαν tracker-export.json
 *   3. cd apps/web && npm run migrate -- path/to/tracker-export.json
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { connectDB } from '../apps/web/src/lib/db';
import { Item } from '../apps/web/src/models/Item';
import { Task } from '../apps/web/src/models/Task';
import { Phase } from '../apps/web/src/models/Phase';

interface TrackerExport {
  version: number;
  items: Array<{
    id: string;
    num: string;
    title: string;
    status: string;
    currentPrice: number;
    purchasedPrice: number | null;
    specs: string;
    notes: string;
    priceHistory: Array<{ price: number; store: string; date: string; url?: string }>;
    links: Array<{ label: string; url: string }>;
  }>;
  phases: Array<{
    id: string;
    num: string;
    title: string;
    status: string;
    content: string;
    notes: string;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    tags: string[];
    status: string;
    created: string;
    completed: string | null;
  }>;
}

async function migrate(jsonPath: string) {
  console.log(`📦 Reading ${jsonPath}...`);
  const raw = readFileSync(path.resolve(jsonPath), 'utf-8');
  const data: TrackerExport = JSON.parse(raw);

  console.log(`📊 Found: ${data.items.length} items, ${data.phases.length} phases, ${data.tasks.length} tasks`);
  console.log(`🔌 Connecting to MongoDB...`);
  await connectDB();

  // Migrate items
  console.log(`\n📥 Migrating items...`);
  for (const item of data.items) {
    await Item.findOneAndUpdate(
      { title: item.title },
      {
        num: item.num,
        title: item.title,
        status: item.status,
        currentPrice: item.currentPrice,
        purchasedPrice: item.purchasedPrice,
        specs: item.specs,
        notes: item.notes,
        priceHistory: item.priceHistory.map((p) => ({
          price: p.price,
          store: p.store,
          url: p.url ?? '',
          date: new Date(p.date),
        })),
        links: item.links,
      },
      { upsert: true, new: true }
    );
    process.stdout.write('.');
  }
  console.log(` ✓ ${data.items.length} items`);

  // Migrate phases
  console.log(`\n📥 Migrating phases...`);
  for (const phase of data.phases) {
    await Phase.findOneAndUpdate(
      { num: phase.num },
      {
        num: phase.num,
        title: phase.title,
        content: phase.content,
        notes: phase.notes,
        status: phase.status === 'in-progress' ? 'in-progress' : phase.status,
      },
      { upsert: true, new: true }
    );
    process.stdout.write('.');
  }
  console.log(` ✓ ${data.phases.length} phases`);

  // Migrate tasks
  console.log(`\n📥 Migrating tasks...`);
  for (const task of data.tasks) {
    await Task.findOneAndUpdate(
      { title: task.title },
      {
        title: task.title,
        tags: task.tags,
        status: task.status,
        completedAt: task.completed ? new Date(task.completed) : null,
      },
      { upsert: true, new: true }
    );
    process.stdout.write('.');
  }
  console.log(` ✓ ${data.tasks.length} tasks`);

  console.log(`\n✅ Migration complete!`);
  process.exit(0);
}

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error('Usage: tsx migrate.ts <path-to-tracker-export.json>');
  process.exit(1);
}

migrate(jsonPath).catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
