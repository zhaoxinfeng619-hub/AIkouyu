import { rtcHandler } from '../AI口语搭子/app/server/vercel-rtc.mjs';
export default (req, res) => rtcHandler()(req, res, 'local-token');
