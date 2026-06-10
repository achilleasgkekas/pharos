// Runs once on first MongoDB startup
db = db.getSiblingDB('homepage');

// Items collection (shopping list, equipment, etc.)
db.createCollection('items');
db.items.createIndex({ status: 1 });
db.items.createIndex({ category: 1 });
db.items.createIndex({ tags: 1 });
db.items.createIndex({ purchasedAt: -1 });
db.items.createIndex({ title: 'text', specs: 'text', notes: 'text' });

// Tasks
db.createCollection('tasks');
db.tasks.createIndex({ status: 1 });
db.tasks.createIndex({ tags: 1 });
db.tasks.createIndex({ created: -1 });

// Phases (setup guide)
db.createCollection('phases');
db.phases.createIndex({ num: 1 });
db.phases.createIndex({ status: 1 });

// Price history - time-series data
db.createCollection('prices', {
  timeseries: {
    timeField: 'scrapedAt',
    metaField: 'meta',
    granularity: 'hours'
  }
});
db.prices.createIndex({ 'meta.itemId': 1, scrapedAt: -1 });
db.prices.createIndex({ 'meta.store': 1 });

// Receipts (metadata only; files in NAS)
db.createCollection('receipts');
db.receipts.createIndex({ date: -1 });
db.receipts.createIndex({ store: 1 });
db.receipts.createIndex({ itemIds: 1 });
db.receipts.createIndex({ total: 1 });

// Credit card statements
db.createCollection('statements');
db.statements.createIndex({ card: 1, period: 1 });
db.statements.createIndex({ 'transactions.date': -1 });

// Subscriptions (recurring expenses)
db.createCollection('subscriptions');
db.subscriptions.createIndex({ nextRenewal: 1 });
db.subscriptions.createIndex({ active: 1 });

print('✓ homepage database initialized with collections + indexes');
