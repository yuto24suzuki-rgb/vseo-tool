import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import keywordsRouter from './routes/keywords';

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  })
);
app.use(express.json());

app.use('/api/keywords', keywordsRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('WARNING: ANTHROPIC_API_KEY is not set');
  }
  if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
    console.warn('WARNING: Google Ads API not configured — metrics will show as UNKNOWN');
  }
});

export default app;
