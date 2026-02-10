import { relations } from 'drizzle-orm';
import { centers } from './centers.schema';
import { geozones } from './geozones.schema';
import { vehicles } from './vehicles.schema';
import { vehicleGroups } from './vehicle-groups.schema';
import { qrCodes } from './qr-codes.schema';
import { users } from './users.schema';
import { arrivals } from './arrivals.schema';
import { exits } from './exits.schema';
import { processingStages } from './processing-stages.schema';
import { vehicleStatusHistory } from './vehicle-status-history.schema';

// Centers Relations
export const centersRelations = relations(centers, ({ one, many }) => ({
  // Geozone relation (application-level, no FK constraint)
  geozone: one(geozones, {
    fields: [centers.geozoneId],
    references: [geozones.id],
  }),
  // One center can have many arrivals
  arrivals: many(arrivals),
  // One center can have many exits
  exits: many(exits),
  // One center can have many vehicles assigned to it
  vehicles: many(vehicles, {
    relationName: 'assignedCenter',
  }),
  // One center can have many vehicles currently located there
  currentVehicles: many(vehicles, {
    relationName: 'currentCenter',
  }),
  // One center can appear in many vehicle status history records
  vehicleStatusHistory: many(vehicleStatusHistory),
}));

// Vehicle Groups Relations
export const vehicleGroupsRelations = relations(vehicleGroups, ({ many }) => ({
  // One group can have many vehicles
  vehicles: many(vehicles),
}));

// Vehicles Relations
export const vehiclesRelations = relations(vehicles, ({ one, many }) => ({
  // One vehicle belongs to one group (optional)
  group: one(vehicleGroups, {
    fields: [vehicles.groupId],
    references: [vehicleGroups.id],
  }),
  // One vehicle is assigned to one center (optional, can be updated manually)
  assignedCenter: one(centers, {
    fields: [vehicles.centerId],
    references: [centers.id],
    relationName: 'assignedCenter',
  }),
  // One vehicle has at most one QR code (1:1)
  qrCode: one(qrCodes),
  // One vehicle can have many arrivals
  arrivals: many(arrivals),
  // One vehicle can have many exits
  exits: many(exits),
  // One vehicle has a current center (where it's currently located)
  currentCenter: one(centers, {
    fields: [vehicles.currentCenterId],
    references: [centers.id],
    relationName: 'currentCenter',
  }),
  // One vehicle can have many status history records
  statusHistory: many(vehicleStatusHistory),
}));

// QR Codes Relations
export const qrCodesRelations = relations(qrCodes, ({ one }) => ({
  // One QR code belongs to one vehicle (referenced by thirdPartyId + accountId)
  vehicle: one(vehicles, {
    fields: [qrCodes.accountId, qrCodes.vehicleThirdPartyId],
    references: [vehicles.accountId, vehicles.thirdPartyId],
  }),
}));

// Users Relations
export const usersRelations = relations(users, ({ many }) => ({
  // One user (agent) can have many arrivals
  arrivals: many(arrivals),
  // One user (agent) can have many exits
  exits: many(exits),
  // One user can create many arrivals
  createdArrivals: many(arrivals, {
    relationName: 'createdBy',
  }),
  // One user can create many exits
  createdExits: many(exits, {
    relationName: 'createdBy',
  }),
}));

// Arrivals Relations
export const arrivalsRelations = relations(arrivals, ({ one, many }) => ({
  // One arrival belongs to one vehicle (using thirdPartyId as FK)
  vehicle: one(vehicles, {
    fields: [arrivals.vehicleId],
    references: [vehicles.thirdPartyId],
  }),
  // One arrival belongs to one center (using geozoneId as FK)
  center: one(centers, {
    fields: [arrivals.centerId],
    references: [centers.geozoneId],
  }),
  // One arrival belongs to one agent (user)
  agent: one(users, {
    fields: [arrivals.agentId],
    references: [users.id],
  }),
  // One arrival was created by one user
  creator: one(users, {
    fields: [arrivals.createdBy],
    references: [users.id],
    relationName: 'createdBy',
  }),
  // One arrival can have many processing stages
  processingStages: many(processingStages),
}));

// Exits Relations
export const exitsRelations = relations(exits, ({ one, many }) => ({
  // One exit belongs to one vehicle (using thirdPartyId as FK)
  vehicle: one(vehicles, {
    fields: [exits.vehicleId],
    references: [vehicles.thirdPartyId],
  }),
  // One exit belongs to one center (using geozoneId as FK)
  center: one(centers, {
    fields: [exits.centerId],
    references: [centers.geozoneId],
  }),
  // One exit belongs to one agent (user)
  agent: one(users, {
    fields: [exits.agentId],
    references: [users.id],
  }),
  // One exit was created by one user
  creator: one(users, {
    fields: [exits.createdBy],
    references: [users.id],
    relationName: 'createdBy',
  }),
  // One exit can have an optional destination center (using geozoneId as FK)
  destinationCenter: one(centers, {
    fields: [exits.destinationCenterId],
    references: [centers.geozoneId],
    relationName: 'destinationCenter',
  }),
}));

// Processing Stages Relations
export const processingStagesRelations = relations(processingStages, ({ one }) => ({
  // One processing stage belongs to one arrival
  arrival: one(arrivals, {
    fields: [processingStages.arrivalId],
    references: [arrivals.id],
  }),
}));

// Vehicle Status History Relations
export const vehicleStatusHistoryRelations = relations(vehicleStatusHistory, ({ one }) => ({
  // One status history record belongs to one vehicle
  vehicle: one(vehicles, {
    fields: [vehicleStatusHistory.vehicleId],
    references: [vehicles.id],
  }),
  // One status history record can reference one center (where vehicle was/is located)
  center: one(centers, {
    fields: [vehicleStatusHistory.centerId],
    references: [centers.id],
  }),
}));

// Geozones Relations
export const geozonesRelations = relations(geozones, ({ one }) => ({
  // One geozone can belong to one center (optional)
  center: one(centers, {
    fields: [geozones.centerId],
    references: [centers.id],
  }),
}));

