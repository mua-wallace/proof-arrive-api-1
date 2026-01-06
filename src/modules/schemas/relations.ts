import { relations } from 'drizzle-orm';
import { centers } from './centers.schema';
import { geozones } from './geozones.schema';
import { vehicles } from './vehicles.schema';
import { users } from './users.schema';
import { arrivals } from './arrivals.schema';
import { exits } from './exits.schema';
import { processingStages } from './processing-stages.schema';
import { incomingVehicles } from './incoming-vehicles.schema';

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
  // One center can be a destination for many incoming vehicles
  incomingVehiclesAsDestination: many(incomingVehicles, {
    relationName: 'destinationCenter',
  }),
  // One center can be a source for many incoming vehicles
  incomingVehiclesAsSource: many(incomingVehicles, {
    relationName: 'sourceCenter',
  }),
}));

// Vehicles Relations
export const vehiclesRelations = relations(vehicles, ({ many }) => ({
  // One vehicle can have many arrivals
  arrivals: many(arrivals),
  // One vehicle can have many exits
  exits: many(exits),
  // One vehicle can have many incoming vehicle records
  incomingVehicles: many(incomingVehicles),
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
  // One user can create many incoming vehicles
  createdIncomingVehicles: many(incomingVehicles),
}));

// Arrivals Relations
export const arrivalsRelations = relations(arrivals, ({ one, many }) => ({
  // One arrival belongs to one vehicle
  vehicle: one(vehicles, {
    fields: [arrivals.vehicleId],
    references: [vehicles.id],
  }),
  // One arrival belongs to one center
  center: one(centers, {
    fields: [arrivals.centerId],
    references: [centers.id],
  }),
  // One arrival belongs to one agent (user)
  agent: one(users, {
    fields: [arrivals.agentId],
    references: [users.accid],
  }),
  // One arrival was created by one user
  creator: one(users, {
    fields: [arrivals.createdBy],
    references: [users.accid],
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
    references: [users.accid],
  }),
  // One exit was created by one user
  creator: one(users, {
    fields: [exits.createdBy],
    references: [users.accid],
    relationName: 'createdBy',
  }),
  // One exit can have an optional destination center (using geozoneId as FK)
  destinationCenter: one(centers, {
    fields: [exits.destinationCenterId],
    references: [centers.geozoneId],
    relationName: 'destinationCenter',
  }),
  // One exit can have one incoming vehicle record
  incomingVehicle: one(incomingVehicles, {
    fields: [exits.id],
    references: [incomingVehicles.exitId],
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

// Incoming Vehicles Relations
export const incomingVehiclesRelations = relations(incomingVehicles, ({ one }) => ({
  // One incoming vehicle record belongs to one exit
  exit: one(exits, {
    fields: [incomingVehicles.exitId],
    references: [exits.id],
  }),
  // One incoming vehicle record belongs to one vehicle
  vehicle: one(vehicles, {
    fields: [incomingVehicles.vehicleId],
    references: [vehicles.id],
  }),
  // One incoming vehicle record has one destination center
  destinationCenter: one(centers, {
    fields: [incomingVehicles.destinationCenterId],
    references: [centers.id],
    relationName: 'destinationCenter',
  }),
  // One incoming vehicle record has one source center
  sourceCenter: one(centers, {
    fields: [incomingVehicles.sourceCenterId],
    references: [centers.id],
    relationName: 'sourceCenter',
  }),
  // One incoming vehicle record was created by one user
  creator: one(users, {
    fields: [incomingVehicles.createdBy],
    references: [users.accid],
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

