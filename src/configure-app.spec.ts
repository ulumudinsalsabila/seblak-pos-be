import { getAllowedOrigins } from './configure-app';

describe('getAllowedOrigins', () => {
  it('uses localhost by default', () => {
    expect(getAllowedOrigins({})).toEqual(['http://localhost:3000']);
  });

  it('combines, normalizes, and deduplicates configured origins', () => {
    expect(
      getAllowedOrigins({
        CORS_ORIGINS:
          'https://one.example/, https://two.example///,http://localhost:3000',
        FRONTEND_URL: 'https://one.example',
      }),
    ).toEqual([
      'https://one.example',
      'https://two.example',
      'http://localhost:3000',
    ]);
  });
});
