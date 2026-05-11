---
name: api-route
description: "Scaffold a new API route and service file following the project's Express + TypeScript + Zod validation pattern"
disable-model-invocation: true
---

# Scaffold API Route + Service

Create a new API route and matching service file following BossBoard's established patterns.

## Steps

1. **Read existing patterns**: Read `apps/api/src/routes/expenses.ts` and `apps/api/src/services/expenses.ts` as reference for the standard pattern
2. **Create the service file** at `apps/api/src/services/{name}.ts`:
   - Import `pool` from `../services/database`
   - Export async functions for each CRUD operation
   - Use parameterized queries (never string interpolation for SQL)
   - Return typed results
3. **Create the route file** at `apps/api/src/routes/{name}.ts`:
   - Import `Router` from express
   - Import `authenticate` from `../middleware/auth`
   - Import `attachSubscription`, `requireFeature`, `checkLimit` from `../middleware/subscription` as needed
   - Use Zod for request body validation
   - Wrap handlers in try/catch with consistent error responses
   - Follow REST conventions (GET list, GET :id, POST create, PUT :id update, DELETE :id)
4. **Register the route** in `apps/api/src/index.ts`:
   - Add import for the new route
   - Add `app.use('/api/v1/{name}', newRoute)` following the existing pattern
5. **Show the user** what was created and what middleware was applied

## Standard Response Format

```typescript
// Success
res.json({ success: true, data: result });

// Error
res.status(400).json({ success: false, error: 'Description' });

// List with count
res.json({ success: true, data: items, count: items.length });
```

## Middleware Chain Pattern

```typescript
// Read-only (any authenticated user)
router.get('/', authenticate, handler);

// Create with limit check
router.post('/', authenticate, attachSubscription, checkLimit('resourceName'), handler);

// Feature-gated
router.post('/', authenticate, attachSubscription, requireFeature('featureName'), handler);
```

## Arguments

The user should provide the resource name and brief description:
- `/api-route products - product/material catalog for tradies`
- `/api-route timesheets - weekly timesheet tracking`
