# DTO and Schema Type Synchronization

This document tracks the synchronization between DTOs (Data Transfer Objects) and database schemas.

## ✅ Synchronized DTOs

### Users

**Schema**: `src/modules/schemas/users.schema.ts`
- Fields: `id`, `accountId`, `createdAt`, `updatedAt`, `deletedAt`, `k_u`, `pid`, `subid`, `partner`, `k_k`, `expire`, `token`, `session`, `accid`, `company`, `username`, `k_p`, `email`, `role`, `fullname`, `lastLoginAt`
- Type: `UserRole = 'agent' | 'admin' | 'manager'`

**DTOs**:
- ✅ `FilterUsersDto`: Documents available searchBy and sortBy fields
- ✅ `UpdateUserDto`: Matches schema fields (`email`, `role`, `fullname`) with correct types

### Vehicles

**Schema**: `src/modules/schemas/vehicles.schema.ts`
- Fields: `id`, `accountId`, `createdAt`, `updatedAt`, `thirdPartyId`, `plate`, `model`, `brand`, `year`, `tag2`, `groupId`, `isActive`, `lastSyncedAt`, `qrCode`

**DTOs**:
- ✅ `FilterVehiclesDto`: Documents available searchBy (`plate`, `model`, `brand`, `tag2`, `qrCode`) and sortBy fields

### Centers

**Schema**: `src/modules/schemas/centers.schema.ts`
- Fields: `id`, `accountId`, `createdAt`, `updatedAt`, `thirdPartyId`, `siteid`, `name`, `fullname`, `geozone`, `geozoneId`, `manager`, `groupid`, `groupname`, `sitetype`, `distance`, `time1`, `time2`, `saturday`, `sunday`, `breakstart`, `breakstop`, `timeoutin`, `timeoutin_str`, `timeoutin_muros`, `timeoutin_muros_str`

**DTOs**:
- ✅ `FilterCentersDto`: Documents available searchBy (`name`, `fullname`, `manager`, `geozone`, `groupname`) and sortBy fields

### Arrivals

**Schema**: `src/modules/schemas/arrivals.schema.ts`
- Fields: `id`, `accountId`, `createdAt`, `updatedAt`, `vehicleId` (references `vehicles.thirdPartyId`), `centerId` (references `centers.geozoneId`), `agentId`, `createdBy`, `status`, `arrivedAt`, `latitude`, `longitude`, `notes`
- Status Type: `ArrivalStatus` enum

**DTOs**:
- ✅ `CreateArrivalDto`: Uses `vehicleId` (maps to `thirdPartyId`) and `centerId` (maps to `geozoneId`) - matches schema references
- ✅ `UpdateArrivalStatusDto`: Uses `ArrivalStatus` enum - matches schema
- ✅ `FilterArrivalsDto`: Documents available searchBy and sortBy fields

### Exits

**Schema**: `src/modules/schemas/exits.schema.ts`
- Fields: `id`, `accountId`, `createdAt`, `updatedAt`, `vehicleId` (references `vehicles.thirdPartyId`), `centerId` (references `centers.geozoneId`), `agentId`, `createdBy`, `exitType`, `status`, `destinationCenterId` (references `centers.geozoneId`), `destinationName`, `exitedAt`, `latitude`, `longitude`, `notes`
- Status Type: `ArrivalStatus` enum

**DTOs**:
- ✅ `CreateExitDto`: Uses `vehicleId` (maps to `thirdPartyId`), `centerId` (maps to `geozoneId`), `destinationCenterId` (maps to `geozoneId`) - matches schema references
- ✅ `UpdateExitDto`: Uses `ArrivalStatus` enum for status - matches schema
- ✅ `FilterExitsDto`: Documents available searchBy and sortBy fields, includes `status` filter with `ArrivalStatus` enum

### Incoming Vehicles

**Schema**: `src/modules/schemas/incoming-vehicles.schema.ts`
- Fields: `id`, `accountId`, `createdAt`, `updatedAt`, `exitId` (references `exits.id`), `vehicleId` (references `vehicles.id`), `destinationCenterId` (references `centers.id`), `sourceCenterId` (references `centers.id`), `createdBy`, `status`, `estimatedArrival`, `actualArrival`, `distanceKm`
- Status Type: `ArrivalStatus` enum

**DTOs**:
- ✅ `CreateIncomingVehicleDto`: Uses `exitId`, `vehicleId` (internal ID), `destinationCenterId` (internal ID), `sourceCenterId` (internal ID) - matches schema references
- ✅ `UpdateIncomingVehicleDto`: Uses `ArrivalStatus` enum for status - matches schema
- ✅ `FilterIncomingVehiclesDto`: Documents available searchBy and sortBy fields

### Processing Stages

**Schema**: `src/modules/schemas/processing-stages.schema.ts`
- Fields: `id`, `accountId`, `createdAt`, `updatedAt`, `arrivalId`, `stageType`, `status`, `startedAt`, `completedAt`, `notes`
- Status Type: `ArrivalStatus` enum

**DTOs**:
- ✅ `CreateProcessingStageDto`: Uses `stageType`, `status` (ArrivalStatus enum), `notes` - matches schema
- ✅ `UpdateProcessingStageDto`: Uses `ArrivalStatus` enum for status - matches schema (fixed)
- ✅ `FilterProcessingStagesDto`: Documents available searchBy and sortBy fields

## Field Mapping Notes

### Reference Field Mappings

1. **Arrivals/Exits → Vehicles**: 
   - DTO uses `vehicleId` (number)
   - Schema expects `vehicles.thirdPartyId` (not `vehicles.id`)
   - ✅ Service correctly maps `vehicleId` → `thirdPartyId`

2. **Arrivals/Exits → Centers**:
   - DTO uses `centerId` (number)
   - Schema expects `centers.geozoneId` (not `centers.id`)
   - ✅ Service correctly maps `centerId` → `geozoneId`

3. **Incoming Vehicles → Centers**:
   - DTO uses `destinationCenterId` and `sourceCenterId` (numbers)
   - Schema expects `centers.id` (internal database ID)
   - ✅ Matches correctly

4. **Incoming Vehicles → Vehicles**:
   - DTO uses `vehicleId` (number)
   - Schema expects `vehicles.id` (internal database ID)
   - ✅ Matches correctly

## Type Consistency

- ✅ `UserRole` type exported from schema and used in `UpdateUserDto`
- ✅ `ArrivalStatus` enum exported from DTOs and used in schemas
- ✅ All DTO field types match schema column types
- ✅ All enum values match between DTOs and schemas

## Searchable/Sortable Fields Documentation

All Filter DTOs now document:
- Available fields for `searchBy` parameter
- Available fields for `sortBy` parameter
- Examples showing proper usage

This ensures API consumers know which fields they can use for searching and sorting.
