# Step 3: `infra` Package Migration to Effect v4

## Status: In Progress

## Phases

### Phase 1: Delete api/internal/middlewares.ts, clean up api/middlewares.ts
- [ ] Delete `src/api/internal/middlewares.ts`
- [ ] Remove reexports from `src/api/middlewares.ts`

### Phase 2: Leaf files
- [ ] errors.ts
- [ ] rateLimit.ts
- [ ] arbs.ts
- [ ] QueueMaker/errors.ts
- [ ] Model/query/dsl.ts
- [ ] Model/Repository/legacy.ts

### Phase 3: Logger & errorReporter
- [ ] logger/shared.ts
- [ ] logger/jsonLogger.ts
- [ ] logger/logFmtLogger.ts
- [ ] errorReporter.ts

### Phase 4: Store layer
- [ ] Store/service.ts
- [ ] Store/utils.ts
- [ ] Store/codeFilter.ts
- [ ] Store/ContextMapContainer.ts
- [ ] Store/Memory.ts
- [ ] Store/Disk.ts
- [ ] Store/Cosmos.ts
- [ ] Store/index.ts

### Phase 5: Model/Repository
- [ ] Model/Repository/service.ts
- [ ] Model/Repository/ext.ts
- [ ] Model/Repository/internal/internal.ts
- [ ] Model/Repository/makeRepo.ts
- [ ] Model/query/new-kid-interpreter.ts

### Phase 6: Standalone services
- [ ] CUPS.ts
- [ ] MainFiberSet.ts
- [ ] RequestFiberSet.ts
- [ ] Emailer/Sendgrid.ts

### Phase 7: Adapters
- [ ] adapters/cosmos-client.ts
- [ ] adapters/redis-client.ts
- [ ] adapters/mongo-client.ts
- [ ] adapters/ServiceBus.ts
- [ ] adapters/SQL/Model.ts

### Phase 8: API layer
- [ ] api/middlewares.ts
- [ ] api/codec.ts
- [ ] api/reportError.ts
- [ ] api/setupRequest.ts
- [ ] api/ContextProvider.ts
- [ ] api/layerUtils.ts
- [ ] api/internal/auth.ts
- [ ] api/internal/events.ts
- [ ] api/internal/health.ts
- [ ] api/routing.ts
- [ ] api/routing/utils.ts
- [ ] api/routing/schema/jwt.ts
- [ ] api/routing/middleware/middleware.ts
- [ ] api/routing/middleware/RouterMiddleware.ts

### Phase 9: QueueMaker & Operations
- [ ] QueueMaker/memQueue.ts
- [ ] QueueMaker/sbqueue.ts
- [ ] QueueMaker/SQLQueue.ts
- [ ] Operations.ts
- [ ] OperationsRepo.ts

### Phase 10: Test files
- [ ] test.ts
- [ ] vitest.ts

### Phase 11: Validation
- [ ] pnpm check passes
- [ ] eslint fix
- [ ] Update findings.md
- [ ] Commit

## Findings

(Will be updated as migration progresses)
