import { db } from "../config/firebase.js";

export function createBatch() {
  return db.batch();
}
