import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import journalRoutes from './routes/journalRoutes';
import metaRoutes from './routes/metaRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import subscriptionRoutes from './routes/subscriptionRoutes';
import uploadRoutes from './routes/uploadRoutes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.use('/api/journals', journalRoutes);
app.use('/api/meta', metaRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/upload', uploadRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

app.listen(PORT, () => {
  console.log(`API Server running on port ${PORT}`);
});
