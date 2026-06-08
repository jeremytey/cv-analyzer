import crypto from 'crypto';
import request from 'supertest';
import path from 'path';
import { app } from '../src/app';
import { prisma } from './setup';
import { describe, expect, test} from '@jest/globals';

const ANALYZE_URL = '/api/v1/analyze';
const FIXTURE_PDF = path.resolve(__dirname, 'fixtures/sample.pdf');
const FIXTURE_IMG = path.resolve(__dirname, 'fixtures/sample.png');

describe('POST /api/v1/analyze', () => {

  test('should return 202 with jobId and PENDING status on valid upload', async () => {
    const res = await request(app)
      .post(ANALYZE_URL)
      .attach('cv', FIXTURE_PDF)
      .field('jobDescription', 'Looking for a Node.js engineer with TypeScript and PostgreSQL experience.');

    expect(res.status).toBe(202);
    expect(res.body.data.jobId).toBeDefined();
    expect(typeof res.body.data.jobId).toBe('string');
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.createdAt).toBeDefined();
  });

  test('should return 400 when no file is attached', async () => {
    const res = await request(app)
      .post(ANALYZE_URL)
      .field('jobDescription', 'Node.js engineer role.');

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('error');
  });

  test('should return 400 when jobDescription is missing', async () => {
    const res = await request(app)
      .post(ANALYZE_URL)
      .attach('cv', FIXTURE_PDF);

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('error');
  });

  test('should return 400 when jobDescription is an empty string', async () => {
    const res = await request(app)
      .post(ANALYZE_URL)
      .attach('cv', FIXTURE_PDF)
      .field('jobDescription', '   ');

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('error');
  });

  test('should return 400 when file type is not PDF or Word document', async () => {
    const res = await request(app)
      .post(ANALYZE_URL)
      .attach('cv', FIXTURE_IMG)
      .field('jobDescription', 'Node.js engineer role.');

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('error');
  });

});

describe('GET /api/v1/analyze/:jobId', () => {

  test('should return 404 for a jobId that does not exist', async () => {
    const fakeId = crypto.randomUUID();
    const res = await request(app).get(`${ANALYZE_URL}/${fakeId}`);

    expect(res.status).toBe(404);
    expect(res.body.status).toBe('error');
  });

  test('should return 200 with PENDING status for a freshly created job', async () => {
    const record = await prisma.analysis.create({
      data: {
        originalFilename: 'test-cv.pdf',
        cvPath: '/app/uploads/test-cv.pdf',
        jobDescription: 'Test job description',
      },
    });

    const res = await request(app).get(`${ANALYZE_URL}/${record.jobId}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.jobId).toBe(record.jobId);
  });

  test('should return 200 with PROCESSING status when worker has claimed the job', async () => {
    const record = await prisma.analysis.create({
      data: {
        jobId: crypto.randomUUID(),
        originalFilename: 'test-cv.pdf',
        cvPath: '/app/uploads/test-cv.pdf',
        jobDescription: 'Test job description',
        status: 'PROCESSING',
        startedAt: new Date(),
      },
    });

    const res = await request(app).get(`${ANALYZE_URL}/${record.jobId}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PROCESSING');
    expect(res.body.data.startedAt).toBeDefined();
    expect(res.body.data.analysisResults).toBeNull();
  });

  test('should return 200 with COMPLETED status and full analysis payload', async () => {
    const mockResults = {
      keyword_gaps: ['TypeScript', 'Docker', 'CI/CD'],
      rewritten_bullet_points: [
        {
          original: 'Worked on backend APIs',
          rewritten: 'Engineered 3 production REST APIs in TypeScript reducing response latency by 40%',
          justification: 'Adds TypeScript signal and quantified impact for ATS keyword matching',
        },
      ],
    };

    const record = await prisma.analysis.create({
      data: {
        jobId: crypto.randomUUID(),
        originalFilename: 'test-cv.pdf',
        cvPath: '/app/uploads/test-cv.pdf',
        jobDescription: 'Test job description',
        status: 'COMPLETED',
        startedAt: new Date(Date.now() - 5000),
        completedAt: new Date(),
        matchScore: 85,
        analysisResults: mockResults,
      },
    });

    const res = await request(app).get(`${ANALYZE_URL}/${record.jobId}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('COMPLETED');
    expect(Number(res.body.data.matchScore)).toBe(85);
    expect(res.body.data.analysisResults).toEqual(mockResults);
    expect(res.body.data.completedAt).toBeDefined();
  });

});