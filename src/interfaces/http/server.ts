import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import path from 'path';
import journalRoutes from './routes/journalRoutes';
import metaRoutes from './routes/metaRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import subscriptionRoutes from './routes/subscriptionRoutes';
import uploadRoutes from './routes/uploadRoutes';
import notificationRoutes from './routes/notificationRoutes';
import costCenterRoutes from './routes/costCenterRoutes';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.use('/api/journals', journalRoutes);
app.use('/api/meta', metaRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/cost-centers', costCenterRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

if (process.env.NODE_ENV !== 'production' && process.env.NETLIFY !== 'true') {
  app.listen(PORT, () => {
    console.log(`API Server running on port ${PORT}`);
  });
}

export default app;
