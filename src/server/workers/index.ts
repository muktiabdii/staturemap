import "dotenv/config";

// Import workers to register them — add new workers here as domains are built
import "./region-resolution.worker";

console.error("[worker] BullMQ workers started");
