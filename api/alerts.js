// Vercel function at /api/alerts, served from the same project as the app
// (driveormrt.vercel.app). All logic lives in ../proxy/handler.js.
import { handle } from '../proxy/handler.js';

export function GET(request) { return handle(request, process.env); }
export function OPTIONS(request) { return handle(request, process.env); }
