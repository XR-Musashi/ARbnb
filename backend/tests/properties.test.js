const request = require('supertest');
const app = require('../src/app');
const prisma = require('../src/db/prisma');

// Mock Supabase auth so tests don't require a real Supabase project
jest.mock('../src/services/supabase', () => ({
  supabaseAdmin: {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'test-host-id', email: 'host@test.com' } },
        error: null,
      }),
    },
    storage: {
      from: jest.fn().mockReturnValue({
        upload: jest.fn().mockResolvedValue({ error: null }),
        getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/floor-plan.png' } }),
      }),
    },
  },
  supabase: {},
}));

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Properties API', () => {
  let createdPropertyId;

  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('POST /api/properties creates a property', async () => {
    const res = await request(app)
      .post('/api/properties')
      .set('Authorization', 'Bearer fake-jwt')
      .send({ name: 'Test Apartment', address: '1 Test St' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Test Apartment');
    expect(res.body.hostId).toBe('test-host-id');
    createdPropertyId = res.body.id;
  });

  it('GET /api/properties lists the host properties', async () => {
    const res = await request(app)
      .get('/api/properties')
      .set('Authorization', 'Bearer fake-jwt');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((p) => p.id === createdPropertyId)).toBe(true);
  });

  it('GET /api/properties/:id returns a single property', async () => {
    const res = await request(app)
      .get(`/api/properties/${createdPropertyId}`)
      .set('Authorization', 'Bearer fake-jwt');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(createdPropertyId);
  });

  it('PUT /api/properties/:id updates the property name', async () => {
    const res = await request(app)
      .put(`/api/properties/${createdPropertyId}`)
      .set('Authorization', 'Bearer fake-jwt')
      .send({ name: 'Updated Apartment' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Apartment');
  });

  it('DELETE /api/properties/:id removes the property', async () => {
    const res = await request(app)
      .delete(`/api/properties/${createdPropertyId}`)
      .set('Authorization', 'Bearer fake-jwt');

    expect(res.status).toBe(204);
  });

  it('returns 401 with no auth header', async () => {
    const res = await request(app).get('/api/properties');
    expect(res.status).toBe(401);
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/properties')
      .set('Authorization', 'Bearer fake-jwt')
      .send({ address: 'No Name St' });

    expect(res.status).toBe(400);
  });
});
