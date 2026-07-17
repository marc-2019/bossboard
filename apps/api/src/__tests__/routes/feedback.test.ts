/**
 * Feedback Route Tests
 */

import request from 'supertest';
import express, { Express } from 'express';

// Mock services
const mockCreateFeedback = jest.fn();
const mockListFeedback = jest.fn();
const mockExportFeedback = jest.fn();
const mockUpdateFeedbackStatus = jest.fn();

jest.mock('../../services/feedback.js', () => ({
  __esModule: true,
  default: {
    createFeedback: mockCreateFeedback,
    listFeedback: mockListFeedback,
    exportFeedback: mockExportFeedback,
    updateFeedbackStatus: mockUpdateFeedbackStatus,
  },
}));

jest.mock('../../middleware/auth.js', () => ({
  authenticate: function (req: any, _res: any, next: any) {
    req.user = { userId: 'test-user-id', email: 'test@example.com' };
    next();
  },
}));

jest.mock('../../middleware/serviceToken.js', () => ({
  authenticateServiceToken: function (_req: any, _res: any, next: any) {
    next();
  },
}));

import feedbackRoutes from '../../routes/feedback.js';
import { errorHandler } from '../../middleware/error.js';

let app: Express;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api/v1/feedback', feedbackRoutes);
  app.use(errorHandler);
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Feedback Routes', () => {
  describe('POST /api/v1/feedback', () => {
    it('should create feedback with category and message', async () => {
      const mockFeedback = { id: 'fb-1', category: 'bug', message: 'Invoice totals look wrong', status: 'new' };
      mockCreateFeedback.mockResolvedValue(mockFeedback);

      const response = await request(app)
        .post('/api/v1/feedback')
        .send({ category: 'bug', message: 'Invoice totals look wrong' });

      expect(response.status).toBe(201);
      expect(response.body.data.feedback.id).toBe('fb-1');
      expect(mockCreateFeedback).toHaveBeenCalledWith('test-user-id', {
        category: 'bug',
        message: 'Invoice totals look wrong',
      });
    });

    it('should accept optional rating, pageContext and appVersion', async () => {
      mockCreateFeedback.mockResolvedValue({ id: 'fb-2', status: 'new' });

      const response = await request(app)
        .post('/api/v1/feedback')
        .send({
          category: 'idea',
          message: 'Add GST summary to dashboard',
          rating: 4,
          pageContext: '/dashboard',
          appVersion: 'web-0.5.1',
        });

      expect(response.status).toBe(201);
      expect(mockCreateFeedback).toHaveBeenCalledWith('test-user-id', expect.objectContaining({
        rating: 4,
        pageContext: '/dashboard',
        appVersion: 'web-0.5.1',
      }));
    });

    it('should reject missing message', async () => {
      const response = await request(app)
        .post('/api/v1/feedback')
        .send({ category: 'bug' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(mockCreateFeedback).not.toHaveBeenCalled();
    });

    it('should reject invalid category', async () => {
      const response = await request(app)
        .post('/api/v1/feedback')
        .send({ category: 'complaint', message: 'hello' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject out-of-range rating', async () => {
      const response = await request(app)
        .post('/api/v1/feedback')
        .send({ category: 'other', message: 'hello', rating: 6 });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should surface service errors with status codes', async () => {
      const error = { statusCode: 503, code: 'DB_UNAVAILABLE', message: 'Database unavailable' };
      mockCreateFeedback.mockRejectedValue(error);

      const response = await request(app)
        .post('/api/v1/feedback')
        .send({ category: 'bug', message: 'something broke' });

      expect(response.status).toBe(503);
      expect(response.body.error).toBe('DB_UNAVAILABLE');
    });
  });

  describe('GET /api/v1/feedback', () => {
    it('should list feedback for the authenticated user', async () => {
      mockListFeedback.mockResolvedValue({ feedback: [], total: 0 });

      const response = await request(app).get('/api/v1/feedback');

      expect(response.status).toBe(200);
      expect(response.body.data.feedback).toEqual([]);
      expect(response.body.data.total).toBe(0);
      expect(mockListFeedback).toHaveBeenCalledWith('test-user-id', expect.any(Object));
    });

    it('should pass filters to the service', async () => {
      mockListFeedback.mockResolvedValue({ feedback: [], total: 0 });

      await request(app).get('/api/v1/feedback?status=new&category=bug&limit=10&offset=5');

      expect(mockListFeedback).toHaveBeenCalledWith('test-user-id', expect.objectContaining({
        status: 'new',
        category: 'bug',
        limit: 10,
        offset: 5,
      }));
    });
  });

  describe('GET /api/v1/feedback/export', () => {
    it('should export feedback for the poller', async () => {
      mockExportFeedback.mockResolvedValue({
        feedback: [{ id: 'fb-1', status: 'new' }],
        total: 1,
      });

      const response = await request(app).get('/api/v1/feedback/export?status=new');

      expect(response.status).toBe(200);
      expect(response.body.data.total).toBe(1);
      expect(mockExportFeedback).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'new' })
      );
    });
  });

  describe('PATCH /api/v1/feedback/:id/status', () => {
    it('should ack status to ingested', async () => {
      mockUpdateFeedbackStatus.mockResolvedValue({
        id: 'fb-1',
        status: 'ingested',
      });

      const response = await request(app)
        .patch('/api/v1/feedback/fb-1/status')
        .send({ status: 'ingested' });

      expect(response.status).toBe(200);
      expect(response.body.data.feedback.status).toBe('ingested');
      expect(mockUpdateFeedbackStatus).toHaveBeenCalledWith('fb-1', 'ingested');
    });
  });
});
