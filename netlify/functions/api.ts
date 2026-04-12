import serverless from 'serverless-http';
import app from '../../src/interfaces/http/server';

export const handler = serverless(app);
