import { relations } from 'drizzle-orm';
import { centers } from './centers.schema';
import { geozones } from './geozones.schema';
import { vehicles } from './vehicles.schema';
import { vehicleGroups } from './vehicle-groups.schema';
import { qrCodes } from './qr-codes.schema';
import { users } from './users.schema';
import { vehicleStatusHistory } from './vehicle-status-history.schema';
import { trips } from './trips.schema';
import { tripEvents } from './trip-events.schema';
import { centerQueues } from './center-queues.schema';

// Centers Relations
export const centersRelations = relations(centers, ({ one, many }) => ({
  // Geozone relation (application-level, no FK constraint)
  geozone: one(geozones, {
    fields: [centers.geozoneId],
    references: [geozones.id],
  }),
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
  // One center can be origin for many trips
  originTrips: many(trips, {
    relationName: 'originCenter',
  }),
  // One center can be destination for many trips
  destinationTrips: many(trips, {
    relationName: 'destinationCenter',
  }),
  // One center can have many trip events
  tripEvents: many(tripEvents),
  // One center can have many queue entries
  queues: many(centerQueues),
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
  // One vehicle has a current center (where it's currently located)
  currentCenter: one(centers, {
    fields: [vehicles.currentCenterId],
    references: [centers.id],
    relationName: 'currentCenter',
  }),
  // One vehicle can have many status history records
  statusHistory: many(vehicleStatusHistory),
  // One vehicle can have many trips
  trips: many(trips),
  // One vehicle can have many queue entries
  queueEntries: many(centerQueues),
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
  // One user (agent) can record many trip events
  tripEvents: many(tripEvents),
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

// Trips Relations
export const tripsRelations = relations(trips, ({ one, many }) => ({
  // One trip belongs to one vehicle
  vehicle: one(vehicles, {
    fields: [trips.vehicleId],
    references: [vehicles.id],
  }),
  // One trip starts at one origin center
  originCenter: one(centers, {
    fields: [trips.originCenterId],
    references: [centers.id],
    relationName: 'originCenter',
  }),
  // One trip can have one destination center (optional, set when ready to exit)
  destinationCenter: one(centers, {
    fields: [trips.destinationCenterId],
    references: [centers.id],
    relationName: 'destinationCenter',
  }),
  // One trip can have many events
  events: many(tripEvents),
  // One trip can have queue entries
  queueEntries: many(centerQueues),
}));

// Trip Events Relations
export const tripEventsRelations = relations(tripEvents, ({ one }) => ({
  // One trip event belongs to one trip
  trip: one(trips, {
    fields: [tripEvents.tripId],
    references: [trips.id],
  }),
  // One trip event occurs at one center
  center: one(centers, {
    fields: [tripEvents.centerId],
    references: [centers.id],
  }),
  // One trip event is recorded by one agent (user)
  agent: one(users, {
    fields: [tripEvents.agentId],
    references: [users.id],
  }),
}));

// Center Queues Relations
export const centerQueuesRelations = relations(centerQueues, ({ one }) => ({
  // One queue entry belongs to one center
  center: one(centers, {
    fields: [centerQueues.centerId],
    references: [centers.id],
  }),
  // One queue entry belongs to one vehicle
  vehicle: one(vehicles, {
    fields: [centerQueues.vehicleId],
    references: [vehicles.id],
  }),
  // One queue entry belongs to one trip
  trip: one(trips, {
    fields: [centerQueues.tripId],
    references: [trips.id],
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

