/**
 * Controller Layer — Barrel Export
 *
 * @module fhir-server/controller
 */

export { handleCreate, handleRead, handleUpdate, handleDelete, handleVRead } from "./crud-controller.js";
export { handleSearch } from "./search-controller.js";
export { handleHistoryInstance } from "./history-controller.js";
export { handleBundle } from "./bundle-controller.js";
