# Dashboard Implementation Plan

## Overview

This document outlines the complete implementation plan for a comprehensive dashboard that allows users to view all entities in the system (users, centers, vehicles, processes, arrivals, exits, incoming vehicles) with read-only access. The only action permitted through the dashboard is generating QR codes for vehicles.

## Table of Contents

1. [Authentication](#authentication)
2. [Dashboard Module Structure](#dashboard-module-structure)
3. [Dashboard Endpoints](#dashboard-endpoints)
4. [Data Transfer Objects (DTOs)](#data-transfer-objects-dtos)
5. [Interfaces](#interfaces)
6. [Services](#services)
7. [Database Schemas](#database-schemas)
8. [Frontend Integration](#frontend-integration)
9. [Implementation Steps](#implementation-steps)

---

## Authentication

### Current Authentication System

The application already has a robust authentication system in place:

**Location**: `src/modules/auth/`

**Key Components**:
- **Login Endpoint**: `POST /api/v1/auth/login`
  - Authenticates users via Malambi API
  - Returns JWT access token and refresh token
  - Automatically syncs user data if not exists
  
- **Refresh Token**: `POST /api/v1/auth/refresh-token`
  - Refreshes expired access tokens
  
- **JWT Strategy**: Uses Passport JWT strategy
- **Guards**: `JwtAuthGuard`, `RolesGuard`
- **Decorators**: `@CurrentUserCredentials()`, `@Roles()`, `@Public()`

**Authentication Flow**:
1. User sends credentials to `/auth/login`
2. System validates with Malambi API
3. Returns JWT tokens (access + refresh)
4. Frontend stores tokens and includes access token in `Authorization: Bearer <token>` header
5. All dashboard endpoints require valid JWT token

**User Roles**:
- `agent` (default)
- `admin`
- `manager`

**Note**: QR code generation requires `admin` or `manager` role.

---

## Dashboard Module Structure

### Directory Structure

```
src/modules/dashboard/
├── dashboard.module.ts
├── dashboard.controller.ts
├── dashboard.service.ts
├── dto/
│   ├── index.ts
│   ├── dashboard-stats.dto.ts
│   ├── dashboard-query.dto.ts
│   └── dashboard-filters.dto.ts
└── interfaces/
    ├── index.ts
    ├── dashboard-stats.interface.ts
    └── dashboard-overview.interface.ts
```

---

## Dashboard Endpoints

### Base Path
All dashboard endpoints will be under `/api/v1/dashboard`

### Endpoint List

#### 1. Dashboard Overview/Statistics
```
GET /api/v1/dashboard/overview
```
**Description**: Returns aggregated statistics and counts for all entities
**Authentication**: Required (JWT)
**Response**: Dashboard overview with counts and recent activity

#### 2. View Users
```
GET /api/v1/dashboard/users
```
**Description**: List all users with pagination, filtering, and search
**Authentication**: Required (JWT)
**Query Parameters**: 
- `page` (number, default: 1)
- `limit` (number, default: 100)
- `search` (string, optional)
- `searchBy` (string, comma-separated fields)
- `sortBy` (string, format: "field:direction")
- `include` (string, comma-separated relations: "arrivals,exits")

**Response**: Paginated list of users

#### 3. View Centers
```
GET /api/v1/dashboard/centers
```
**Description**: List all centers with pagination, filtering, and search
**Authentication**: Required (JWT)
**Query Parameters**: Same as users endpoint
**Response**: Paginated list of centers

#### 4. View Vehicles
```
GET /api/v1/dashboard/vehicles
```
**Description**: List all vehicles with pagination, filtering, and search
**Authentication**: Required (JWT)
**Query Parameters**: Same as users endpoint
**Response**: Paginated list of vehicles

#### 5. View Arrivals
```
GET /api/v1/dashboard/arrivals
```
**Description**: List all arrivals with pagination, filtering, and search
**Authentication**: Required (JWT)
**Query Parameters**: Same as users endpoint
**Response**: Paginated list of arrivals

#### 6. View Exits
```
GET /api/v1/dashboard/exits
```
**Description**: List all exits with pagination, filtering, and search
**Authentication**: Required (JWT)
**Query Parameters**: Same as users endpoint
**Response**: Paginated list of exits

#### 7. View Incoming Vehicles
```
GET /api/v1/dashboard/incoming-vehicles
```
**Description**: List all incoming vehicles with pagination, filtering, and search
**Authentication**: Required (JWT)
**Query Parameters**: Same as users endpoint
**Response**: Paginated list of incoming vehicles

#### 8. View Processing Stages
```
GET /api/v1/dashboard/processing-stages
```
**Description**: List all processing stages with pagination, filtering, and search
**Authentication**: Required (JWT)
**Query Parameters**: Same as users endpoint
**Response**: Paginated list of processing stages

#### 9. Generate QR Code for Vehicle
```
POST /api/v1/dashboard/vehicles/:id/qr-code
```
**Description**: Generate QR code for a vehicle (only action allowed)
**Authentication**: Required (JWT)
**Authorization**: Requires `admin` or `manager` role
**Parameters**: 
- `id` (path parameter): Vehicle ID (internal ID or thirdPartyId)
**Response**: QR code data URL (base64 image) and QR code string

**Note**: This endpoint delegates to the existing vehicles QR code service.

---

## Data Transfer Objects (DTOs)

### 1. Dashboard Query DTO

**File**: `src/modules/dashboard/dto/dashboard-query.dto.ts`

```typescript
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsNumber, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class DashboardQueryDto {
  @ApiPropertyOptional({ description: 'Page number', example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', example: 100, default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 100;

  @ApiPropertyOptional({ description: 'Search term', example: 'ABC123' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ 
    description: 'Comma-separated fields to search in', 
    example: 'plate,model,brand' 
  })
  @IsOptional()
  @IsString()
  searchBy?: string;

  @ApiPropertyOptional({ 
    description: 'Comma-separated sort fields (format: field:direction)', 
    example: 'createdAt:DESC,plate:ASC' 
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ 
    description: 'Comma-separated relations to include', 
    example: 'arrivals,exits' 
  })
  @IsOptional()
  @IsString()
  include?: string;
}
```

### 2. Dashboard Stats DTO

**File**: `src/modules/dashboard/dto/dashboard-stats.dto.ts`

```typescript
import { ApiProperty } from '@nestjs/swagger';

export class DashboardStatsDto {
  @ApiProperty({ description: 'Total number of users' })
  totalUsers: number;

  @ApiProperty({ description: 'Total number of centers' })
  totalCenters: number;

  @ApiProperty({ description: 'Total number of vehicles' })
  totalVehicles: number;

  @ApiProperty({ description: 'Total number of arrivals' })
  totalArrivals: number;

  @ApiProperty({ description: 'Total number of exits' })
  totalExits: number;

  @ApiProperty({ description: 'Total number of incoming vehicles' })
  totalIncomingVehicles: number;

  @ApiProperty({ description: 'Total number of processing stages' })
  totalProcessingStages: number;

  @ApiProperty({ description: 'Active vehicles count' })
  activeVehicles: number;

  @ApiProperty({ description: 'Vehicles with QR codes' })
  vehiclesWithQrCode: number;

  @ApiProperty({ description: 'Recent arrivals (last 24 hours)' })
  recentArrivals: number;

  @ApiProperty({ description: 'Recent exits (last 24 hours)' })
  recentExits: number;
}
```

### 3. Dashboard Filters DTO

**File**: `src/modules/dashboard/dto/dashboard-filters.dto.ts`

```typescript
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsBoolean, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class DashboardFiltersDto extends DashboardQueryDto {
  @ApiPropertyOptional({ description: 'Filter by active status (vehicles)' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Filter by status (arrivals, exits, etc.)' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by center ID' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  centerId?: number;

  @ApiPropertyOptional({ description: 'Filter by vehicle ID' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  vehicleId?: number;

  @ApiPropertyOptional({ description: 'Filter by user ID (accid)' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: 'Filter by date range start (ISO string)' })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Filter by date range end (ISO string)' })
  @IsOptional()
  @IsString()
  dateTo?: string;
}
```

### 4. DTO Index

**File**: `src/modules/dashboard/dto/index.ts`

```typescript
export * from './dashboard-query.dto';
export * from './dashboard-stats.dto';
export * from './dashboard-filters.dto';
```

---

## Interfaces

### 1. Dashboard Stats Interface

**File**: `src/modules/dashboard/interfaces/dashboard-stats.interface.ts`

```typescript
export interface DashboardStats {
  totalUsers: number;
  totalCenters: number;
  totalVehicles: number;
  totalArrivals: number;
  totalExits: number;
  totalIncomingVehicles: number;
  totalProcessingStages: number;
  activeVehicles: number;
  vehiclesWithQrCode: number;
  recentArrivals: number;
  recentExits: number;
}
```

### 2. Dashboard Overview Interface

**File**: `src/modules/dashboard/interfaces/dashboard-overview.interface.ts`

```typescript
import { DashboardStats } from './dashboard-stats.interface';

export interface DashboardOverview {
  stats: DashboardStats;
  recentActivity: {
    latestArrivals: any[];
    latestExits: any[];
    latestVehicles: any[];
  };
  summary: {
    vehiclesByStatus: Record<string, number>;
    arrivalsByStatus: Record<string, number>;
    exitsByType: Record<string, number>;
  };
}
```

### 3. Interface Index

**File**: `src/modules/dashboard/interfaces/index.ts`

```typescript
export * from './dashboard-stats.interface';
export * from './dashboard-overview.interface';
```

---

## Services

### Dashboard Service

**File**: `src/modules/dashboard/dashboard.service.ts`

The dashboard service will aggregate data from existing services:

```typescript
import { Injectable, Inject } from '@nestjs/common';
import { DATABASE_CONNECTION } from '@database/database-connection';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '@modules/schemas';
import { and, eq, count, gte, sql } from 'drizzle-orm';
import { UsersService } from '@modules/users/users.service';
import { CentersService } from '@modules/centers/centers.service';
import { VehiclesService } from '@modules/vehicles/vehicles.service';
import { ArrivalsService } from '@modules/arrivals/arrivals.service';
import { ExitsService } from '@modules/exits/exits.service';
import { IncomingService } from '@modules/incoming/incoming.service';
import { PaginateQuery, PaginateResult } from '@common/interfaces';
import { DashboardStats, DashboardOverview } from './interfaces';

@Injectable()
export class DashboardService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly usersService: UsersService,
    private readonly centersService: CentersService,
    private readonly vehiclesService: VehiclesService,
    private readonly arrivalsService: ArrivalsService,
    private readonly exitsService: ExitsService,
    private readonly incomingService: IncomingService,
  ) {}

  /**
   * Get dashboard overview with statistics and recent activity
   */
  async getOverview(accountId: number): Promise<DashboardOverview> {
    const stats = await this.getStats(accountId);
    
    // Get recent activity
    const recentArrivals = await this.arrivalsService.findAll(
      { page: 1, limit: 10, sortBy: [['createdAt', 'DESC']] },
      { accountId }
    );

    const recentExits = await this.exitsService.findAll(
      { page: 1, limit: 10, sortBy: [['createdAt', 'DESC']] },
      { accountId }
    );

    const recentVehicles = await this.vehiclesService.findAll(
      { page: 1, limit: 10, sortBy: [['createdAt', 'DESC']] },
      { accountId }
    );

    // Get summary statistics
    const vehiclesByStatus = await this.getVehiclesByStatus(accountId);
    const arrivalsByStatus = await this.getArrivalsByStatus(accountId);
    const exitsByType = await this.getExitsByType(accountId);

    return {
      stats,
      recentActivity: {
        latestArrivals: recentArrivals.data,
        latestExits: recentExits.data,
        latestVehicles: recentVehicles.data,
      },
      summary: {
        vehiclesByStatus,
        arrivalsByStatus,
        exitsByType,
      },
    };
  }

  /**
   * Get dashboard statistics
   */
  async getStats(accountId: number): Promise<DashboardStats> {
    const [
      totalUsers,
      totalCenters,
      totalVehicles,
      totalArrivals,
      totalExits,
      totalIncomingVehicles,
      totalProcessingStages,
      activeVehicles,
      vehiclesWithQrCode,
      recentArrivals,
      recentExits,
    ] = await Promise.all([
      this.getTotalCount(schema.users, accountId),
      this.getTotalCount(schema.centers, accountId),
      this.getTotalCount(schema.vehicles, accountId),
      this.getTotalCount(schema.arrivals, accountId),
      this.getTotalCount(schema.exits, accountId),
      this.getTotalCount(schema.incomingVehicles, accountId),
      this.getTotalCount(schema.processingStages, accountId),
      this.getActiveVehiclesCount(accountId),
      this.getVehiclesWithQrCodeCount(accountId),
      this.getRecentArrivalsCount(accountId),
      this.getRecentExitsCount(accountId),
    ]);

    return {
      totalUsers,
      totalCenters,
      totalVehicles,
      totalArrivals,
      totalExits,
      totalIncomingVehicles,
      totalProcessingStages,
      activeVehicles,
      vehiclesWithQrCode,
      recentArrivals,
      recentExits,
    };
  }

  /**
   * Get users for dashboard
   */
  async getUsers(
    query: PaginateQuery,
    accountId: number,
  ): Promise<PaginateResult<any>> {
    return this.usersService.findAll(query, { accountId });
  }

  /**
   * Get centers for dashboard
   */
  async getCenters(
    query: PaginateQuery,
    accountId: number,
  ): Promise<PaginateResult<any>> {
    return this.centersService.findAll(query, { accountId });
  }

  /**
   * Get vehicles for dashboard
   */
  async getVehicles(
    query: PaginateQuery,
    accountId: number,
  ): Promise<PaginateResult<any>> {
    return this.vehiclesService.findAll(query, { accountId });
  }

  /**
   * Get arrivals for dashboard
   */
  async getArrivals(
    query: PaginateQuery,
    accountId: number,
  ): Promise<PaginateResult<any>> {
    return this.arrivalsService.findAll(query, { accountId });
  }

  /**
   * Get exits for dashboard
   */
  async getExits(
    query: PaginateQuery,
    accountId: number,
  ): Promise<PaginateResult<any>> {
    return this.exitsService.findAll(query, { accountId });
  }

  /**
   * Get incoming vehicles for dashboard
   */
  async getIncomingVehicles(
    query: PaginateQuery,
    accountId: number,
  ): Promise<PaginateResult<any>> {
    return this.incomingService.findAll(query, { accountId });
  }

  /**
   * Get processing stages for dashboard
   */
  async getProcessingStages(
    query: PaginateQuery,
    accountId: number,
  ): Promise<PaginateResult<any>> {
    // This would need to be implemented in arrivals service or as a separate method
    // For now, we'll query directly
    const result = await this.db
      .select()
      .from(schema.processingStages)
      .where(eq(schema.processingStages.accountId, accountId))
      .limit(query.limit || 100)
      .offset(((query.page || 1) - 1) * (query.limit || 100));

    const total = await this.db
      .select({ count: count() })
      .from(schema.processingStages)
      .where(eq(schema.processingStages.accountId, accountId));

    return {
      data: result,
      meta: {
        itemsPerPage: query.limit || 100,
        totalItems: total[0].count,
        currentPage: query.page || 1,
        totalPages: Math.ceil(total[0].count / (query.limit || 100)),
        sortBy: query.sortBy || [],
        search: query.search,
        searchBy: query.searchBy,
      },
      links: {},
    };
  }

  // Helper methods
  private async getTotalCount(table: any, accountId: number): Promise<number> {
    const result = await this.db
      .select({ count: count() })
      .from(table)
      .where(eq(table.accountId, accountId));
    return result[0].count;
  }

  private async getActiveVehiclesCount(accountId: number): Promise<number> {
    const result = await this.db
      .select({ count: count() })
      .from(schema.vehicles)
      .where(
        and(
          eq(schema.vehicles.accountId, accountId),
          eq(schema.vehicles.isActive, true),
        ),
      );
    return result[0].count;
  }

  private async getVehiclesWithQrCodeCount(accountId: number): Promise<number> {
    const result = await this.db
      .select({ count: count() })
      .from(schema.vehicles)
      .where(
        and(
          eq(schema.vehicles.accountId, accountId),
          sql`${schema.vehicles.qrCode} IS NOT NULL`,
        ),
      );
    return result[0].count;
  }

  private async getRecentArrivalsCount(accountId: number): Promise<number> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const result = await this.db
      .select({ count: count() })
      .from(schema.arrivals)
      .where(
        and(
          eq(schema.arrivals.accountId, accountId),
          gte(schema.arrivals.createdAt, yesterday),
        ),
      );
    return result[0].count;
  }

  private async getRecentExitsCount(accountId: number): Promise<number> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const result = await this.db
      .select({ count: count() })
      .from(schema.exits)
      .where(
        and(
          eq(schema.exits.accountId, accountId),
          gte(schema.exits.createdAt, yesterday),
        ),
      );
    return result[0].count;
  }

  private async getVehiclesByStatus(accountId: number): Promise<Record<string, number>> {
    // Group vehicles by isActive status
    const active = await this.getActiveVehiclesCount(accountId);
    const total = await this.getTotalCount(schema.vehicles, accountId);
    
    return {
      active,
      inactive: total - active,
    };
  }

  private async getArrivalsByStatus(accountId: number): Promise<Record<string, number>> {
    // This would require grouping by status field
    // Implementation depends on arrival status enum values
    return {};
  }

  private async getExitsByType(accountId: number): Promise<Record<string, number>> {
    // This would require grouping by exitType field
    // Implementation depends on exit type values
    return {};
  }
}
```

---

## Dashboard Controller

**File**: `src/modules/dashboard/dashboard.controller.ts`

```typescript
import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { QrCodeService } from '@modules/vehicles/qr-code.service';
import { VehiclesService } from '@modules/vehicles/vehicles.service';
import { CurrentUserCredentials } from '@modules/auth/decorators/current-user-credentials.decorator';
import { Roles } from '@modules/auth/decorators/roles.decorator';
import { RolesGuard } from '@modules/auth/guards/roles.guard';
import { Credentials, PaginateResult } from '@common/interfaces';
import { DashboardQueryDto } from './dto';
import { DashboardOverview } from './interfaces';
import * as schema from '@modules/schemas';
import { NotFoundException, BadRequestException } from '@nestjs/common';

type Vehicle = typeof schema.vehicles.$inferSelect;

@Controller('dashboard')
@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(RolesGuard)
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly qrCodeService: QrCodeService,
    private readonly vehiclesService: VehiclesService,
  ) {}

  @Get('overview')
  @ApiOperation({
    summary: 'Get dashboard overview',
    description: 'Returns aggregated statistics, recent activity, and summary data for the dashboard.',
  })
  @ApiResponse({ status: 200, description: 'Dashboard overview retrieved successfully' })
  async getOverview(
    @CurrentUserCredentials() credentials: Credentials,
  ): Promise<DashboardOverview> {
    return this.dashboardService.getOverview(credentials.accid);
  }

  @Get('users')
  @ApiOperation({
    summary: 'View all users',
    description: 'Retrieves a paginated list of users with filtering and search capabilities.',
  })
  async getUsers(
    @Query() query: DashboardQueryDto,
    @CurrentUserCredentials() credentials: Credentials,
  ): Promise<PaginateResult<any>> {
    const paginateQuery = {
      page: query.page ?? 1,
      limit: query.limit ?? 100,
      search: query.search,
      searchBy: query.searchBy ? query.searchBy.split(',') : undefined,
      sortBy: query.sortBy
        ? (query.sortBy.split(',').map((s) => {
            const [field, direction] = s.split(':');
            return [field, (direction || 'ASC').toUpperCase()] as [string, 'ASC' | 'DESC'];
          }) as [string, 'ASC' | 'DESC'][])
        : undefined,
    };

    return this.dashboardService.getUsers(paginateQuery, credentials.accid);
  }

  @Get('centers')
  @ApiOperation({
    summary: 'View all centers',
    description: 'Retrieves a paginated list of centers with filtering and search capabilities.',
  })
  async getCenters(
    @Query() query: DashboardQueryDto,
    @CurrentUserCredentials() credentials: Credentials,
  ): Promise<PaginateResult<any>> {
    const paginateQuery = {
      page: query.page ?? 1,
      limit: query.limit ?? 100,
      search: query.search,
      searchBy: query.searchBy ? query.searchBy.split(',') : undefined,
      sortBy: query.sortBy
        ? (query.sortBy.split(',').map((s) => {
            const [field, direction] = s.split(':');
            return [field, (direction || 'ASC').toUpperCase()] as [string, 'ASC' | 'DESC'];
          }) as [string, 'ASC' | 'DESC'][])
        : undefined,
    };

    return this.dashboardService.getCenters(paginateQuery, credentials.accid);
  }

  @Get('vehicles')
  @ApiOperation({
    summary: 'View all vehicles',
    description: 'Retrieves a paginated list of vehicles with filtering and search capabilities.',
  })
  async getVehicles(
    @Query() query: DashboardQueryDto,
    @CurrentUserCredentials() credentials: Credentials,
  ): Promise<PaginateResult<any>> {
    const paginateQuery = {
      page: query.page ?? 1,
      limit: query.limit ?? 100,
      search: query.search,
      searchBy: query.searchBy ? query.searchBy.split(',') : undefined,
      sortBy: query.sortBy
        ? (query.sortBy.split(',').map((s) => {
            const [field, direction] = s.split(':');
            return [field, (direction || 'ASC').toUpperCase()] as [string, 'ASC' | 'DESC'];
          }) as [string, 'ASC' | 'DESC'][])
        : undefined,
    };

    return this.dashboardService.getVehicles(paginateQuery, credentials.accid);
  }

  @Get('arrivals')
  @ApiOperation({
    summary: 'View all arrivals',
    description: 'Retrieves a paginated list of arrivals with filtering and search capabilities.',
  })
  async getArrivals(
    @Query() query: DashboardQueryDto,
    @CurrentUserCredentials() credentials: Credentials,
  ): Promise<PaginateResult<any>> {
    const paginateQuery = {
      page: query.page ?? 1,
      limit: query.limit ?? 100,
      search: query.search,
      searchBy: query.searchBy ? query.searchBy.split(',') : undefined,
      sortBy: query.sortBy
        ? (query.sortBy.split(',').map((s) => {
            const [field, direction] = s.split(':');
            return [field, (direction || 'ASC').toUpperCase()] as [string, 'ASC' | 'DESC'];
          }) as [string, 'ASC' | 'DESC'][])
        : undefined,
    };

    return this.dashboardService.getArrivals(paginateQuery, credentials.accid);
  }

  @Get('exits')
  @ApiOperation({
    summary: 'View all exits',
    description: 'Retrieves a paginated list of exits with filtering and search capabilities.',
  })
  async getExits(
    @Query() query: DashboardQueryDto,
    @CurrentUserCredentials() credentials: Credentials,
  ): Promise<PaginateResult<any>> {
    const paginateQuery = {
      page: query.page ?? 1,
      limit: query.limit ?? 100,
      search: query.search,
      searchBy: query.searchBy ? query.searchBy.split(',') : undefined,
      sortBy: query.sortBy
        ? (query.sortBy.split(',').map((s) => {
            const [field, direction] = s.split(':');
            return [field, (direction || 'ASC').toUpperCase()] as [string, 'ASC' | 'DESC'];
          }) as [string, 'ASC' | 'DESC'][])
        : undefined,
    };

    return this.dashboardService.getExits(paginateQuery, credentials.accid);
  }

  @Get('incoming-vehicles')
  @ApiOperation({
    summary: 'View all incoming vehicles',
    description: 'Retrieves a paginated list of incoming vehicles with filtering and search capabilities.',
  })
  async getIncomingVehicles(
    @Query() query: DashboardQueryDto,
    @CurrentUserCredentials() credentials: Credentials,
  ): Promise<PaginateResult<any>> {
    const paginateQuery = {
      page: query.page ?? 1,
      limit: query.limit ?? 100,
      search: query.search,
      searchBy: query.searchBy ? query.searchBy.split(',') : undefined,
      sortBy: query.sortBy
        ? (query.sortBy.split(',').map((s) => {
            const [field, direction] = s.split(':');
            return [field, (direction || 'ASC').toUpperCase()] as [string, 'ASC' | 'DESC'];
          }) as [string, 'ASC' | 'DESC'][])
        : undefined,
    };

    return this.dashboardService.getIncomingVehicles(paginateQuery, credentials.accid);
  }

  @Get('processing-stages')
  @ApiOperation({
    summary: 'View all processing stages',
    description: 'Retrieves a paginated list of processing stages with filtering and search capabilities.',
  })
  async getProcessingStages(
    @Query() query: DashboardQueryDto,
    @CurrentUserCredentials() credentials: Credentials,
  ): Promise<PaginateResult<any>> {
    const paginateQuery = {
      page: query.page ?? 1,
      limit: query.limit ?? 100,
      search: query.search,
      searchBy: query.searchBy ? query.searchBy.split(',') : undefined,
      sortBy: query.sortBy
        ? (query.sortBy.split(',').map((s) => {
            const [field, direction] = s.split(':');
            return [field, (direction || 'ASC').toUpperCase()] as [string, 'ASC' | 'DESC'];
          }) as [string, 'ASC' | 'DESC'][])
        : undefined,
    };

    return this.dashboardService.getProcessingStages(paginateQuery, credentials.accid);
  }

  @Post('vehicles/:id/qr-code')
  @Roles('admin', 'manager')
  @ApiOperation({
    summary: 'Generate QR code for a vehicle',
    description: 'Generates a downloadable QR code for a vehicle. Only users with admin or manager role can generate QR codes. The :id parameter can be either the internal database ID or the thirdPartyId (vehicleId from Malambi API).',
  })
  @ApiResponse({ status: 200, description: 'QR code generated successfully' })
  @ApiResponse({ status: 403, description: 'Access denied. Admin or manager role required.' })
  @ApiResponse({ status: 404, description: 'Vehicle not found' })
  async generateQrCode(
    @Param('id') id: string,
    @CurrentUserCredentials() credentials: Credentials,
  ): Promise<{
    qrCodeDataUrl: string;
    qrCodeString: string;
    vehicleId: number;
    vehicle: Vehicle;
  }> {
    // Try to find vehicle by internal ID first, then by thirdPartyId
    let vehicle: Vehicle;
    const numericId = Number(id);
    
    if (isNaN(numericId)) {
      throw new BadRequestException(`Invalid vehicle ID: ${id}`);
    }

    try {
      // First, try to find by internal database ID
      vehicle = await this.vehiclesService.findOneById(numericId, {
        accountId: credentials.accid,
      });
    } catch (error) {
      // If not found by ID, try to find by thirdPartyId
      if (error instanceof NotFoundException) {
        try {
          vehicle = await this.vehiclesService.findOneBy(
            { thirdPartyId: numericId },
            { accountId: credentials.accid },
          );
        } catch (secondError) {
          throw new NotFoundException(
            `Vehicle not found with ID ${id} (tried both internal ID and thirdPartyId)`,
          );
        }
      } else {
        throw error;
      }
    }

    // Generate QR code
    const qrCodeResult = await this.qrCodeService.generateQrCode(
      vehicle.thirdPartyId,
      credentials.accid,
    );

    return {
      ...qrCodeResult,
      vehicle,
    };
  }
}
```

---

## Dashboard Module

**File**: `src/modules/dashboard/dashboard.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { UsersModule } from '@modules/users/users.module';
import { CentersModule } from '@modules/centers/centers.module';
import { VehiclesModule } from '@modules/vehicles/vehicles.module';
import { ArrivalsModule } from '@modules/arrivals/arrivals.module';
import { ExitsModule } from '@modules/exits/exits.module';
import { IncomingModule } from '@modules/incoming/incoming.module';
import { AuthModule } from '@modules/auth/auth.module';

@Module({
  imports: [
    UsersModule,
    CentersModule,
    VehiclesModule,
    ArrivalsModule,
    ExitsModule,
    IncomingModule,
    AuthModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
```

**Note**: Ensure all imported modules export their services.

---

## Database Schemas

All database schemas already exist and are located in `src/modules/schemas/`:

- ✅ `users.schema.ts` - User/agent information
- ✅ `centers.schema.ts` - Center/location information
- ✅ `vehicles.schema.ts` - Vehicle information (includes QR code field)
- ✅ `arrivals.schema.ts` - Vehicle arrival records
- ✅ `exits.schema.ts` - Vehicle exit records
- ✅ `incoming-vehicles.schema.ts` - Vehicles in transit
- ✅ `processing-stages.schema.ts` - Multi-stage processing workflows

**No schema changes are required** - the dashboard will use existing schemas.

---

## Frontend Integration

### API Base URL
```
Base URL: http://localhost:5000/api/v1 (or your production URL)
```

### Authentication Flow

1. **Login**
   ```http
   POST /api/v1/auth/login
   Content-Type: application/json
   
   {
     "username": "user@example.com",
     "password": "password123"
   }
   ```

   **Response**:
   ```json
   {
     "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
     "refreshToken": "uuid-refresh-token",
     "user": {
       "accid": "123",
       "subid": "456",
       "username": "user@example.com"
     }
   }
   ```

2. **Store Tokens**
   - Store `accessToken` in memory or secure storage
   - Store `refreshToken` in secure storage (httpOnly cookie recommended)

3. **Include Token in Requests**
   ```http
   GET /api/v1/dashboard/overview
   Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

### Dashboard Endpoints for Frontend

#### 1. Get Dashboard Overview
```http
GET /api/v1/dashboard/overview
Authorization: Bearer <token>
```

#### 2. View Users
```http
GET /api/v1/dashboard/users?page=1&limit=100&search=john&sortBy=createdAt:DESC
Authorization: Bearer <token>
```

#### 3. View Centers
```http
GET /api/v1/dashboard/centers?page=1&limit=100
Authorization: Bearer <token>
```

#### 4. View Vehicles
```http
GET /api/v1/dashboard/vehicles?page=1&limit=100&include=arrivals,exits
Authorization: Bearer <token>
```

#### 5. View Arrivals
```http
GET /api/v1/dashboard/arrivals?page=1&limit=100&status=arrived
Authorization: Bearer <token>
```

#### 6. View Exits
```http
GET /api/v1/dashboard/exits?page=1&limit=100
Authorization: Bearer <token>
```

#### 7. View Incoming Vehicles
```http
GET /api/v1/dashboard/incoming-vehicles?page=1&limit=100
Authorization: Bearer <token>
```

#### 8. View Processing Stages
```http
GET /api/v1/dashboard/processing-stages?page=1&limit=100
Authorization: Bearer <token>
```

#### 9. Generate QR Code
```http
POST /api/v1/dashboard/vehicles/123/qr-code
Authorization: Bearer <token>
```

**Response**:
```json
{
  "qrCodeDataUrl": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  "qrCodeString": "123",
  "vehicleId": 123,
  "vehicle": {
    "id": 1,
    "thirdPartyId": 123,
    "plate": "ABC-123",
    "model": "Model X",
    "brand": "Brand Y",
    ...
  }
}
```

### Frontend Implementation Suggestions

1. **Dashboard Layout**
   - Overview cards showing statistics
   - Recent activity feed
   - Navigation to different entity views

2. **Entity Views**
   - Table/list view with pagination
   - Search and filter functionality
   - Sortable columns
   - Detail view for individual items

3. **QR Code Generation**
   - Button/action in vehicles list
   - Modal or page showing QR code image
   - Download functionality

4. **Error Handling**
   - Handle 401 (Unauthorized) - redirect to login
   - Handle 403 (Forbidden) - show access denied message
   - Handle 404 (Not Found) - show not found message
   - Handle 500 (Server Error) - show error message

---

## Complete Frontend Setup Guide

This section provides a step-by-step guide to set up a professional, maintainable frontend dashboard using React, Vite, Tailwind CSS, and shadcn/ui.

### Prerequisites

- Node.js 18+ and npm/yarn/pnpm
- Basic knowledge of React and TypeScript

### Step 1: Initialize Vite + React + TypeScript Project

```bash
# Navigate to your project root (or create a new folder for frontend)
cd /path/to/proof-arrive-api

# Create frontend directory (or use existing empty folder)
mkdir dashboard-frontend
cd dashboard-frontend

# Initialize Vite project with React and TypeScript
npm create vite@latest . -- --template react-ts

# Install dependencies
npm install
```

### Step 2: Install Core Dependencies

```bash
# Routing
npm install react-router-dom

# Data fetching and caching
npm install @tanstack/react-query

# State management
npm install zustand

# HTTP client
npm install axios

# Form handling
npm install react-hook-form @hookform/resolvers zod

# Date handling
npm install date-fns

# Icons (Lucide React - used by shadcn)
npm install lucide-react

# QR Code display
npm install qrcode.react

# Utility libraries
npm install clsx tailwind-merge
```

### Step 3: Install and Configure Tailwind CSS

```bash
# Install Tailwind CSS and dependencies
npm install -D tailwindcss postcss autoprefixer

# Initialize Tailwind config
npx tailwindcss init -p

# Install tailwindcss-animate
npm install -D tailwindcss-animate
```

**Update `tailwind.config.js`**:

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
```

**Update `src/index.css`**:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 221.2 83.2% 53.3%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 221.2 83.2% 53.3%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 217.2 91.2% 59.8%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 224.3 76.3% 94.9%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

### Step 4: Install and Configure shadcn/ui

```bash
# Initialize shadcn/ui
npx shadcn-ui@latest init
```

**Configuration prompts** (recommended):
- Style: Default
- Base color: Slate
- CSS variables: Yes

**Install essential components**:

```bash
# Core UI components
npx shadcn-ui@latest add button
npx shadcn-ui@latest add card
npx shadcn-ui@latest add table
npx shadcn-ui@latest add input
npx shadcn-ui@latest add label
npx shadcn-ui@latest add select
npx shadcn-ui@latest add dialog
npx shadcn-ui@latest add dropdown-menu
npx shadcn-ui@latest add toast
npx shadcn-ui@latest add skeleton
npx shadcn-ui@latest add badge
npx shadcn-ui@latest add avatar
npx shadcn-ui@latest add separator
npx shadcn-ui@latest add tabs
npx shadcn-ui@latest add pagination
npx shadcn-ui@latest add alert
npx shadcn-ui@latest add sheet
```

### Step 5: Create Project Structure

Create the following directory structure:

```
dashboard-frontend/
├── public/
├── src/
│   ├── api/              # API client and endpoints
│   │   ├── client.ts     # Axios instance
│   │   ├── auth.ts       # Auth endpoints
│   │   └── dashboard.ts  # Dashboard endpoints
│   ├── components/       # React components
│   │   ├── ui/           # shadcn/ui components (auto-generated)
│   │   ├── layout/       # Layout components
│   │   ├── dashboard/    # Dashboard-specific components
│   │   └── common/       # Shared components
│   ├── hooks/            # Custom React hooks
│   ├── lib/              # Utility functions
│   │   ├── utils.ts      # General utilities
│   │   └── cn.ts         # className utility
│   ├── stores/           # Zustand stores
│   │   └── auth.store.ts # Auth state management
│   ├── types/            # TypeScript types
│   │   ├── api.types.ts  # API response types
│   │   └── index.ts
│   ├── routes/           # Route definitions
│   ├── pages/            # Page components
│   │   ├── Login.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Users.tsx
│   │   ├── Vehicles.tsx
│   │   └── ...
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── .env
├── .env.example
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

### Step 6: Environment Configuration

**Create `.env`**:

```env
VITE_API_BASE_URL=http://localhost:5000/api/v1
VITE_APP_NAME=Proof Arrive Dashboard
```

**Create `.env.example`**:

```env
VITE_API_BASE_URL=http://localhost:5000/api/v1
VITE_APP_NAME=Proof Arrive Dashboard
```

### Step 7: Core Setup Files

**Create `src/lib/utils.ts`**:

```typescript
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num)
}
```

### Step 8: API Client Setup

**Create `src/api/client.ts`**:

```typescript
import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';

// Create axios instance
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Add auth token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('accessToken');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - Handle errors and token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle 401 Unauthorized
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken) {
          const response = await axios.post(
            `${API_BASE_URL}/auth/refresh-token`,
            { refreshToken }
          );
          const { accessToken } = response.data;
          localStorage.setItem('accessToken', accessToken);
          
          // Retry original request
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return apiClient(originalRequest);
        }
      } catch (refreshError) {
        // Refresh failed, redirect to login
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);
```

**Create `src/api/auth.ts`**:

```typescript
import { apiClient } from './client';

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    accid: string;
    subid: string;
    username: string;
  };
}

export const authApi = {
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/login', credentials);
    return response.data;
  },

  refreshToken: async (refreshToken: string): Promise<{ accessToken: string }> => {
    const response = await apiClient.post<{ accessToken: string }>('/auth/refresh-token', {
      refreshToken,
    });
    return response.data;
  },

  logout: async (): Promise<void> => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  },
};
```

**Create `src/api/dashboard.ts`**:

```typescript
import { apiClient } from './client';

export interface PaginateQuery {
  page?: number;
  limit?: number;
  search?: string;
  searchBy?: string;
  sortBy?: string;
  include?: string;
}

export interface PaginateResult<T> {
  data: T[];
  meta: {
    itemsPerPage: number;
    totalItems: number;
    currentPage: number;
    totalPages: number;
    sortBy: [string, 'ASC' | 'DESC'][];
    search?: string;
    searchBy?: string[];
  };
  links: {
    first?: string;
    previous?: string;
    current: string;
    next?: string;
    last?: string;
  };
}

export interface DashboardStats {
  totalUsers: number;
  totalCenters: number;
  totalVehicles: number;
  totalArrivals: number;
  totalExits: number;
  totalIncomingVehicles: number;
  totalProcessingStages: number;
  activeVehicles: number;
  vehiclesWithQrCode: number;
  recentArrivals: number;
  recentExits: number;
}

export interface DashboardOverview {
  stats: DashboardStats;
  recentActivity: {
    latestArrivals: any[];
    latestExits: any[];
    latestVehicles: any[];
  };
  summary: {
    vehiclesByStatus: Record<string, number>;
    arrivalsByStatus: Record<string, number>;
    exitsByType: Record<string, number>;
  };
}

export interface QrCodeResponse {
  qrCodeDataUrl: string;
  qrCodeString: string;
  vehicleId: number;
  vehicle: any;
}

export const dashboardApi = {
  getOverview: async (): Promise<DashboardOverview> => {
    const response = await apiClient.get<DashboardOverview>('/dashboard/overview');
    return response.data;
  },

  getUsers: async (query?: PaginateQuery): Promise<PaginateResult<any>> => {
    const response = await apiClient.get<PaginateResult<any>>('/dashboard/users', {
      params: query,
    });
    return response.data;
  },

  getCenters: async (query?: PaginateQuery): Promise<PaginateResult<any>> => {
    const response = await apiClient.get<PaginateResult<any>>('/dashboard/centers', {
      params: query,
    });
    return response.data;
  },

  getVehicles: async (query?: PaginateQuery): Promise<PaginateResult<any>> => {
    const response = await apiClient.get<PaginateResult<any>>('/dashboard/vehicles', {
      params: query,
    });
    return response.data;
  },

  getArrivals: async (query?: PaginateQuery): Promise<PaginateResult<any>> => {
    const response = await apiClient.get<PaginateResult<any>>('/dashboard/arrivals', {
      params: query,
    });
    return response.data;
  },

  getExits: async (query?: PaginateQuery): Promise<PaginateResult<any>> => {
    const response = await apiClient.get<PaginateResult<any>>('/dashboard/exits', {
      params: query,
    });
    return response.data;
  },

  getIncomingVehicles: async (query?: PaginateQuery): Promise<PaginateResult<any>> => {
    const response = await apiClient.get<PaginateResult<any>>('/dashboard/incoming-vehicles', {
      params: query,
    });
    return response.data;
  },

  getProcessingStages: async (query?: PaginateQuery): Promise<PaginateResult<any>> => {
    const response = await apiClient.get<PaginateResult<any>>('/dashboard/processing-stages', {
      params: query,
    });
    return response.data;
  },

  generateQrCode: async (vehicleId: string | number): Promise<QrCodeResponse> => {
    const response = await apiClient.post<QrCodeResponse>(
      `/dashboard/vehicles/${vehicleId}/qr-code`
    );
    return response.data;
  },
};
```

### Step 9: State Management (Zustand)

**Create `src/stores/auth.store.ts`**:

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  accid: string;
  subid: string;
  username: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      setAuth: (user, accessToken, refreshToken) => {
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        set({
          user,
          accessToken,
          refreshToken,
          isAuthenticated: true,
        });
      },
      clearAuth: () => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });
      },
    }),
    {
      name: 'auth-storage',
    }
  )
);
```

### Step 10: React Query Setup

**Update `vite.config.ts` for path aliases**:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

**Update `tsconfig.json`**:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

**Create `src/App.tsx`**:

```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { useAuthStore } from './stores/auth.store';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Vehicles from './pages/Vehicles';
import Centers from './pages/Centers';
import Arrivals from './pages/Arrivals';
import Exits from './pages/Exits';
import IncomingVehicles from './pages/IncomingVehicles';
import ProcessingStages from './pages/ProcessingStages';
import Layout from './components/layout/Layout';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

// Protected Route Component
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="users" element={<Users />} />
            <Route path="vehicles" element={<Vehicles />} />
            <Route path="centers" element={<Centers />} />
            <Route path="arrivals" element={<Arrivals />} />
            <Route path="exits" element={<Exits />} />
            <Route path="incoming-vehicles" element={<IncomingVehicles />} />
            <Route path="processing-stages" element={<ProcessingStages />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export default App;
```

### Step 11: Example Components

**Create `src/components/layout/Layout.tsx`**:

```typescript
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard,
  Users,
  Car,
  Building2,
  ArrowRightLeft,
  LogOut,
  Package,
  Truck,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Users', href: '/users', icon: Users },
  { name: 'Vehicles', href: '/vehicles', icon: Car },
  { name: 'Centers', href: '/centers', icon: Building2 },
  { name: 'Arrivals', href: '/arrivals', icon: ArrowRightLeft },
  { name: 'Exits', href: '/exits', icon: LogOut },
  { name: 'Incoming Vehicles', href: '/incoming-vehicles', icon: Truck },
  { name: 'Processing Stages', href: '/processing-stages', icon: Package },
];

export default function Layout() {
  const location = useLocation();
  const { user, clearAuth } = useAuthStore();

  const handleLogout = () => {
    clearAuth();
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="flex h-screen">
        {/* Sidebar */}
        <aside className="w-64 border-r bg-card">
          <div className="flex h-full flex-col">
            <div className="flex h-16 items-center border-b px-6">
              <h1 className="text-xl font-bold">Proof Arrive</h1>
            </div>
            <nav className="flex-1 space-y-1 p-4">
              {navigation.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    {item.name}
                  </Link>
                );
              })}
            </nav>
            <div className="border-t p-4">
              <div className="mb-2 px-3 text-sm text-muted-foreground">
                {user?.username}
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={handleLogout}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </Button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
```

**Create `src/pages/Login.tsx`**:

```typescript
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken, data.refreshToken);
      navigate('/');
    },
    onError: (err: any) => {
      setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    loginMutation.mutate({ username, password });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Login</CardTitle>
          <CardDescription>Enter your credentials to access the dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={loginMutation.isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loginMutation.isPending}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
              {loginMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Login
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

### Step 12: Development Scripts

**Update `package.json` scripts**:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
    "preview": "vite preview"
  }
}
```

### Step 13: Additional Dependencies

```bash
# ESLint for React
npm install -D eslint-plugin-react eslint-plugin-react-hooks eslint-plugin-react-refresh

# Prettier
npm install -D prettier eslint-config-prettier

# TypeScript types
npm install -D @types/node
```

### Step 14: Run the Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:5173` (or the port Vite assigns).

### Best Practices & Maintainability

1. **Component Organization**
   - Keep components small and focused
   - Use composition over inheritance
   - Extract reusable logic into custom hooks

2. **Type Safety**
   - Define types for all API responses
   - Use TypeScript strictly
   - Avoid `any` types

3. **Error Handling**
   - Use React Query's error handling
   - Show user-friendly error messages
   - Implement error boundaries

4. **Performance**
   - Use React.memo for expensive components
   - Implement virtual scrolling for large lists
   - Lazy load routes

5. **Code Quality**
   - Use ESLint and Prettier
   - Follow consistent naming conventions
   - Write meaningful comments

### Next Steps

1. Implement remaining pages (Dashboard, Users, Vehicles, etc.)
2. Add data tables with pagination
3. Implement search and filtering
4. Add QR code display component
5. Implement error boundaries
6. Add loading states and skeletons
7. Implement responsive design
8. Add dark mode toggle (if needed)

---

## Implementation Steps

### Phase 1: Setup Dashboard Module

1. **Create Dashboard Module Directory**
   ```bash
   mkdir -p src/modules/dashboard/dto
   mkdir -p src/modules/dashboard/interfaces
   ```

2. **Create DTOs**
   - Create `dashboard-query.dto.ts`
   - Create `dashboard-stats.dto.ts`
   - Create `dashboard-filters.dto.ts`
   - Create `dto/index.ts`

3. **Create Interfaces**
   - Create `dashboard-stats.interface.ts`
   - Create `dashboard-overview.interface.ts`
   - Create `interfaces/index.ts`

4. **Create Dashboard Service**
   - Create `dashboard.service.ts`
   - Implement all getter methods
   - Implement statistics aggregation methods

5. **Create Dashboard Controller**
   - Create `dashboard.controller.ts`
   - Implement all GET endpoints
   - Implement QR code generation endpoint

6. **Create Dashboard Module**
   - Create `dashboard.module.ts`
   - Import required modules
   - Register controller and service

### Phase 2: Register Dashboard Module

1. **Update App Module**
   - Add `DashboardModule` to `app.module.ts` imports

2. **Verify Module Exports**
   - Ensure all imported modules (UsersModule, CentersModule, etc.) export their services

### Phase 3: Testing

1. **Unit Tests**
   - Test dashboard service methods
   - Test statistics aggregation
   - Test pagination and filtering

2. **Integration Tests**
   - Test all dashboard endpoints
   - Test authentication and authorization
   - Test QR code generation

3. **E2E Tests**
   - Test complete dashboard flow
   - Test with different user roles

### Phase 4: Documentation

1. **Update Swagger Documentation**
   - All endpoints should be automatically documented via Swagger decorators

2. **Update README**
   - Add dashboard section to README.md
   - Document dashboard endpoints

### Phase 5: Frontend Integration

1. **API Client Setup**
   - Create API client with authentication
   - Implement token refresh logic

2. **Dashboard Components**
   - Overview component
   - Entity list components
   - QR code generation component

3. **Error Handling**
   - Implement error handling
   - Implement loading states

---

## Security Considerations

1. **Authentication**: All dashboard endpoints require valid JWT token
2. **Authorization**: QR code generation requires admin/manager role
3. **Multi-tenancy**: All queries filter by `accountId` from user credentials
4. **Input Validation**: All query parameters are validated via DTOs
5. **SQL Injection**: Using Drizzle ORM prevents SQL injection
6. **Rate Limiting**: Consider implementing rate limiting for dashboard endpoints

---

## Performance Considerations

1. **Pagination**: All list endpoints support pagination to limit data transfer
2. **Indexing**: Database indexes are already in place for efficient queries
3. **Caching**: Consider caching dashboard statistics (optional)
4. **Lazy Loading**: Relations are loaded only when requested via `include` parameter

---

## Future Enhancements

1. **Real-time Updates**: WebSocket support for live dashboard updates
2. **Advanced Filtering**: More complex filter combinations
3. **Export Functionality**: Export data to CSV/Excel
4. **Dashboard Customization**: User-configurable dashboard layouts
5. **Charts and Graphs**: Visual representation of statistics
6. **Notifications**: Alert system for important events

---

## Summary

This implementation plan provides a complete blueprint for building a comprehensive dashboard that:

- ✅ Allows viewing all entities (users, centers, vehicles, arrivals, exits, incoming vehicles, processing stages)
- ✅ Provides aggregated statistics and overview
- ✅ Supports pagination, filtering, searching, and sorting
- ✅ Includes QR code generation as the only action
- ✅ Uses existing authentication and authorization
- ✅ Maintains multi-tenancy security
- ✅ Follows existing code patterns and conventions

The dashboard is designed to be read-only (except QR code generation) and provides a centralized view of all system data for monitoring and management purposes.
