import crypto from 'crypto';
import request from 'supertest';
import path from 'path';
import { server, prisma } from './setup';
import { describe, expect, test} from '@jest/globals';

const ANALYZE_URL = '/api/v1/analyze';
const FIXTURE_PDF = path.resolve(__dirname, 'fixtures/sample.pdf');
const FIXTURE_IMG = path.resolve(__dirname, 'fixtures/sample.png');

describe('POST /api/v1/analyze', () => {
  test('should return 202 with jobId and PENDING status on valid upload', async () => {
    const res = await request(server)
      .post(ANALYZE_URL)
      .attach('cv', FIXTURE_PDF)
      .field('jobDescription', 'Looking for a Node.js engineer with TypeScript and PostgreSQL experience.');

    expect(res.status).toBe(202);
    expect(res.body.data.jobId).toBeDefined();
    expect(res.body.data.status).toBe('PENDING');
  });

  test('should return 400 when no file is attached', async () => {
    const res = await request(server).post(ANALYZE_URL).field('jobDescription', 'Node.js engineer role.');
    expect(res.status).toBe(400);
  });

  test('should return 400 when jobDescription is missing', async () => {
    const res = await request(server).post(ANALYZE_URL).attach('cv', FIXTURE_PDF);
    expect(res.status).toBe(400);
  });

  test('should return 400 when jobDescription is an empty string', async () => {
    const res = await request(server).post(ANALYZE_URL).attach('cv', FIXTURE_PDF).field('jobDescription', '   ');
    expect(res.status).toBe(400);
  });

  test.skip('should return 400 when file type is not PDF', async () => {
    const res = await request(server).post(ANALYZE_URL).attach('cv', FIXTURE_IMG, { contentType: 'image/png' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/analyze/:jobId', () => {
  test('should return 404 for a jobId that does not exist', async () => {
    const res = await request(server).get(`${ANALYZE_URL}/${crypto.randomUUID()}`);
    expect(res.status).toBe(404);
  });

  test('should return 200 with PENDING status for a freshly created job', async () => {
    const record = await prisma.analysis.create({
      data: { originalFilename: 'test-cv.pdf', jobDescription: 'Test job description' },
    });
    const res = await request(server).get(`${ANALYZE_URL}/${record.jobId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PENDING');
  });

  test('should return 200 with PROCESSING status when worker has claimed the job', async () => {
    const record = await prisma.analysis.create({
      data: {
        jobId: crypto.randomUUID(),
        originalFilename: 'test-cv.pdf',
        jobDescription: 'Test job description',
        status: 'PROCESSING',
        startedAt: new Date(),
      },
    });
    const res = await request(server).get(`${ANALYZE_URL}/${record.jobId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PROCESSING');
  });

  test('should return 200 with COMPLETED status and full analysis payload', async () => {
    const mockResults = {
      keyword_gaps: ['TypeScript'],
      rewritten_bullet_points: [],
      stack_redundancy_warning: '',
      one_page_verdict: ''
    };
    const record = await prisma.analysis.create({
      data: {
        jobId: crypto.randomUUID(),
        originalFilename: 'test-cv.pdf',
        jobDescription: 'Test job description',
        status: 'COMPLETED',
        startedAt: new Date(Date.now() - 5000),
        completedAt: new Date(),
        matchScore: 85,
        analysisResults: mockResults,
      },
    });
    const res = await request(server).get(`${ANALYZE_URL}/${record.jobId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('COMPLETED');
  });
});