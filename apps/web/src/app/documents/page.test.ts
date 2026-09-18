import { describe, it, expect, vi, beforeEach } from 'vitest';

const { currentModelMock, documentFindMock, getAppSettingsMock } = vi.hoisted(() => {
  const documentFindMock = vi.fn();
  const getAppSettingsMock = vi.fn();
  const currentModelMock = vi.fn(async (model: any) => {
    if (model.__isDocumentMock) {
      return {
        find: (filter?: any) => {
          documentFindMock(filter);
          return {
            sort: () => ({
              lean: async () => [{ _id: 'doc1', title: 'Test Document' }],
            }),
          };
        },
      };
    }
    return model;
  });
  return { currentModelMock, documentFindMock, getAppSettingsMock };
});

vi.mock('@/lib/db', () => ({ connectDB: async () => {} }));
vi.mock('@/lib/tenancy/request', () => ({ withRequestTenant: async (fn: () => Promise<any>) => fn() }));

vi.mock('@/lib/tenancy/connection', () => ({ currentModel: currentModelMock }));

vi.mock('@/models/Document', () => ({
  Document: { __isDocumentMock: true },
}));

vi.mock('@/lib/appSettings', () => ({
  getAppSettings: async () => {
    getAppSettingsMock();
    return { documentAlertDays: 30 };
  },
}));

import DocumentsPage from './page';

describe('DocumentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes documents and leadDays to the client', async () => {
    const element = await DocumentsPage();
    const elementProps = element.props;

    expect(currentModelMock).toHaveBeenCalled();
    expect(elementProps.documents).toEqual([{ _id: 'doc1', title: 'Test Document' }]);
    expect(elementProps.leadDays).toBe(30);

    // Assert that find was called without an explicit soft-delete filter
    expect(documentFindMock).toHaveBeenCalledWith(undefined);
  });
});
