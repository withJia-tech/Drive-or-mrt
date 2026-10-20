// Vercel adapter. All logic is in ../handler.js so the host can change.
import { handle } from '../handler.js';

export function GET(request) { return handle(request, process.env); }
export function OPTIONS(request) { return handle(request, process.env); }
