/**
 * Auth Route Tests
 */

import request from 'supertest';
import express, { Express } from 'express';

// Mock auth service
const mockRegister = jest.fn();
const mockLogin = jest.fn();
const mockRefreshToken = jest.fn();
const mockLogout = jest.fn();
const mockGetUserById = jest.fn();
const mockUpdateUser = jest.fn();

jest.mock('../../services/teams.js', () => ({
  __esModule: true,
  default: {
    claimPendingInvites: jest.fn().mockResolvedValue(0),
  },
}));

jest.mock('../../services/auth.js', () => ({
  __esModule: true,
  default: {
    register: mockRegister,
    login: mockLogin,
    refreshToken: mockRefreshToken,
    logout: mockLogout,
    getUserById: mockGetUserById,
    updateUser: mockUpdateUser,
  },
}));

// Mock auth middleware - using plain JS callback to avoid ts-jest transformation issues
jest.mock('../../middleware/auth.js', () => ({
  authenticate: function(req: any, _res: any, next: any) {
    req.user = { userId: 'test-user-id', email: 'test@example.com' };
    next();
  },
}));

// Import routes after mocking
import authRoutes from '../../routes/auth.js';
import { errorHandler } from '../../middleware/error.js';

let app: Express;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api/v1/auth', authRoutes);
  app.use(errorHandler);
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Auth Routes', () => {
  describe('POST /api/v1/auth/register', () => {
    const validRegistration = {
      email: 'newuser@example.com',
      password: 'securepassword123',
      name: 'New User',
      tradeType: 'electrician',
    };

    it('should register a new user successfully', async () => {
      const mockResponse = {
        user: {
          id: 'user-123',
          email: validRegistration.email,
          name: validRegistration.name,
          tradeType: validRegistration.tradeType,
          isVerified: false,
          isActive: true,
        },
        tokens: {
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token',
          expiresIn: 900,
        },
      };

      mockRegister.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(validRegistration);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        success: true,
        data: {
          user: { email: validRegistration.email },
          tokens: { accessToken: 'mock-access-token' },
        },
        message: 'Registration successful. Please verify your email.',
      });
    });

    it('should reject invalid email format', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({ ...validRegistration, email: 'invalid-email' });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: 'VALIDATION_ERROR',
      });
    });

    it('should reject password shorter than 8 characters', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({ ...validRegistration, password: 'short' });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Password must be at least 8 characters',
      });
    });

    it('should handle duplicate email error', async () => {
      const error = new Error('Email already exists') as any;
      error.statusCode = 409;
      error.code = 'EMAIL_EXISTS';
      mockRegister.mockRejectedValue(error);

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(validRegistration);

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        success: false,
        error: 'EMAIL_EXISTS',
      });
    });
  });

  describe('POST /api/v1/auth/login', () => {
    const validLogin = {
      email: 'user@example.com',
      password: 'securepassword123',
    };

    it('should login user successfully', async () => {
      const mockResponse = {
        user: {
          id: 'user-123',
          email: validLogin.email,
          name: 'Test User',
        },
        tokens: {
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token',
          expiresIn: 900,
        },
      };

      mockLogin.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(validLogin);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: {
          user: { email: validLogin.email },
          tokens: { accessToken: 'mock-access-token' },
        },
        message: 'Login successful',
      });
    });

    it('should reject invalid credentials', async () => {
      const error = new Error('Invalid credentials') as any;
      error.statusCode = 401;
      error.code = 'INVALID_CREDENTIALS';
      mockLogin.mockRejectedValue(error);

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(validLogin);

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        success: false,
        error: 'INVALID_CREDENTIALS',
      });
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('should refresh token successfully', async () => {
      const mockTokens = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresIn: 900,
      };

      mockRefreshToken.mockResolvedValue(mockTokens);

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'valid-refresh-token' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: { tokens: mockTokens },
        message: 'Token refreshed successfully',
      });
    });

    it('should reject missing refresh token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: 'VALIDATION_ERROR',
      });
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return current user profile', async () => {
      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Test User',
        tradeType: 'electrician',
      };

      mockGetUserById.mockResolvedValue(mockUser);

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: { user: mockUser },
      });
    });

    it('should return 404 when user not found', async () => {
      mockGetUserById.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer mock-token');

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        success: false,
        error: 'USER_NOT_FOUND',
      });
    });
  });

  describe('PUT /api/v1/auth/me', () => {
    it('should update user profile successfully', async () => {
      const updates = { name: 'Updated Name', tradeType: 'plumber' };
      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Updated Name',
        tradeType: 'plumber',
      };

      mockUpdateUser.mockResolvedValue(mockUser);

      const response = await request(app)
        .put('/api/v1/auth/me')
        .set('Authorization', 'Bearer mock-token')
        .send(updates);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: { user: mockUser },
        message: 'Profile updated successfully',
      });
    });
  });
});
