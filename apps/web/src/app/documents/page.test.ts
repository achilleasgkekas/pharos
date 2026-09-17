import { describe, it, expect, vi, beforeEach } from 'vitest';

const documentFindMock = vi.fn();
const getAppSettingsMock = vi.fn();

vi.mock('@/lib/db', () => ({ connectDB: async () => {} }));
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<any>) => fn() }));
vi.mock('@/lib/tenancy/connection', () => ({ currentModel: async (m: any) => m }));

vi.mock('@/models/Document', () => ({
  Document: {
    find: (filter?: any) => {
      documentFindMock(filter);
      return {
        sort: () => ({
          lean: async () => [{ _id: 'doc1', title: 'Test Document' }],
        }),
      };
    },
  },
}));

vi.mock('@/lib/appSettings', () => ({
  getAppSettings: async () => {
    getAppSettingsMock();
    return { documentAlertDays: 30 };
  },
}));

// We mock the client component so we don't need to render it deeply in a pure unit test.
vi.mock('./DocumentsClient', () => ({
  DocumentsClient: (props: any) => JSON.stringify(props),
}));

import DocumentsPage from './page';

describe('DocumentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes documents and leadDays to the client', async () => {
    const element = await DocumentsPage();
    const elementProps = element.props;

    // The component gets the documents from getData
    expect(elementProps.documents).toEqual([{ _id: 'doc1', title: 'Test Document' }]);
    expect(elementProps.leadDays).toBe(30);

    // Assert that find was called without an explicit soft-delete filter
    expect(documentFindMock).toHaveBeenCalledWith(undefined);
  });
});
