import 'dotenv/config';

export const config = {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/contenthub',
  jwtSecret: process.env.JWT_SECRET || 'dev-access-secret',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  isProd: process.env.NODE_ENV === 'production',
  ai: {
    provider: process.env.AI_PROVIDER || 'mock',
    apiKey: process.env.AI_API_KEY || '',
    baseUrl: process.env.AI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.AI_MODEL || 'gpt-4o-mini',
  },
  wordsPerMinute: Number(process.env.WORDS_PER_MINUTE || 200),
  // Configurable trending weights (Section 17 of the brief)
  trending: { views: 1, likes: 3, comments: 4, bookmarks: 5, shares: 5, readingTime: 0.5, recencyMax: 50, halfLifeDays: 3 },
};
